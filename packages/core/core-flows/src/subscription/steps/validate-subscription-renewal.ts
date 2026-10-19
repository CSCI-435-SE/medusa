import type { SubscriptionDTO } from "@medusajs/framework/types"
import { MedusaError, SubscriptionStatus } from "@medusajs/framework/utils"
import { createStep } from "@medusajs/framework/workflows-sdk"

/**
 * The details of the subscription to validate.
 */
export interface ValidateSubscriptionRenewalStepInput {
  /**
   * The subscription to renew.
   */
  subscription: Pick<SubscriptionDTO, "id" | "status" | "next_billing_at"> & {
    /**
     * The orders placed for the subscription. The first one is used to
     * build the renewal order.
     */
    orders?: unknown[] | null
  }
}

export const validateSubscriptionRenewalStepId = "validate-subscription-renewal"
/**
 * This step validates that a subscription is due for renewal. It throws an
 * error if the subscription isn't active, its next billing date hasn't
 * passed, or it has no order to renew from.
 *
 * @example
 * validateSubscriptionRenewalStep({ subscription })
 */
export const validateSubscriptionRenewalStep = createStep(
  validateSubscriptionRenewalStepId,
  async ({ subscription }: ValidateSubscriptionRenewalStepInput) => {
    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Subscription with id: ${subscription.id} is ${subscription.status} and can't be renewed`
      )
    }

    if (new Date(subscription.next_billing_at) > new Date()) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Subscription with id: ${subscription.id} isn't due for renewal`
      )
    }

    if (!subscription.orders?.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Subscription with id: ${subscription.id} has no order to renew from`
      )
    }
  }
)
