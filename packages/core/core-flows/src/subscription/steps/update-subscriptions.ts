import type {
  ISubscriptionModuleService,
  UpdateSubscriptionDTO,
} from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

/**
 * The subscriptions to update.
 */
export type UpdateSubscriptionsStepInput = UpdateSubscriptionDTO[]

export const updateSubscriptionsStepId = "update-subscriptions"
/**
 * This step updates one or more subscriptions.
 *
 * @example
 * const subscriptions = updateSubscriptionsStep([
 *   { id: "sub_123", status: "canceled", canceled_at: new Date() },
 * ])
 */
export const updateSubscriptionsStep = createStep(
  updateSubscriptionsStepId,
  async (data: UpdateSubscriptionsStepInput, { container }) => {
    const service = container.resolve<ISubscriptionModuleService>(
      Modules.SUBSCRIPTION
    )

    const previous = await service.listSubscriptions({
      id: data.map((subscription) => subscription.id),
    })

    const updated = await service.updateSubscriptions(data)

    return new StepResponse(
      updated,
      previous.map((subscription) => ({
        id: subscription.id,
        status: subscription.status,
        next_billing_at: subscription.next_billing_at,
        canceled_at: subscription.canceled_at,
        failed_at: subscription.failed_at,
        failure_reason: subscription.failure_reason,
      }))
    )
  },
  async (previous, { container }) => {
    if (!previous?.length) {
      return
    }

    const service = container.resolve<ISubscriptionModuleService>(
      Modules.SUBSCRIPTION
    )

    await service.updateSubscriptions(previous)
  }
)
