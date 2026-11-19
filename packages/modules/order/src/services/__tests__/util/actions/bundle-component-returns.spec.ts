import {
  ChangeActionType,
  MathBN,
  decorateCartTotals,
} from "@medusajs/framework/utils"
import { VirtualOrder } from "@types"
import { calculateOrderChange } from "../../../../utils"

/**
 * Issue #113: returning a single component of a bundle line item. Such an
 * action names the component and its refund in `details.metadata` and must
 * not change the bundle line's own return quantities.
 */
describe("Actions: bundle component returns", function () {
  const order = (): VirtualOrder => ({
    id: "order_1",
    items: [
      {
        id: "item_kit",
        quantity: 1,
        unit_price: 1000,
        compare_at_unit_price: null,
        order_id: "order_1",
        detail: {
          quantity: 1,
          order_id: "order_1",
          delivered_quantity: 1,
          shipped_quantity: 1,
          fulfilled_quantity: 1,
          return_requested_quantity: 0,
          return_received_quantity: 0,
          return_dismissed_quantity: 0,
          written_off_quantity: 0,
        },
      },
    ],
    shipping_methods: [],
    credit_lines: [],
    total: 1000,
  })

  const bag = {
    bundle_component: { variant_id: "bag", title: "Bag", amount: 83.33 },
  }

  const action = (type: ChangeActionType, quantity = 1, metadata = bag) => ({
    action: type,
    return_id: "return_1",
    reference_id: "return_1",
    details: { reference_id: "item_kit", quantity, metadata },
  })

  const detailOf = (result: ReturnType<typeof calculateOrderChange>) =>
    JSON.parse(JSON.stringify(result.order.items[0].detail))

  it("requests a component return without changing the bundle's quantities", function () {
    const result = calculateOrderChange({
      order: order(),
      actions: [action(ChangeActionType.RETURN_ITEM)],
    })

    expect(detailOf(result).return_requested_quantity).toEqual(0)
    expect(result.order.credit_lines).toEqual([])
    // The action's amount is the component's refund, not the bundle price.
    expect(
      MathBN.convert(result.summary.current_order_total).toNumber()
    ).toEqual(1000 - 83.33)
  })

  it("adds a credit line for the refund when the component is received", function () {
    const result = calculateOrderChange({
      order: order(),
      actions: [action(ChangeActionType.RECEIVE_RETURN_ITEM)],
    })

    expect(detailOf(result).return_received_quantity).toEqual(0)
    expect(detailOf(result).return_requested_quantity).toEqual(0)
    expect(
      result.order.credit_lines!.map((line: any) => ({
        amount: MathBN.convert(line.amount).toNumber(),
        reference: line.reference,
        reference_id: line.reference_id,
        order_id: line.order_id,
      }))
    ).toEqual([
      {
        amount: 83.33,
        reference: "bundle_component_return",
        reference_id: "return_1",
        order_id: "order_1",
      },
    ])

    // The order total (from line quantities and credit lines) drops by the
    // component's refund, which makes it owed to the customer.
    const totals = decorateCartTotals(JSON.parse(JSON.stringify(result.order)))
    expect(MathBN.convert(totals.total).toNumber()).toEqual(916.67)
  })

  it("adds a credit line but doesn't write off quantities when received as damaged", function () {
    const result = calculateOrderChange({
      order: order(),
      actions: [action(ChangeActionType.RECEIVE_DAMAGED_RETURN_ITEM)],
    })

    const detail = detailOf(result)
    expect(detail.return_dismissed_quantity).toEqual(0)
    expect(detail.written_off_quantity).toEqual(0)
    expect(result.order.credit_lines).toHaveLength(1)
  })

  it("cancels a component return without changing the bundle's quantities", function () {
    const result = calculateOrderChange({
      order: order(),
      actions: [action(ChangeActionType.CANCEL_RETURN_ITEM)],
    })

    expect(detailOf(result).return_requested_quantity).toEqual(0)
    expect(result.order.credit_lines).toEqual([])
  })

  it("skips the bundle line's quantity checks for components", function () {
    // The bundle has 0 requested, so receiving 1 whole bundle would fail; the
    // return workflows check component quantities instead.
    expect(() =>
      calculateOrderChange({
        order: order(),
        actions: [action(ChangeActionType.RECEIVE_RETURN_ITEM, 1)],
      })
    ).not.toThrow()

    expect(() =>
      calculateOrderChange({
        order: order(),
        actions: [action(ChangeActionType.RETURN_ITEM, 5)],
      })
    ).not.toThrow()
  })

  it("still checks and counts quantities for whole-bundle returns", function () {
    expect(() =>
      calculateOrderChange({
        order: order(),
        actions: [action(ChangeActionType.RECEIVE_RETURN_ITEM, 1, {} as any)],
      })
    ).toThrow(
      "Cannot receive more items than what was requested to be returned for item item_kit."
    )

    const result = calculateOrderChange({
      order: order(),
      actions: [action(ChangeActionType.RETURN_ITEM, 1, {} as any)],
    })
    expect(Number(detailOf(result).return_requested_quantity)).toEqual(1)
  })
})
