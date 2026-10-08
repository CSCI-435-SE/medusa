import type { SubscriptionDTO } from "@medusajs/framework/types"
import { MedusaError, SubscriptionStatus } from "@medusajs/framework/utils"
import { createStep } from "@medusajs/framework/workflows-sdk"

/**
 * The details of the subscription to validate.
 */
export interface ValidateSubscriptionEndStepInput {
  /**
   * The subscription to end.
   */
  subscription: Pick<SubscriptionDTO, "id" | "customer_id" | "status">
  /**
   * The ID of the customer ending the subscription. If set, the subscription
   * must belong to this customer.
   */
  customer_id?: string
}

export const validateSubscriptionEndStepId = "validate-subscription-end"
/**
 * This step validates that a subscription can be ended. It throws an error if
 * the subscription belongs to a different customer or isn't active.
 *
 * @example
 * validateSubscriptionEndStep({
 *   subscription,
 *   customer_id: "cus_123",
 * })
 */
export const validateSubscriptionEndStep = createStep(
  validateSubscriptionEndStepId,
  async ({ subscription, customer_id }: ValidateSubscriptionEndStepInput) => {
    if (customer_id && subscription.customer_id !== customer_id) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Subscription with id: ${subscription.id} was not found`
      )
    }

    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Subscription with id: ${subscription.id} is ${subscription.status} and can't be ended`
      )
    }
  }
)
