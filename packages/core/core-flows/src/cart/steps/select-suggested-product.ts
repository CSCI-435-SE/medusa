import {
  FilterableShippingOptionForContextProps,
  IFulfillmentModuleService,
  ProductDTO,
  ProductVariantDTO,
  RemoteQueryFunction,
} from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  deduplicate,
  getVariantAvailability,
  isDefined,
  Modules,
  ProductStatus,
  QueryContext,
  ShippingOptionPriceType,
} from "@medusajs/framework/utils"
import { StepResponse, createStep } from "@medusajs/framework/workflows-sdk"

/**
 * The details of the suggested product to select.
 */
export interface SelectSuggestedProductStepInput {
  /**
   * The IDs of the preferred products, in priority order. The first eligible
   * product among them is selected. If none is eligible, the first eligible
   * fallback product is selected instead.
   */
  product_ids: string[]
  /**
   * The IDs of the products to fall back to when no preferred product is
   * eligible, such as the products in a cart's categories. The first eligible
   * one, ordered by creation date, is selected.
   */
  fallback_product_ids: string[]
  /**
   * The IDs of products that must not be selected, such as products already
   * in the cart.
   */
  exclude_product_ids?: string[]
  /**
   * The ID of the cart's sales channel. Only products available in this sales
   * channel, with stock at its locations, are selected. If not set, no product
   * is selected.
   */
  sales_channel_id?: string | null
  /**
   * The context to calculate variant prices with. Pass the same context the
   * cart uses for pricing, so the suggested prices match what the cart charges.
   */
  pricing_context: Record<string, unknown>
  /**
   * The cart's shipping address. If set, products that require shipping are
   * only selected if they can be shipped to it.
   */
  shipping_address?: {
    country_code?: string | null
    province?: string | null
    city?: string | null
    postal_code?: string | null
  } | null
  /**
   * The ISO 2 codes of the countries in the cart's region. If the cart has no
   * shipping address, products that require shipping are only selected if they
   * can be shipped to one of these countries.
   */
  region_country_codes: string[]
  /**
   * The product fields to retrieve.
   */
  fields: string[]
}

/**
 * The fields needed to determine whether a product's variants can be added
 * to the cart. They're always retrieved, in addition to the requested fields.
 */
const requiredProductFields = [
  "id",
  "variants.id",
  "variants.manage_inventory",
  "variants.allow_backorder",
  "variants.calculated_price.*",
  "shipping_profile.id",
  "variants.inventory_items.inventory.requires_shipping",
]

/**
 * The number of fallback products checked at a time when falling back to the
 * first eligible product.
 */
const FALLBACK_BATCH_SIZE = 50

type SuggestedProductVariant = ProductVariantDTO & {
  calculated_price?: { calculated_amount?: number | null } | null
  inventory_items?: { inventory?: { requires_shipping?: boolean } }[]
}

type SuggestedProduct = ProductDTO & {
  shipping_profile?: { id: string } | null
}

type Query = Omit<RemoteQueryFunction, symbol>

type EligibilityOptions = {
  salesChannelId: string
  pricingContext: Record<string, unknown>
  shippingAddress?: SelectSuggestedProductStepInput["shipping_address"]
  regionCountryCodes: string[]
  fields: string[]
  /**
   * Shipping lookups kept across product batches, so they're only made once
   * per shipping profile.
   */
  shippingCache: {
    fulfillmentSetIds?: string[]
    shippableByProfileId: Map<string, boolean>
  }
}

/**
 * Returns the IDs of the given shipping profiles that the cart can choose a
 * shipping option for at checkout: an option that's enabled in the store,
 * served from one of the sales channel's stock locations, delivers to the
 * cart's shipping address (or, without one, to a country in the cart's
 * region), and has a price in the cart's currency.
 */
async function getShippableProfileIds(
  query: Query,
  fulfillmentModule: IFulfillmentModuleService,
  profileIds: string[],
  options: EligibilityOptions
): Promise<Set<string>> {
  const { shippableByProfileId } = options.shippingCache

  const uncheckedProfileIds = profileIds.filter(
    (id) => !shippableByProfileId.has(id)
  )

  if (uncheckedProfileIds.length) {
    const shippableIds = await findShippableProfileIds(
      query,
      fulfillmentModule,
      uncheckedProfileIds,
      options
    )

    uncheckedProfileIds.forEach((id) => {
      shippableByProfileId.set(id, shippableIds.has(id))
    })
  }

  return new Set(profileIds.filter((id) => shippableByProfileId.get(id)))
}

async function findShippableProfileIds(
  query: Query,
  fulfillmentModule: IFulfillmentModuleService,
  profileIds: string[],
  {
    salesChannelId,
    pricingContext,
    shippingAddress,
    regionCountryCodes,
    shippingCache,
  }: EligibilityOptions
): Promise<Set<string>> {
  if (!shippingAddress?.country_code && !regionCountryCodes.length) {
    return new Set()
  }

  if (!shippingCache.fulfillmentSetIds) {
    const { data: salesChannels } = await query.graph({
      entity: "sales_channel",
      fields: ["stock_locations.fulfillment_sets.id"],
      filters: { id: salesChannelId },
    })

    shippingCache.fulfillmentSetIds = deduplicate(
      salesChannels
        .flatMap((salesChannel) => salesChannel.stock_locations ?? [])
        .flatMap((location) => location?.fulfillment_sets ?? [])
        .map((fulfillmentSet) => fulfillmentSet?.id)
        .filter((id): id is string => !!id)
    )
  }

  const fulfillmentSetIds = shippingCache.fulfillmentSetIds

  if (!fulfillmentSetIds.length) {
    return new Set()
  }

  // Without a shipping address, any delivery zone in the region's countries
  // counts, since the customer may still enter an address there.
  const destination: FilterableShippingOptionForContextProps =
    shippingAddress?.country_code
      ? {
          address: {
            country_code: shippingAddress.country_code,
            province_code: shippingAddress.province ?? undefined,
            city: shippingAddress.city ?? undefined,
            postal_expression: shippingAddress.postal_code ?? undefined,
          },
        }
      : {
          service_zone: {
            // Geo zones keep the country code as it was entered
            geo_zones: {
              country_code: deduplicate(
                regionCountryCodes.flatMap((code) => [
                  code.toLowerCase(),
                  code.toUpperCase(),
                ])
              ),
            },
          },
        }

  // The same rule context the cart uses to list its shipping options
  const shippingOptions = await fulfillmentModule.listShippingOptionsForContext(
    {
      ...destination,
      shipping_profile_id: profileIds,
      fulfillment_set_id: fulfillmentSetIds,
      context: { is_return: "false", enabled_in_store: "true" },
    },
    { select: ["id", "shipping_profile_id", "price_type"] }
  )

  if (!shippingOptions.length) {
    return new Set()
  }

  const { data: shippingOptionPrices } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "calculated_price.calculated_amount"],
    filters: { id: shippingOptions.map((option) => option.id) },
    context: {
      calculated_price: QueryContext(pricingContext),
    },
  })

  const pricedOptionIds = new Set(
    shippingOptionPrices
      .filter((option) => isDefined(option.calculated_price?.calculated_amount))
      .map((option) => option.id)
  )

  // Calculated prices come from the fulfillment provider at checkout, so
  // only flat-rate options need a price in the cart's currency
  return new Set(
    shippingOptions
      .filter(
        (option) =>
          option.price_type === ShippingOptionPriceType.CALCULATED ||
          pricedOptionIds.has(option.id)
      )
      .map((option) => option.shipping_profile_id)
  )
}

/**
 * Removes the fields only retrieved to check whether the product can be
 * shipped, unless they were requested.
 */
function withoutShippingCheckFields(
  product: SuggestedProduct,
  fields: string[]
): ProductDTO {
  const isRequested = (path: string) =>
    fields.some((field) => {
      const normalized = field.replace(/^\*/, "")

      return normalized === path || normalized.startsWith(`${path}.`)
    })

  const { shipping_profile, ...result } = product
  const keepInventoryItems = isRequested("variants.inventory_items")

  return {
    ...result,
    ...(isRequested("shipping_profile") ? { shipping_profile } : {}),
    variants: keepInventoryItems
      ? result.variants
      : (result.variants ?? []).map((variant) => {
          const { inventory_items, ...rest } =
            variant as SuggestedProductVariant

          return rest
        }),
  } as ProductDTO
}

/**
 * Returns the first product, in the given order, that can be added to the
 * cart, with only its eligible variants, or `null` if none can.
 */
async function findFirstEligibleProduct(
  query: Query,
  fulfillmentModule: IFulfillmentModuleService,
  productIds: string[],
  options: EligibilityOptions
): Promise<ProductDTO | null> {
  const { salesChannelId, pricingContext, fields } = options

  if (!productIds.length) {
    return null
  }

  const { data: productSalesChannels } = await query.graph({
    entity: "product_sales_channel",
    fields: ["product_id"],
    filters: {
      sales_channel_id: salesChannelId,
      product_id: productIds,
    },
  })

  const productIdsInSalesChannel = productSalesChannels.map(
    (link) => link.product_id as string
  )

  if (!productIdsInSalesChannel.length) {
    return null
  }

  const { data: products }: { data: SuggestedProduct[] } = await query.graph({
    entity: "product",
    fields: deduplicate([...fields, ...requiredProductFields]),
    filters: {
      id: productIdsInSalesChannel,
      status: ProductStatus.PUBLISHED,
    },
    context: {
      variants: {
        calculated_price: QueryContext(pricingContext),
      },
    },
  })

  const variants = products.flatMap(
    (product) => (product.variants ?? []) as SuggestedProductVariant[]
  )

  const variantIdsWithTrackedStock = variants
    .filter((variant) => variant.manage_inventory && !variant.allow_backorder)
    .map((variant) => variant.id)

  const availability = variantIdsWithTrackedStock.length
    ? await getVariantAvailability(query, {
        variant_ids: variantIdsWithTrackedStock,
        sales_channel_id: salesChannelId,
      })
    : {}

  const shippableProfileIds = await getShippableProfileIds(
    query,
    fulfillmentModule,
    deduplicate(
      products
        .map((product) => product.shipping_profile?.id)
        .filter((id): id is string => !!id)
    ),
    options
  )

  const canBeAdded = (
    product: SuggestedProduct,
    variant: SuggestedProductVariant
  ) => {
    if (!isDefined(variant.calculated_price?.calculated_amount)) {
      return false
    }

    // Mirrors how a line item's `requires_shipping` is set when it's added
    const requiresShipping =
      !!product.shipping_profile?.id ||
      !!variant.inventory_items?.some(
        (inventoryItem) => inventoryItem.inventory?.requires_shipping
      )

    if (
      requiresShipping &&
      !shippableProfileIds.has(product.shipping_profile?.id ?? "")
    ) {
      return false
    }

    if (!variant.manage_inventory || variant.allow_backorder) {
      return true
    }

    return (availability[variant.id]?.availability ?? 0) > 0
  }

  for (const productId of productIds) {
    const product = products.find((p) => p.id === productId)

    if (!product) {
      continue
    }

    const eligibleVariants = (
      (product.variants ?? []) as SuggestedProductVariant[]
    ).filter((variant) => canBeAdded(product, variant))

    if (eligibleVariants.length) {
      return withoutShippingCheckFields(
        { ...product, variants: eligibleVariants },
        fields
      )
    }
  }

  return null
}

export const selectSuggestedProductStepId = "select-suggested-product"
/**
 * This step selects a product that can be added to the cart. It first checks
 * the preferred products in the given order. If none of them is eligible, it
 * falls back to the first eligible fallback product, ordered by creation date.
 * Products to exclude are never selected.
 *
 * A product is eligible if it's published, available in the cart's sales
 * channel, and has at least one variant that's in stock in that sales channel,
 * priced in the cart's currency, and, if it requires shipping, can be shipped
 * to the cart's shipping address, or to the cart's region if it has no address.
 * A product can be shipped if its shipping profile has a priced shipping
 * option, enabled in the store, at one of the sales channel's locations. The product is returned with only its
 * eligible variants, or `null` if no preferred or fallback product is eligible.
 *
 * @example
 * const product = selectSuggestedProductStep({
 *   product_ids: ["prod_123", "prod_456"],
 *   fallback_product_ids: ["prod_123", "prod_456", "prod_012"],
 *   exclude_product_ids: ["prod_789"],
 *   sales_channel_id: "sc_123",
 *   pricing_context: {
 *     region_id: "reg_123",
 *     currency_code: "usd",
 *   },
 *   region_country_codes: ["us"],
 *   fields: ["id", "title", "*variants"],
 * })
 */
export const selectSuggestedProductStep = createStep(
  selectSuggestedProductStepId,
  async (data: SelectSuggestedProductStepInput, { container }) => {
    const salesChannelId = data.sales_channel_id

    if (!salesChannelId) {
      return new StepResponse(null)
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const fulfillmentModule = container.resolve<IFulfillmentModuleService>(
      Modules.FULFILLMENT
    )

    const options: EligibilityOptions = {
      salesChannelId,
      pricingContext: data.pricing_context,
      shippingAddress: data.shipping_address,
      regionCountryCodes: data.region_country_codes,
      fields: data.fields,
      shippingCache: { shippableByProfileId: new Map() },
    }
    const excludedIds = new Set(data.exclude_product_ids ?? [])

    const preferredProduct = await findFirstEligibleProduct(
      query,
      fulfillmentModule,
      data.product_ids.filter((id) => !excludedIds.has(id)),
      options
    )

    if (preferredProduct) {
      return new StepResponse(preferredProduct)
    }

    // None of the preferred products can be added, so fall back to the first
    // eligible fallback product. The preferred products were already checked,
    // so they're skipped.
    const skippedIds = new Set([...excludedIds, ...data.product_ids])
    const fallbackIds = data.fallback_product_ids.filter(
      (id) => !skippedIds.has(id)
    )

    if (!fallbackIds.length) {
      return new StepResponse(null)
    }

    for (let skip = 0; ; skip += FALLBACK_BATCH_SIZE) {
      const { data: batch } = await query.graph({
        entity: "product",
        fields: ["id"],
        filters: {
          status: ProductStatus.PUBLISHED,
          id: fallbackIds,
        },
        pagination: {
          skip,
          take: FALLBACK_BATCH_SIZE,
          order: { created_at: "ASC", id: "ASC" },
        },
      })

      const fallbackProduct = await findFirstEligibleProduct(
        query,
        fulfillmentModule,
        batch.map((product) => product.id),
        options
      )

      if (fallbackProduct) {
        return new StepResponse(fallbackProduct)
      }

      if (batch.length < FALLBACK_BATCH_SIZE) {
        return new StepResponse(null)
      }
    }
  }
)
