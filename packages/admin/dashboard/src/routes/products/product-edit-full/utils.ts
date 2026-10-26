import { HttpTypes } from "@medusajs/types"
import { castNumber } from "../../../lib/cast-number"
import { transformNullableFormNumber } from "../../../lib/form-helpers"
import { ProductCreateSchemaType } from "../product-create/types"

/**
 * Helpers for the full "Edit Product" flow.
 *
 * The edit flow deliberately re-uses the create flow's form schema
 * (`ProductCreateSchema`) and its tab components. That means everything in this
 * file is about translating between two shapes:
 *
 *   product returned by the API  --mapProductToFormValues-->  form values
 *   form values                  --buildProductEditRequests-->  API payloads
 *
 * All functions here are pure (no network, no React), which keeps them easy to
 * unit test and to review.
 */

/**
 * The fields we ask the API for when loading the product into the edit form.
 * The default product detail query omits several relations (variants, options,
 * images, ...) so we list everything the form needs explicitly.
 */
export const PRODUCT_EDIT_FULL_FIELDS = [
  "*variants",
  "*variants.prices",
  "*variants.options",
  "*variants.inventory_items",
  "*options",
  "*options.values",
  "*images",
  "*tags",
  "*categories",
  "*sales_channels",
  "*shipping_profile",
  "*type",
  "*collection",
].join(",")

/**
 * The API can return extra fields that the generated `HttpTypes` don't declare
 * (price rules, option ids on option values, inventory kit rows). This type
 * describes just the extras we read, so we avoid scattering `any` casts.
 */
type EditableVariant = Omit<
  HttpTypes.AdminProductVariant,
  "prices" | "inventory_items" | "options"
> & {
  prices?: {
    id: string
    currency_code: string
    amount: number
    rules?: Record<string, string>
  }[]
  inventory_items?: {
    inventory_item_id: string
    required_quantity: number
  }[]
  options?: {
    id: string
    value: string
    option_id?: string
    option?: { title?: string }
  }[]
}

type EditableProduct = Omit<HttpTypes.AdminProduct, "variants"> & {
  variants?: EditableVariant[] | null
  shipping_profile?: { id: string } | null
}

/**
 * The public `AdminProduct` type does not declare the extras above, so the
 * exported helpers accept `AdminProduct` and widen it once, here.
 */
const asEditable = (product: HttpTypes.AdminProduct) =>
  product as unknown as EditableProduct

/**
 * Variants in the form are identified only by their position (zod strips the
 * `id` because the create schema has no such field). Both the mapping into the
 * form and the diffing on save therefore go through this one function so the
 * order is guaranteed to be identical in both directions.
 */
export const getSortedVariants = (input: HttpTypes.AdminProduct) =>
  [...(asEditable(input).variants ?? [])].sort(
    (a, b) => (a.variant_rank ?? 0) - (b.variant_rank ?? 0)
  )

/**
 * Builds the form's `media` array from the product's images and thumbnail.
 * This mirrors `getDefaultValues` in the media edit form: the product stores
 * the thumbnail as a plain URL, so we flag the matching image, and if the
 * thumbnail is not among the images we add it as an extra entry.
 */
const getMediaDefaults = (product: EditableProduct) => {
  const media: ProductCreateSchemaType["media"] = (product.images ?? []).map(
    (image) => ({
      id: image.id,
      url: image.url,
      isThumbnail: image.url === product.thumbnail,
      file: null, // null means "already uploaded"; only new files carry a File
    })
  )

  if (
    product.thumbnail &&
    !media.some((item) => item.url === product.thumbnail)
  ) {
    media.unshift({
      url: product.thumbnail,
      isThumbnail: true,
      file: null,
    })
  }

  return media
}

/**
 * Maps one stored variant to one entry of the form's `variants` array.
 * Exported separately so `buildProductEditRequests` can recompute the
 * "initial" value of a variant and detect whether the user changed it.
 */
export const mapVariantToFormValue = (
  variant: EditableVariant,
  optionTitlesById: Record<string, string>
): ProductCreateSchemaType["variants"][number] => {
  // The form keys a variant's option values by option *title*.
  const options = (variant.options ?? []).reduce((acc, optionValue) => {
    const title =
      optionValue.option?.title ??
      (optionValue.option_id ? optionTitlesById[optionValue.option_id] : "")

    if (title) {
      acc[title] = optionValue.value
    }
    return acc
  }, {} as Record<string, string>)

  // Prices are keyed by region id (region prices) or currency code (plain
  // prices); this is the same convention the price editor uses.
  const prices = (variant.prices ?? []).reduce((acc, price) => {
    const key = price.rules?.region_id ?? price.currency_code
    acc[key] = String(price.amount)
    return acc
  }, {} as Record<string, string>)

  const kitItems = variant.inventory_items ?? []

  // A variant is treated as an "inventory kit" when it maps to more than one
  // inventory item, or to a single item that needs more than one unit.
  const isKit =
    kitItems.length > 1 ||
    (kitItems.length === 1 && kitItems[0].required_quantity !== 1)

  return {
    should_create: true, // every existing variant stays visible in the grid
    title: variant.title ?? "",
    sku: variant.sku ?? "",
    manage_inventory: !!variant.manage_inventory,
    allow_backorder: !!variant.allow_backorder,
    inventory_kit: isKit,
    options,
    variant_rank: variant.variant_rank ?? 0,
    prices,
    inventory: kitItems.length
      ? kitItems.map((item) => ({
          inventory_item_id: item.inventory_item_id,
          required_quantity: String(item.required_quantity),
        }))
      : [{ inventory_item_id: "", required_quantity: "" }],
  }
}

/**
 * Inverse of `normalizeProductFormValues` (create flow): turns a stored product
 * into the form values used to pre-fill every field of the edit flow.
 */
export const mapProductToFormValues = (
  input: HttpTypes.AdminProduct
): ProductCreateSchemaType => {
  const product = asEditable(input)
  const options = (product.options ?? []).map((option) => ({
    id: option.id,
    title: option.title,
    values: (option.values ?? []).map((v) => v.value),
    value_ids: (option.values ?? []).map((v) => v.id),
  }))

  const optionTitlesById = options.reduce((acc, option) => {
    acc[option.id!] = option.title
    return acc
  }, {} as Record<string, string>)

  return {
    title: product.title ?? "",
    subtitle: product.subtitle ?? "",
    handle: product.handle ?? "",
    description: product.description ?? "",
    discountable: !!product.discountable,
    type_id: product.type_id ?? "",
    collection_id: product.collection_id ?? "",
    shipping_profile_id: product.shipping_profile?.id ?? "",
    categories: (product.categories ?? []).map((c) => c.id),
    tags: (product.tags ?? []).map((t) => t.id),
    sales_channels: (product.sales_channels ?? []).map((sc) => ({
      id: sc.id,
      name: sc.name,
    })),
    origin_country: product.origin_country ?? "",
    material: product.material ?? "",
    // Dimensions are numbers in the API but strings in the form inputs.
    width: product.width != null ? String(product.width) : "",
    length: product.length != null ? String(product.length) : "",
    height: product.height != null ? String(product.height) : "",
    weight: product.weight != null ? String(product.weight) : "",
    mid_code: product.mid_code ?? "",
    hs_code: product.hs_code ?? "",
    options,
    // Not used by the edit flow (variants/options are edit-in-place only), but
    // required by the shared schema.
    enable_variants: (product.variants?.length ?? 0) > 1,
    variants: getSortedVariants(input).map((variant) =>
      mapVariantToFormValue(variant, optionTitlesById)
    ),
    media: getMediaDefaults(product),
  }
}

/**
 * Everything the save handler needs to send, already split per endpoint.
 * `undefined` for a key means "nothing changed, skip that call".
 */
export type ProductEditRequests = {
  variantUpdates?: HttpTypes.AdminBatchProductVariantRequest["update"]
  inventoryItems?: HttpTypes.AdminBatchProductVariantInventoryItemRequest
  product: HttpTypes.AdminUpdateProduct
}

/**
 * Converts the submitted form values into the payloads for the three API calls
 * made on save (see `ProductEditFullForm` for the order they run in).
 *
 * @param values - the validated form values
 * @param product - the product as it was loaded; used to find variant ids and
 *   to skip variants the user did not touch
 * @param media - the form's media after new files were uploaded, i.e. every
 *   entry has a final `url`
 * @param regionsCurrencyMap - region id -> currency code, for region prices
 */
export const buildProductEditRequests = ({
  values,
  product,
  media,
  regionsCurrencyMap,
}: {
  values: ProductCreateSchemaType
  product: HttpTypes.AdminProduct
  media: { id?: string; url: string; isThumbnail: boolean }[]
  regionsCurrencyMap: Record<string, string>
}): ProductEditRequests => {
  const initial = mapProductToFormValues(product)
  const storedVariants = getSortedVariants(product)

  const variantUpdates: NonNullable<ProductEditRequests["variantUpdates"]> = []
  const inventoryCreate: {
    variant_id: string
    inventory_item_id: string
    required_quantity: number
  }[] = []
  const inventoryUpdate: {
    variant_id: string
    inventory_item_id: string
    required_quantity: number
  }[] = []
  const inventoryDelete: { variant_id: string; inventory_item_id: string }[] =
    []

  values.variants.forEach((variant, index) => {
    const stored = storedVariants[index]
    const before = initial.variants[index]

    // Defensive: the grid never adds or removes rows, so this should not
    // happen, but never send an update for a variant we cannot identify.
    if (!stored || !before) {
      return
    }

    // --- Variant fields (title, sku, flags, prices) --------------------------
    // Compare field by field against the initial values so untouched variants
    // do not generate any request.
    const variantFieldsChanged =
      variant.title !== before.title ||
      (variant.sku ?? "") !== (before.sku ?? "") ||
      !!variant.manage_inventory !== !!before.manage_inventory ||
      !!variant.allow_backorder !== !!before.allow_backorder ||
      JSON.stringify(variant.prices ?? {}) !== JSON.stringify(before.prices)

    if (variantFieldsChanged) {
      variantUpdates.push({
        id: stored.id,
        title: variant.title,
        // An emptied SKU input means "remove the SKU", so send null.
        sku: variant.sku ? variant.sku : null,
        manage_inventory: !!variant.manage_inventory,
        allow_backorder: !!variant.allow_backorder,
        prices: buildPricePayload(
          variant.prices ?? {},
          stored,
          regionsCurrencyMap
        ),
      })
    }

    // --- Inventory kit ---------------------------------------------------------
    // Only diff the kit when the user has the variant marked as a kit; this
    // matches the create flow, where the inventory tab only applies to kits.
    if (variant.manage_inventory && variant.inventory_kit) {
      const desired = (variant.inventory ?? [])
        .map((item) => ({
          inventory_item_id: item.inventory_item_id,
          required_quantity: item.required_quantity
            ? castNumber(item.required_quantity)
            : 0,
        }))
        // Skip the blank placeholder row the form keeps for new entries.
        .filter((item) => item.inventory_item_id && item.required_quantity)

      const current = stored.inventory_items ?? []

      desired.forEach((item) => {
        const existing = current.find(
          (c) => c.inventory_item_id === item.inventory_item_id
        )

        if (!existing) {
          inventoryCreate.push({ variant_id: stored.id, ...item })
        } else if (existing.required_quantity !== item.required_quantity) {
          inventoryUpdate.push({ variant_id: stored.id, ...item })
        }
      })

      current.forEach((c) => {
        if (!desired.some((d) => d.inventory_item_id === c.inventory_item_id)) {
          inventoryDelete.push({
            variant_id: stored.id,
            inventory_item_id: c.inventory_item_id,
          })
        }
      })
    }
  })

  const hasInventoryChanges =
    inventoryCreate.length || inventoryUpdate.length || inventoryDelete.length

  return {
    variantUpdates: variantUpdates.length ? variantUpdates : undefined,
    inventoryItems: hasInventoryChanges
      ? {
          create: inventoryCreate,
          update: inventoryUpdate,
          delete: inventoryDelete,
        }
      : undefined,
    product: {
      title: values.title.trim(),
      // Empty strings become null so the API clears the value instead of
      // storing an empty string.
      subtitle: values.subtitle?.trim() || null,
      description: values.description?.trim() || null,
      handle: values.handle.trim(),
      discountable: values.discountable,
      type_id: values.type_id || null,
      collection_id: values.collection_id || null,
      categories: values.categories.map((id) => ({ id })),
      tags: (values.tags ?? []).map((id) => ({ id })),
      sales_channels: (values.sales_channels ?? []).map((sc) => ({
        id: sc.id,
      })),
      // The API cannot unset a shipping profile, so only send it when set.
      ...(values.shipping_profile_id
        ? { shipping_profile_id: values.shipping_profile_id }
        : {}),
      images: media.map((m) => ({ id: m.id, url: m.url })),
      thumbnail: media.find((m) => m.isThumbnail)?.url ?? null,
      origin_country: values.origin_country || null,
      material: values.material || null,
      mid_code: values.mid_code || null,
      hs_code: values.hs_code || null,
      width: transformNullableFormNumber(values.width),
      length: transformNullableFormNumber(values.length),
      height: transformNullableFormNumber(values.height),
      weight: transformNullableFormNumber(values.weight),
    },
  }
}

/**
 * Converts the form's price record (keyed by region id or currency code) into
 * the API's price array, re-using the id of an existing price so the API
 * updates it instead of creating a duplicate. Cleared cells are dropped.
 * Same logic as `product-prices/pricing-edit.tsx`.
 */
const buildPricePayload = (
  prices: Record<string, string | number | undefined>,
  stored: EditableVariant,
  regionsCurrencyMap: Record<string, string>
): HttpTypes.AdminUpdateProductVariantPrice[] => {
  return Object.entries(prices)
    .filter(([, value]) => value !== "" && typeof value !== "undefined")
    .map(([key, value]) => {
      const isRegion = key.startsWith("reg_")
      const currencyCode = isRegion ? regionsCurrencyMap[key] : key

      const existing = (stored.prices ?? []).find((p) =>
        isRegion
          ? p.rules?.region_id === key
          : p.currency_code === currencyCode &&
            Object.keys(p.rules ?? {}).length === 0
      )

      return {
        id: existing?.id,
        currency_code: currencyCode,
        amount: castNumber(value as string | number),
        ...(isRegion ? { rules: { region_id: key } } : {}),
      }
    })
}
