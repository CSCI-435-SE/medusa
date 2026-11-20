import { HttpTypes } from "@medusajs/types"

import { castNumber } from "../../../lib/cast-number"
import {
  PRODUCT_EDIT_FULL_FIELDS,
  mapProductToFormValues,
} from "../product-edit-full/utils"
import { ProductCreateSchemaType } from "../product-create/types"
import {
  normalizePrices,
  normalizeProductFormValues,
} from "../product-create/utils"

/*
 * Bundles in the admin dashboard (issue #114).
 *
 * A bundle is a normal product with one variant, its own prices, and the list
 * of component variants in `product.metadata.bundle.components` (issue #112).
 * When an order is placed, each component's share of what was paid is saved on
 * the order line in `metadata.bundle.components`, and a return of a single
 * component names it in the return item's `metadata.bundle_component`
 * (issue #113).
 *
 * The dashboard cannot import from `@medusajs/utils` (eslint
 * `admin-no-medusa-utils-import`), so the keys and the error code are repeated
 * here. They are covered by tests on both sides.
 *
 * Everything in this file is a pure function so it can be unit tested.
 */

/** Key in `product.metadata` that marks a product as a bundle. */
export const BUNDLE_METADATA_KEY = "bundle"

/** Key in an order line's metadata holding the saved component shares. */
export const BUNDLE_LINE_METADATA_KEY = "bundle"

/** Key in a return item's metadata naming the returned component. */
export const BUNDLE_COMPONENT_METADATA_KEY = "bundle_component"

/** Smallest number of components a bundle can have. */
export const MIN_BUNDLE_COMPONENTS = 2

/**
 * Code on the error thrown when deleting a product or variant that a bundle
 * uses. It is `MedusaError.Codes.BUNDLE_IN_USE` on the server.
 */
export const BUNDLE_IN_USE_ERROR_CODE = "bundle_in_use"

/** One component of a bundle, as the product stores it. */
export type BundleComponent = {
  variant_id: string
  quantity: number
}

/** One component of a bundle line item, as the order stores it. */
export type OrderBundleComponent = {
  variant_id: string
  title: string
  /** How many of the component are in one bundle. */
  quantity: number
  /** How many the whole line holds (line quantity x quantity). */
  units: number
  /** The component's share of what was paid for the line. */
  refund_share: number
}

type WithMetadata = { metadata?: Record<string, unknown> | null }

/**
 * Reads a bundle's components from product metadata. Returns `null` when the
 * product is not a bundle.
 */
export const getBundleComponents = (
  metadata?: Record<string, unknown> | null
): BundleComponent[] | null => {
  const bundle = metadata?.[BUNDLE_METADATA_KEY] as
    | { components?: unknown }
    | undefined

  if (!bundle || !Array.isArray(bundle.components)) {
    return null
  }

  return bundle.components as BundleComponent[]
}

/** True when the product is a bundle. */
export const isBundle = (product?: WithMetadata | null): boolean =>
  getBundleComponents(product?.metadata) !== null

/**
 * True when a failed request was refused because a bundle uses the product or
 * variant. Matching the code rather than the message keeps the dashboard off
 * the wording of the error (issue #114, AC 7).
 */
export const isBundleUsageError = (error?: { code?: string } | null): boolean =>
  error?.code === BUNDLE_IN_USE_ERROR_CODE

/**
 * Finds the bundles that use any of the given variants as a component. Mirrors
 * `findBundlesUsingVariants` in core-flows, which is what blocks the delete.
 *
 * @param products - products to search (only bundles can match)
 * @param variantIds - the variants being deleted
 * @param ignoreProductIds - products being deleted in the same request, which
 *   must not block themselves
 */
export const findBundlesUsingVariants = (
  products: (WithMetadata & { id: string; title?: string | null })[],
  variantIds: string[],
  ignoreProductIds: string[] = []
): { id: string; title?: string | null }[] => {
  const targets = new Set(variantIds)
  const ignored = new Set(ignoreProductIds)

  return products
    .filter((product) => !ignored.has(product.id))
    .filter((product) =>
      (getBundleComponents(product.metadata) ?? []).some((component) =>
        targets.has(component.variant_id)
      )
    )
    .map(({ id, title }) => ({ id, title }))
}

/**
 * The values a bundle form holds. The product fields are the same ones the
 * product create form uses, so its sections can render them unchanged. What a
 * bundle leaves out is `options`, `variants` and `enable_variants`.
 */
export type BundleFormValues = Omit<
  ProductCreateSchemaType,
  "options" | "variants" | "enable_variants"
> & {
  components: { variant_id: string; quantity: number | string }[]
  prices: Record<string, number | string | undefined>
}

/**
 * Turns bundle form values into the body of `POST /admin/bundles`.
 *
 * The product fields go through the product form's own normalizer, so a bundle
 * is organised exactly like any other product. `variants` and `options` are
 * dropped because the bundle workflow creates the single variant itself and the
 * route rejects them.
 */
export const normalizeBundleFormValues = (
  values: BundleFormValues & {
    status: HttpTypes.AdminProductStatus
    regionsCurrencyMap: Record<string, string>
  }
): HttpTypes.AdminCreateBundle => {
  const {
    variants: _variants,
    options: _options,
    ...productFields
  } = normalizeProductFormValues({
    ...(values as any),
    options: [],
    variants: [],
  })

  return {
    ...productFields,
    components: values.components.map((component) => ({
      variant_id: component.variant_id,
      quantity: castNumber(component.quantity),
    })),
    prices: normalizePrices(values.prices, values.regionsCurrencyMap),
  }
}

/**
 * The fields the bundle edit form needs: what the full product edit flow asks
 * for, plus the metadata that holds the component list.
 *
 * The `+` matters. A bare field name switches the API from "the default fields
 * plus these relations" to "only these fields", which drops `title`, `handle`
 * and the rest of the product's own columns and opens the form empty. `+`
 * adds to the defaults instead.
 */
export const BUNDLE_EDIT_FIELDS = `${PRODUCT_EDIT_FULL_FIELDS},+metadata`

/**
 * Turns a stored bundle into the values its form starts from (AC 2).
 *
 * The product fields go through the product edit flow's own mapper, so the
 * reused sections see exactly what they see for any other product. On top of
 * that, the components come from the product metadata and the price comes from
 * the bundle's single variant, keyed by currency code or, for a region-scoped
 * price, by region ID. `normalizeBundleFormValues` is the inverse.
 */
export const mapBundleToFormValues = (
  product: HttpTypes.AdminProduct
): BundleFormValues => {
  const {
    options: _options,
    variants,
    enable_variants: _enableVariants,
    ...productFields
  } = mapProductToFormValues(product)

  return {
    ...productFields,
    components: getBundleComponents(product.metadata) ?? [],
    prices: variants[0]?.prices ?? {},
  }
}

/**
 * Reads the components saved on an order line item when the order was placed.
 * Returns `null` when the line is not a bundle.
 */
export const getOrderLineBundleComponents = (
  item: WithMetadata
): OrderBundleComponent[] | null => {
  const bundle = item.metadata?.[BUNDLE_LINE_METADATA_KEY] as
    | { components?: unknown }
    | undefined

  if (!bundle || !Array.isArray(bundle.components)) {
    return null
  }

  return bundle.components as OrderBundleComponent[]
}

type ReturnWithItems = {
  canceled_at?: string | null
  status?: string | null
  items?: ({ item_id: string; quantity: number } & WithMetadata)[] | null
}

/**
 * How many units of each component of one bundle line item have been returned,
 * keyed by component variant ID (issue #114, AC 6).
 *
 * Only return items that name a component are counted: a whole-bundle return
 * is already shown by the line's own returned quantity. Canceled returns are
 * left out because nothing came back.
 */
export const getReturnedBundleComponentUnits = (
  returns: ReturnWithItems[],
  itemId: string
): Record<string, number> => {
  const units: Record<string, number> = {}

  for (const orderReturn of returns) {
    if (orderReturn.canceled_at || orderReturn.status === "canceled") {
      continue
    }

    for (const item of orderReturn.items ?? []) {
      if (item.item_id !== itemId) {
        continue
      }

      const component = item.metadata?.[BUNDLE_COMPONENT_METADATA_KEY] as
        | { variant_id?: string }
        | undefined

      if (!component?.variant_id) {
        continue
      }

      units[component.variant_id] =
        (units[component.variant_id] ?? 0) + Number(item.quantity ?? 0)
    }
  }

  return units
}
