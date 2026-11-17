import { MedusaError } from "@medusajs/framework/utils"

/**
 * Bundles (issue #112) are stored without any new data model:
 *
 * - A bundle is a normal product with ONE variant that has its own prices.
 * - The bundle variant is linked (the existing inventory-kit link, which carries
 *   `required_quantity`) to the inventory items of every component. Because of
 *   that, reservations and availability already work per component with no
 *   changes to the cart or inventory code.
 * - The list of components (variant + quantity) is kept in
 *   `product.metadata.bundle.components`. We need it because the merged inventory
 *   links alone can't be turned back into "variant X, quantity N".
 *
 * Everything in this file is a pure function (no container access) so it can be
 * unit tested directly.
 */

/**
 * Key inside `product.metadata` that marks a product as a bundle.
 * Only the bundle workflows are allowed to write it.
 */
export const BUNDLE_METADATA_KEY = "bundle"

/**
 * One component of a bundle as sent by the client.
 */
export type BundleComponentInput = {
  variant_id: string
  quantity: number
}

/**
 * A component variant after it was loaded from the database. Only the fields the
 * validation needs are included.
 */
export type BundleComponentVariant = {
  id: string
  manage_inventory?: boolean | null
  product?: { id?: string; metadata?: Record<string, unknown> | null } | null
  inventory_items?:
    | { inventory_item_id: string; required_quantity: number }[]
    | null
}

/**
 * An inventory item link that the bundle variant needs.
 */
export type BundleInventoryLink = {
  inventory_item_id: string
  required_quantity: number
}

/**
 * Smallest number of components a bundle can have.
 */
export const MIN_BUNDLE_COMPONENTS = 2

/**
 * Returns true when the product metadata marks the product as a bundle.
 */
export function isBundleMetadata(
  metadata?: Record<string, unknown> | null
): boolean {
  return getBundleComponents(metadata) !== null
}

/**
 * Reads the component list from the product metadata.
 * Returns `null` when the product is not a bundle.
 */
export function getBundleComponents(
  metadata?: Record<string, unknown> | null
): BundleComponentInput[] | null {
  const bundle = metadata?.[BUNDLE_METADATA_KEY] as
    | { components?: BundleComponentInput[] }
    | undefined

  if (!bundle || !Array.isArray(bundle.components)) {
    return null
  }

  return bundle.components
}

/**
 * Checks the components of a bundle and throws a `MedusaError` with a clear
 * message for the first problem found. This is the single place for the rules of
 * issue #112 acceptance criterion 7.
 *
 * @param components - what the client sent
 * @param variants - the component variants loaded from the database
 */
export function validateBundleComponents(
  components: BundleComponentInput[],
  variants: BundleComponentVariant[]
): void {
  // Fewer than 2 components is not a bundle.
  if (!components || components.length < MIN_BUNDLE_COMPONENTS) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `A bundle needs at least ${MIN_BUNDLE_COMPONENTS} components.`
    )
  }

  // The same variant can't be listed twice (use a larger quantity instead).
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const component of components) {
    if (seen.has(component.variant_id)) {
      duplicates.add(component.variant_id)
    }
    seen.add(component.variant_id)
  }
  if (duplicates.size) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Bundle components must be unique. Variants listed more than once: ${[
        ...duplicates,
      ].join(", ")}. Use the quantity field instead.`
    )
  }

  // Quantities must be whole numbers of at least 1.
  const badQuantity = components.filter(
    (component) =>
      !Number.isInteger(component.quantity) || component.quantity <= 0
  )
  if (badQuantity.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Bundle component quantity must be a whole number greater than 0. Invalid for variants: ${badQuantity
        .map((component) => component.variant_id)
        .join(", ")}.`
    )
  }

  // Every component variant has to exist.
  const variantsById = new Map(variants.map((variant) => [variant.id, variant]))
  const missing = components
    .map((component) => component.variant_id)
    .filter((id) => !variantsById.has(id))
  if (missing.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Bundle component variants were not found: ${missing.join(", ")}.`
    )
  }

  for (const component of components) {
    const variant = variantsById.get(component.variant_id)!

    // Stock for a bundle is derived from the stock of its components, so a
    // component that doesn't track inventory can't take part.
    if (!variant.manage_inventory || !variant.inventory_items?.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Variant ${variant.id} can't be a bundle component because it doesn't track inventory.`
      )
    }

    // Bundles inside bundles are out of scope.
    if (isBundleMetadata(variant.product?.metadata)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Variant ${variant.id} can't be a bundle component because it belongs to a bundle.`
      )
    }
  }
}

/**
 * Works out which inventory items the bundle variant must be linked to.
 *
 * For each component, its variant's inventory links are copied with
 * `required_quantity = component quantity * the link's own required_quantity`.
 * If two components share an inventory item, the amounts are added together.
 *
 * Example: 2x lens (lens uses 1 item "L") + 1x kit (uses 3 of "L")
 * gives one link "L" with required_quantity 5.
 */
export function buildBundleInventoryLinks(
  components: BundleComponentInput[],
  variants: BundleComponentVariant[]
): BundleInventoryLink[] {
  const variantsById = new Map(variants.map((variant) => [variant.id, variant]))
  const merged = new Map<string, number>()

  for (const component of components) {
    const variant = variantsById.get(component.variant_id)

    for (const link of variant?.inventory_items ?? []) {
      merged.set(
        link.inventory_item_id,
        (merged.get(link.inventory_item_id) ?? 0) +
          component.quantity * link.required_quantity
      )
    }
  }

  return [...merged.entries()].map(([inventory_item_id, required_quantity]) => ({
    inventory_item_id,
    required_quantity,
  }))
}

/**
 * Finds the bundles that use any of the given variants as a component.
 *
 * @param bundles - every bundle product (id, title, metadata)
 * @param variantIds - the variants that are about to be deleted
 * @param ignoreBundleIds - bundles that are being deleted in the same request,
 *   which must not block themselves
 */
export function findBundlesUsingVariants(
  bundles: {
    id: string
    title?: string | null
    metadata?: Record<string, unknown> | null
  }[],
  variantIds: string[],
  ignoreBundleIds: string[] = []
): { id: string; title?: string | null }[] {
  const targets = new Set(variantIds)
  const ignored = new Set(ignoreBundleIds)

  return bundles
    .filter((bundle) => !ignored.has(bundle.id))
    .filter((bundle) =>
      (getBundleComponents(bundle.metadata) ?? []).some((component) =>
        targets.has(component.variant_id)
      )
    )
    .map(({ id, title }) => ({ id, title }))
}

/**
 * Throws when the given variants are used by one or more bundles. The error
 * names every bundle so the admin knows what to edit first (AC 11).
 */
export function assertNoBundleUsesVariants(
  bundles: {
    id: string
    title?: string | null
    metadata?: Record<string, unknown> | null
  }[],
  variantIds: string[],
  ignoreBundleIds: string[] = []
): void {
  const usedBy = findBundlesUsingVariants(bundles, variantIds, ignoreBundleIds)

  if (usedBy.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `Cannot delete because it is used in the bundle(s): ${usedBy
        .map((bundle) => `"${bundle.title}" (${bundle.id})`)
        .join(", ")}. Remove it from those bundles first.`
    )
  }
}
