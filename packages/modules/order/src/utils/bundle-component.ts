import { BigNumberInput } from "@medusajs/framework/types"
import { MathBN } from "@medusajs/framework/utils"

/**
 * For an action that returns one component of a bundle line item (issue #113),
 * returns the refund amount the return workflows saved on it. Returns
 * `undefined` for any other action.
 *
 * Such an action doesn't change the bundle line's own return quantities: the
 * return workflows track and validate each component's quantities themselves.
 */
export function getBundleComponentAmount(action: {
  details?: { metadata?: Record<string, unknown> | null } | null
}): BigNumberInput | undefined {
  const component = action.details?.metadata?.bundle_component as
    | { amount?: BigNumberInput }
    | undefined

  return component?.amount == null
    ? undefined
    : MathBN.convert(component.amount)
}

/**
 * Records the refund for a received (or dismissed) bundle component as a
 * credit line on the order. Medusa computes the order total from each line's
 * received quantities, which a component return doesn't change, so the credit
 * line is what lowers the total and makes the refund owed to the customer.
 */
export function addBundleComponentCredit(
  currentOrder: { id: string; credit_lines?: any[] },
  action: { id?: string; reference_id?: string; return_id?: string },
  amount: BigNumberInput
) {
  const creditLines = currentOrder.credit_lines ?? []

  creditLines.push({
    order_id: currentOrder.id,
    amount: MathBN.convert(amount),
    reference: "bundle_component_return",
    reference_id: action.return_id ?? action.reference_id,
  })

  currentOrder.credit_lines = creditLines
}
