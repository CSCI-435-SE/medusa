import type { BigNumberInput } from "@medusajs/framework/types"
import { MathBN, MedusaError } from "@medusajs/framework/utils"

/*
 * Refund shares and single-item returns for product bundles (issue #113).
 *
 * When an order with a bundle is placed, each component's share of what was
 * paid for the bundle line is saved in the order line item's
 * `metadata.bundle.components`. A return can then name one component of the
 * bundle line (`component_variant_id`); its refund comes from that saved share
 * and only that component goes back into stock.
 *
 * Everything in this file is a pure function so it can be unit tested.
 */

/**
 * Key in a line item's metadata where the bundle components are saved, and in
 * a return item's or order change action's metadata where the returned
 * component is named.
 */
export const BUNDLE_LINE_METADATA_KEY = "bundle"
export const BUNDLE_COMPONENT_METADATA_KEY = "bundle_component"

/**
 * One component of a bundle line item, as saved on the order.
 */
export type OrderBundleComponent = {
  variant_id: string
  title: string
  /**
   * How many of the component are in one bundle.
   */
  quantity: number
  /**
   * How many of the component the whole line holds (line quantity x quantity).
   */
  units: number
  /**
   * The component's share of what was paid for the whole line.
   */
  refund_share: number
  /**
   * The component variant's inventory links, used to restock only this
   * component when it's returned.
   */
  inventory_items: { inventory_item_id: string; required_quantity: number }[]
}

/**
 * The returned component, saved on a return item and its order change actions.
 */
export type ReturnedBundleComponent = {
  variant_id: string
  title: string
  /**
   * The refund for this action (or, on a return item, for its full quantity).
   */
  amount: number
}

const toMinorUnits = (amount: BigNumberInput, precision: number): bigint => {
  const scaled = MathBN.mult(amount, Math.pow(10, precision))
  return BigInt(MathBN.convert(scaled).decimalPlaces(0).toFixed())
}

const fromMinorUnits = (amount: bigint, precision: number): number =>
  Number(amount) / Math.pow(10, precision)

/**
 * Splits what was paid for a bundle line between its components.
 *
 * Each component's share is `price x quantity / (sum over all components)`
 * of the amount paid. If any component has no price (for example none in the
 * order's currency), or every price is 0, the amount is split by quantity
 * instead.
 *
 * Shares are rounded to the currency's smallest unit and always add up exactly
 * to the amount paid: each share is rounded down, and the cents left over go
 * one each to the components with the largest remainders (the earlier
 * component wins a tie), so the same order always gives the same shares.
 *
 * @param components - the bundle's components, each with its normal unit price
 * @param lineQuantity - how many bundles the line holds
 * @param amountPaid - the line's total after discounts and including tax
 * @param precision - the currency's number of decimal digits
 */
export function computeBundleRefundShares({
  components,
  lineQuantity,
  amountPaid,
  precision,
}: {
  components: {
    variant_id: string
    title: string
    quantity: number
    unit_price?: BigNumberInput | null
    inventory_items: OrderBundleComponent["inventory_items"]
  }[]
  lineQuantity: number
  amountPaid: BigNumberInput
  precision: number
}): OrderBundleComponent[] {
  const pricesKnown = components.every(
    (component) => component.unit_price != null
  )

  let weights = components.map((component) =>
    pricesKnown
      ? toMinorUnits(component.unit_price!, precision) *
        BigInt(component.quantity)
      : BigInt(component.quantity)
  )
  if (weights.every((weight) => weight === 0n)) {
    weights = components.map((component) => BigInt(component.quantity))
  }

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0n)
  const total = toMinorUnits(amountPaid, precision)

  const shares = weights.map((weight) => (total * weight) / totalWeight)
  const remainders = weights.map((weight, i) => ({
    i,
    remainder: total * weight - shares[i] * totalWeight,
  }))

  let leftover = total - shares.reduce((sum, share) => sum + share, 0n)
  remainders.sort((a, b) =>
    a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1
  )
  for (const { i } of remainders) {
    if (leftover <= 0n) {
      break
    }
    shares[i] += 1n
    leftover -= 1n
  }

  return components.map((component, i) => ({
    variant_id: component.variant_id,
    title: component.title,
    quantity: component.quantity,
    units: component.quantity * lineQuantity,
    refund_share: fromMinorUnits(shares[i], precision),
    inventory_items: component.inventory_items,
  }))
}

/**
 * The refund for returning `quantity` more units of a component when
 * `previousUnits` were already returned.
 *
 * The share is spread over its units by rounding the running total down, so
 * any number of partial returns adds up exactly to the share once every unit is
 * returned.
 */
export function allocateComponentRefund({
  share,
  units,
  previousUnits,
  quantity,
  precision,
}: {
  share: BigNumberInput
  units: number
  previousUnits: number
  quantity: number
  precision: number
}): number {
  const total = toMinorUnits(share, precision)
  const upTo = (n: number) => (total * BigInt(n)) / BigInt(units)

  return fromMinorUnits(
    upTo(previousUnits + quantity) - upTo(previousUnits),
    precision
  )
}

/**
 * Reads the bundle components saved on an order line item. Returns `null` for
 * a line that isn't a bundle or was ordered before shares were saved.
 */
export function getOrderBundleComponents(
  metadata?: Record<string, unknown> | null
): OrderBundleComponent[] | null {
  const components = (
    metadata?.[BUNDLE_LINE_METADATA_KEY] as
      | { components?: OrderBundleComponent[] }
      | undefined
  )?.components

  return Array.isArray(components) &&
    components.every((component) => component.refund_share != null)
    ? components
    : null
}

/**
 * Reads the returned component saved on a return item or an action.
 */
export function getReturnedBundleComponent(
  metadata?: Record<string, unknown> | null
): ReturnedBundleComponent | null {
  const component = metadata?.[BUNDLE_COMPONENT_METADATA_KEY] as
    | ReturnedBundleComponent
    | undefined

  return component?.variant_id ? component : null
}

/**
 * An order line item with the fields the return checks need.
 */
export type BundleReturnOrderItem = {
  id: string
  title?: string | null
  quantity: BigNumberInput
  fulfilled_quantity?: BigNumberInput | null
  return_requested_quantity?: BigNumberInput | null
  return_received_quantity?: BigNumberInput | null
  return_dismissed_quantity?: BigNumberInput | null
  metadata?: Record<string, unknown> | null
}

/**
 * A return that already exists but isn't counted in the line item's return
 * quantities: a component return item of a return that isn't canceled, or a
 * return action (component or whole) of an order change not confirmed yet.
 */
export type ExistingBundleReturn = {
  item_id: string
  quantity: BigNumberInput
  metadata?: Record<string, unknown> | null
}

/**
 * An item of a return request, as sent by the client.
 */
export type BundleReturnRequestItem = {
  id: string
  quantity: BigNumberInput
  component_variant_id?: string | null
  metadata?: Record<string, any> | null
}

const toNumber = (value?: BigNumberInput | null) =>
  MathBN.convert(value ?? 0).toNumber()

/**
 * Removes the returned-component key from metadata sent by a client: only the
 * return workflows may set it, since it carries the refund amount.
 */
export function withoutBundleComponentMetadata<
  T extends { metadata?: Record<string, any> | null }
>(item: T): T {
  if (!item.metadata || !(BUNDLE_COMPONENT_METADATA_KEY in item.metadata)) {
    return item
  }
  const { [BUNDLE_COMPONENT_METADATA_KEY]: _ignored, ...metadata } =
    item.metadata
  return { ...item, metadata }
}

/**
 * Checks a return request against the bundles in the order and prepares the
 * items for the return workflows:
 *
 * - an item with `component_variant_id` returns that component of a bundle
 *   line. Its metadata names the component and its refund amount.
 * - an item of a bundle line without `component_variant_id` returns whole
 *   bundles, which is only allowed for bundles none of whose components were
 *   returned.
 *
 * Items of lines that aren't bundles are returned unchanged.
 *
 * @throws {MedusaError} INVALID_DATA when a component isn't in the bundle, the
 * line isn't a bundle, the order was placed before shares were saved, or more
 * is returned than is left.
 */
export function prepareBundleReturnItems<T extends BundleReturnRequestItem>({
  items,
  orderItems,
  existingReturns,
  precision,
}: {
  items: T[]
  orderItems: BundleReturnOrderItem[]
  existingReturns: ExistingBundleReturn[]
  precision: number
}): (Omit<T, "component_variant_id"> & {
  metadata?: Record<string, any> | null
})[] {
  const orderItemsById = new Map(orderItems.map((item) => [item.id, item]))

  // Units of each component (key: line + variant) and whole bundles per line
  // that are already being returned, including the ones in this request.
  const componentUnits = new Map<string, number>()
  const wholeBundles = new Map<string, number>()
  const key = (itemId: string, variantId: string) =>
    `${itemId}\u0000${variantId}`

  for (const existing of existingReturns) {
    const component = getReturnedBundleComponent(existing.metadata)
    if (component) {
      const k = key(existing.item_id, component.variant_id)
      componentUnits.set(
        k,
        (componentUnits.get(k) ?? 0) + toNumber(existing.quantity)
      )
    } else {
      wholeBundles.set(
        existing.item_id,
        (wholeBundles.get(existing.item_id) ?? 0) + toNumber(existing.quantity)
      )
    }
  }

  const bundlesTouchedByComponents = (
    itemId: string,
    components: OrderBundleComponent[]
  ) =>
    Math.max(
      0,
      ...components.map((component) =>
        Math.ceil(
          (componentUnits.get(key(itemId, component.variant_id)) ?? 0) /
            component.quantity
        )
      )
    )

  return items.map((requested) => {
    const item = withoutBundleComponentMetadata(requested)
    const { component_variant_id: componentVariantId, ...rest } = item
    const orderItem = orderItemsById.get(item.id)
    const savedComponents = orderItem
      ? getOrderBundleComponents(orderItem.metadata)
      : null
    const isBundleLine = !!orderItem?.metadata?.[BUNDLE_LINE_METADATA_KEY]
    const quantity = toNumber(item.quantity)

    if (!orderItem || (!componentVariantId && !isBundleLine)) {
      return rest
    }

    // Bundles already out of the customer's hands as whole bundles: requested,
    // received or dismissed returns of the line, plus earlier items of this
    // request.
    const wholeTaken =
      toNumber(orderItem.return_requested_quantity) +
      toNumber(orderItem.return_received_quantity) +
      toNumber(orderItem.return_dismissed_quantity) +
      (wholeBundles.get(item.id) ?? 0)
    const fulfilled = toNumber(orderItem.fulfilled_quantity)

    if (!componentVariantId) {
      // A whole-bundle return of a bundle line.
      if (savedComponents) {
        const available =
          fulfilled -
          wholeTaken -
          bundlesTouchedByComponents(item.id, savedComponents)
        if (quantity > available) {
          throw new MedusaError(
            MedusaError.Types.INVALID_DATA,
            `Cannot return ${quantity} of the bundle "${
              orderItem.title
            }": only ${Math.max(
              available,
              0
            )} can be returned whole, because items of the other bundles were already returned. Return the remaining items individually instead.`
          )
        }
      }
      wholeBundles.set(item.id, (wholeBundles.get(item.id) ?? 0) + quantity)
      return rest
    }

    if (!isBundleLine) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Item ${item.id} is not a bundle, so a component can't be returned from it.`
      )
    }

    if (!savedComponents) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `The bundle "${orderItem.title}" was ordered before single items could be returned. Return the whole bundle instead.`
      )
    }

    const component = savedComponents.find(
      (c) => c.variant_id === componentVariantId
    )
    if (!component) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Variant ${componentVariantId} is not part of the bundle "${orderItem.title}".`
      )
    }

    const k = key(item.id, component.variant_id)
    const previousUnits = componentUnits.get(k) ?? 0
    const available =
      (fulfilled - wholeTaken) * component.quantity - previousUnits
    if (quantity > available) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Cannot return ${quantity} of "${component.title}" from the bundle "${
          orderItem.title
        }": only ${Math.max(available, 0)} can be returned.`
      )
    }

    componentUnits.set(k, previousUnits + quantity)

    return {
      ...rest,
      metadata: {
        ...(item.metadata ?? {}),
        [BUNDLE_COMPONENT_METADATA_KEY]: {
          variant_id: component.variant_id,
          title: component.title,
          amount: allocateComponentRefund({
            share: component.refund_share,
            units: component.units,
            previousUnits,
            quantity,
            precision,
          }),
        } satisfies ReturnedBundleComponent,
      },
    }
  })
}

/**
 * A return item of a component return, with how much of it was received.
 */
export type ComponentReturnItem = {
  item_id: string
  quantity: BigNumberInput
  received_quantity?: BigNumberInput | null
  metadata?: Record<string, unknown> | null
}

/**
 * Prepares the receive (or dismiss) items of a return. An item with
 * `component_variant_id` receives that component's return item. Its metadata
 * names the component and the part of the return item's refund the received
 * quantity stands for, spread the same way as `allocateComponentRefund`.
 *
 * @throws {MedusaError} INVALID_DATA when the return has no such component or
 * more is received than was returned.
 */
export function prepareBundleReceiveItems<T extends BundleReturnRequestItem>({
  items,
  returnItems,
  pendingReceived,
  precision,
}: {
  items: T[]
  returnItems: ComponentReturnItem[]
  /**
   * Quantities already received in the pending receive change, per return item
   * (key: item ID + component variant ID).
   */
  pendingReceived?: Record<string, number>
  precision: number
}): (Omit<T, "component_variant_id"> & {
  metadata?: Record<string, any> | null
})[] {
  const received = new Map<string, number>(
    Object.entries(pendingReceived ?? {})
  )

  return items.map((item) => {
    const { component_variant_id: componentVariantId, ...rest } = item
    if (!componentVariantId) {
      return rest
    }

    const returnItem = returnItems.find(
      (candidate) =>
        candidate.item_id === item.id &&
        getReturnedBundleComponent(candidate.metadata)?.variant_id ===
          componentVariantId
    )
    const component = returnItem
      ? getReturnedBundleComponent(returnItem.metadata)!
      : null
    if (!returnItem || !component) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `The return has no item for variant ${componentVariantId} of item ${item.id}.`
      )
    }

    const k = bundleReturnItemKey(item.id, returnItem.metadata)
    const units = toNumber(returnItem.quantity)
    const previousUnits =
      toNumber(returnItem.received_quantity) + (received.get(k) ?? 0)
    const quantity = toNumber(item.quantity)

    if (previousUnits + quantity > units) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Cannot receive more of "${component.title}" than was returned.`
      )
    }
    received.set(k, (received.get(k) ?? 0) + quantity)

    return {
      ...rest,
      metadata: {
        ...(item.metadata ?? {}),
        [BUNDLE_COMPONENT_METADATA_KEY]: {
          variant_id: component.variant_id,
          title: component.title,
          amount: allocateComponentRefund({
            share: component.amount,
            units,
            previousUnits,
            quantity,
            precision,
          }),
        } satisfies ReturnedBundleComponent,
      },
    }
  })
}

/**
 * Identifies a return item: the order line item, plus the returned component
 * for a component return. Two components of the same bundle line are separate
 * return items.
 */
export function bundleReturnItemKey(
  itemId: string,
  metadata?: Record<string, unknown> | null
): string {
  const component = getReturnedBundleComponent(metadata)
  return component ? `${itemId}\u0000${component.variant_id}` : itemId
}

/**
 * The inventory to put back for received component returns: only the returned
 * component's inventory items, never the rest of the bundle.
 */
export function getComponentRestockAdjustments({
  received,
  orderItems,
}: {
  received: { item_id: string; quantity: BigNumberInput; variant_id: string }[]
  orderItems: { id: string; metadata?: Record<string, unknown> | null }[]
}): { inventory_item_id: string; adjustment: BigNumberInput }[] {
  const adjustments = new Map<string, BigNumberInput>()

  for (const entry of received) {
    const orderItem = orderItems.find((item) => item.id === entry.item_id)
    const component = getOrderBundleComponents(orderItem?.metadata)?.find(
      (c) => c.variant_id === entry.variant_id
    )

    for (const link of component?.inventory_items ?? []) {
      adjustments.set(
        link.inventory_item_id,
        MathBN.add(
          adjustments.get(link.inventory_item_id) ?? 0,
          MathBN.mult(entry.quantity, link.required_quantity)
        )
      )
    }
  }

  return [...adjustments.entries()].map(([inventory_item_id, adjustment]) => ({
    inventory_item_id,
    adjustment,
  }))
}
