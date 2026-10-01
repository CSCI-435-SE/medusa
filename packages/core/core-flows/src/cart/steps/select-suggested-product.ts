import {
  CartDTO,
  MedusaPricingContext,
  ProductDTO,
  ProductVariantDTO,
  RemoteQueryFunction,
} from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  deduplicate,
  getVariantAvailability,
  isDefined,
  ProductStatus,
  QueryContext,
} from "@medusajs/framework/utils"
import { StepResponse, createStep } from "@medusajs/framework/workflows-sdk"

/**
 * The details of the suggested product to select.
 */
export interface SelectSuggestedProductStepInput {
  /**
   * The IDs of the preferred products, in priority order. The first eligible
   * product among them is selected. If none is eligible, the first eligible
   * product in the catalog is selected instead.
   */
  product_ids: string[]
  /**
   * The IDs of products that must not be selected, such as products already
   * in the cart.
   */
  exclude_product_ids?: string[]
  /**
   * The cart to select a product for. Its sales channel scopes product
   * eligibility and stock, and its region, currency, and customer set the
   * pricing context.
   */
  cart: Pick<CartDTO, "sales_channel_id" | "region_id" | "currency_code"> & {
    customer?: { groups?: { id: string }[] } | null
  }
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
]

/**
 * The number of catalog products checked at a time when falling back to the
 * first eligible product.
 */
const FALLBACK_BATCH_SIZE = 50

type SuggestedProductVariant = ProductVariantDTO & {
  calculated_price?: { calculated_amount?: number | null } | null
}

type Query = Omit<RemoteQueryFunction, symbol>

/**
 * Returns the first product, in the given order, that can be added to the
 * cart, with only its eligible variants, or `null` if none can.
 */
async function findFirstEligibleProduct(
  query: Query,
  productIds: string[],
  {
    salesChannelId,
    pricingContext,
    fields,
  }: {
    salesChannelId: string
    pricingContext: MedusaPricingContext
    fields: string[]
  }
): Promise<ProductDTO | null> {
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

  const { data: products } = await query.graph({
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

  const canBeAdded = (variant: SuggestedProductVariant) => {
    if (!isDefined(variant.calculated_price?.calculated_amount)) {
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
    ).filter(canBeAdded)

    if (eligibleVariants.length) {
      return { ...product, variants: eligibleVariants } as ProductDTO
    }
  }

  return null
}

export const selectSuggestedProductStepId = "select-suggested-product"
/**
 * This step selects a product that can be added to the cart. It first checks
 * the preferred products in the given order. If none of them is eligible, it
 * falls back to the first eligible product in the catalog, ordered by creation
 * date. Products to exclude are never selected.
 *
 * A product is eligible if it's published, available in the cart's sales
 * channel, and has at least one variant that's in stock in that sales channel
 * and priced in the cart's currency. The product is returned with only its
 * eligible variants, or `null` if no product in the catalog is eligible.
 *
 * @example
 * const product = selectSuggestedProductStep({
 *   product_ids: ["prod_123", "prod_456"],
 *   exclude_product_ids: ["prod_789"],
 *   cart: {
 *     sales_channel_id: "sc_123",
 *     region_id: "reg_123",
 *     currency_code: "usd",
 *   },
 *   fields: ["id", "title", "*variants"],
 * })
 */
export const selectSuggestedProductStep = createStep(
  selectSuggestedProductStepId,
  async (data: SelectSuggestedProductStepInput, { container }) => {
    const salesChannelId = data.cart.sales_channel_id

    if (!salesChannelId) {
      return new StepResponse(null)
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const pricingContext: MedusaPricingContext = {
      region_id: data.cart.region_id,
      currency_code: data.cart.currency_code,
    }

    if (data.cart.customer?.groups) {
      pricingContext.customer = {
        groups: data.cart.customer.groups.map((group) => ({ id: group.id })),
      }
    }

    const options = { salesChannelId, pricingContext, fields: data.fields }
    const excludedIds = new Set(data.exclude_product_ids ?? [])

    const preferredProduct = await findFirstEligibleProduct(
      query,
      data.product_ids.filter((id) => !excludedIds.has(id)),
      options
    )

    if (preferredProduct) {
      return new StepResponse(preferredProduct)
    }

    // None of the preferred products can be added, so fall back to the first
    // eligible product in the catalog. The preferred products were already
    // checked, so they're skipped.
    const skippedIds = [...excludedIds, ...data.product_ids]

    for (let skip = 0; ; skip += FALLBACK_BATCH_SIZE) {
      const { data: batch } = await query.graph({
        entity: "product",
        fields: ["id"],
        filters: {
          status: ProductStatus.PUBLISHED,
          ...(skippedIds.length ? { id: { $nin: skippedIds } } : {}),
        },
        pagination: {
          skip,
          take: FALLBACK_BATCH_SIZE,
          order: { created_at: "ASC", id: "ASC" },
        },
      })

      const fallbackProduct = await findFirstEligibleProduct(
        query,
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
