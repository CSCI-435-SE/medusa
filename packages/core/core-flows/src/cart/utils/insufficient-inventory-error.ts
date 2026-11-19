import type { BigNumberInput, MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MathBN,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"

/**
 * A cart or order line whose inventory item doesn't have enough stock.
 */
export type ShortInventoryItem = {
  /**
   * The ID of the inventory item without enough stock.
   */
  inventory_item_id: string
  /**
   * The ID of the line item's variant. For a bundle, this is the bundle's variant.
   */
  variant_id?: string | null
}

/**
 * A variant with the data needed to name it in an error message.
 */
export type NamedVariant = {
  id: string
  title?: string | null
  product?: {
    title?: string | null
    metadata?: Record<string, unknown> | null
    variants?: { id: string }[] | null
  } | null
  inventory_items?: { inventory_item_id: string }[] | null
}

/**
 * One out-of-stock entry: the bundle it belongs to (if any) and the name of
 * the variant that is out of stock.
 */
export type InventoryShortage = {
  bundle?: string | null
  name: string
}

const GENERIC_MESSAGE = "Some variant does not have the required inventory"

/**
 * Names a variant the way a shopper sees it: the product title, plus the
 * variant title when the product has more than one variant.
 */
export function getVariantDisplayName(variant: NamedVariant): string {
  const productTitle = variant.product?.title
  const variantTitle = variant.title

  if (!productTitle) {
    return variantTitle ?? variant.id
  }

  const hasSeveralVariants = (variant.product?.variants?.length ?? 0) > 1
  if (hasSeveralVariants && variantTitle && variantTitle !== productTitle) {
    return `${productTitle} (${variantTitle})`
  }

  return productTitle
}

function getBundleComponentIds(variant?: NamedVariant): string[] | null {
  const components = (
    variant?.product?.metadata?.bundle as
      | { components?: { variant_id: string }[] }
      | undefined
  )?.components

  return Array.isArray(components)
    ? components.map((component) => component.variant_id)
    : null
}

/**
 * Works out which products are out of stock.
 *
 * - For a normal line, the line's own variant is named.
 * - For a bundle line, the bundle's components that use the short inventory
 *   item are named, together with the bundle.
 *
 * Each shortage is listed once, even if several lines report it.
 *
 * @param shortItems - the lines and inventory items without enough stock
 * @param variants - the line items' variants, and every bundle component variant
 */
export function resolveInventoryShortages(
  shortItems: ShortInventoryItem[],
  variants: NamedVariant[]
): InventoryShortage[] {
  const variantsById = new Map(variants.map((variant) => [variant.id, variant]))
  const shortages = new Map<string, InventoryShortage>()

  const add = (shortage: InventoryShortage) => {
    shortages.set(`${shortage.bundle ?? ""}\u0000${shortage.name}`, shortage)
  }

  for (const item of shortItems) {
    const lineVariant = item.variant_id
      ? variantsById.get(item.variant_id)
      : undefined
    if (!lineVariant) {
      continue
    }

    const componentIds = getBundleComponentIds(lineVariant)
    if (!componentIds) {
      add({ name: getVariantDisplayName(lineVariant) })
      continue
    }

    const bundleName = getVariantDisplayName(lineVariant)
    const components = componentIds
      .map((id) => variantsById.get(id))
      .filter((component) =>
        component?.inventory_items?.some(
          (link) => link.inventory_item_id === item.inventory_item_id
        )
      ) as NamedVariant[]

    if (!components.length) {
      // The bundle changed since its components were saved: name the bundle.
      add({ name: bundleName })
      continue
    }

    for (const component of components) {
      add({ bundle: bundleName, name: getVariantDisplayName(component) })
    }
  }

  return [...shortages.values()]
}

/**
 * Builds the error message for out-of-stock items, grouped by bundle.
 *
 * @example
 * formatInsufficientInventoryMessage([
 *   { bundle: "Camera kit", name: "Lens" },
 *   { name: "T-shirt (L)" },
 * ])
 * // "Camera kit: Lens is out of stock. T-shirt (L) is out of stock."
 */
export function formatInsufficientInventoryMessage(
  shortages: InventoryShortage[]
): string {
  if (!shortages.length) {
    return GENERIC_MESSAGE
  }

  const groups = new Map<string, string[]>()
  for (const shortage of shortages) {
    const key = shortage.bundle ?? ""
    groups.set(key, [...(groups.get(key) ?? []), shortage.name])
  }

  const sentences: string[] = []
  for (const [bundle, names] of groups) {
    const verb = names.length > 1 ? "are" : "is"
    const list = names.join(", ")

    if (bundle) {
      sentences.push(`${bundle}: ${list} ${verb} out of stock.`)
    } else {
      for (const name of names) {
        sentences.push(`${name} is out of stock.`)
      }
    }
  }

  return sentences.join(" ")
}

/**
 * Loads the names of the out-of-stock products and returns the error to throw.
 * It only runs when stock is missing, so the extra queries don't slow down a
 * normal checkout.
 */
export async function buildInsufficientInventoryError(
  container: MedusaContainer,
  shortItems: ShortInventoryItem[]
): Promise<MedusaError> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fields = [
    "id",
    "title",
    "product.title",
    "product.metadata",
    "product.variants.id",
    "inventory_items.inventory_item_id",
  ]

  const lineVariantIds = [
    ...new Set(
      shortItems.map((item) => item.variant_id).filter(Boolean) as string[]
    ),
  ]

  let variants: NamedVariant[] = []
  if (lineVariantIds.length) {
    const { data } = await query.graph({
      entity: "variant",
      fields,
      filters: { id: lineVariantIds },
    })
    variants = data as NamedVariant[]

    const componentIds = [
      ...new Set(variants.flatMap((v) => getBundleComponentIds(v) ?? [])),
    ].filter((id) => !lineVariantIds.includes(id))

    if (componentIds.length) {
      const { data: components } = await query.graph({
        entity: "variant",
        fields,
        filters: { id: componentIds },
      })
      variants = variants.concat(components as NamedVariant[])
    }
  }

  return new MedusaError(
    MedusaError.Types.NOT_ALLOWED,
    formatInsufficientInventoryMessage(
      resolveInventoryShortages(shortItems, variants)
    ),
    MedusaError.Codes.INSUFFICIENT_INVENTORY
  )
}

/**
 * Finds the reservation lines that can't be covered by stock. Quantities of the
 * same inventory item at the same location are added up first, so a bundle and
 * a separate line for one of its components are checked together.
 */
export async function findShortReservationItems<
  T extends {
    inventory_item_id: string
    location_id?: string
    quantity: BigNumberInput
    allow_backorder?: boolean
  }
>(container: MedusaContainer, items: T[]): Promise<T[]> {
  const inventoryService = container.resolve(Modules.INVENTORY)

  const totals = new Map<string, { item: T; quantity: BigNumberInput }>()
  for (const item of items) {
    if (item.allow_backorder) {
      continue
    }
    const key = `${item.inventory_item_id}\u0000${item.location_id ?? ""}`
    const current = totals.get(key)
    totals.set(key, {
      item,
      quantity: current
        ? MathBN.add(current.quantity, item.quantity)
        : item.quantity,
    })
  }

  const shortKeys = new Set<string>()
  for (const [key, { item, quantity }] of totals) {
    const hasStock = await inventoryService.confirmInventory(
      item.inventory_item_id,
      item.location_id ? [item.location_id] : [],
      quantity
    )
    if (!hasStock) {
      shortKeys.add(key)
    }
  }

  return items.filter((item) =>
    shortKeys.has(`${item.inventory_item_id}\u0000${item.location_id ?? ""}`)
  )
}
