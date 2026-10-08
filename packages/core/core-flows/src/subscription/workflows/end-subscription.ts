import type { SubscriptionDTO } from "@medusajs/framework/types"
import { SubscriptionStatus } from "@medusajs/framework/utils"
import {
  createWorkflow,
  transform,
  WorkflowData,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { useQueryGraphStep } from "../../common"
import { updateSubscriptionsStep } from "../steps/update-subscriptions"
import { validateSubscriptionEndStep } from "../steps/validate-subscription-end"

/**
 * The subscription to end.
 */
export type EndSubscriptionWorkflowInput = {
  /**
   * The ID of the subscription.
   */
  id: string
  /**
   * Why the subscription ends: `canceled` when the customer cancels it, or
   * `failed` when a renewal failed.
   */
  status: SubscriptionStatus.CANCELED | SubscriptionStatus.FAILED
  /**
   * The ID of the customer ending the subscription. If set, the subscription
   * must belong to this customer.
   */
  customer_id?: string
  /**
   * The reason a renewal failed, when the status is `failed`.
   */
  failure_reason?: string
}

export const endSubscriptionWorkflowId = "end-subscription"
/**
 * This workflow ends an active subscription immediately, so it isn't renewed
 * again. It's used by the Cancel Subscription Store API Route, and by the
 * renewal job when a renewal fails.
 *
 * @example
 * const { result } = await endSubscriptionWorkflow(container)
 * .run({
 *   input: {
 *     id: "sub_123",
 *     status: "canceled",
 *     customer_id: "cus_123",
 *   }
 * })
 *
 * @summary
 *
 * Cancel a subscription or mark it as failed.
 */
export const endSubscriptionWorkflow = createWorkflow(
  endSubscriptionWorkflowId,
  (input: WorkflowData<EndSubscriptionWorkflowInput>) => {
    const { data: subscription } = useQueryGraphStep({
      entity: "subscription",
      fields: ["id", "customer_id", "status"],
      filters: { id: input.id },
      options: { throwIfKeyNotFound: true, isList: false },
    })

    validateSubscriptionEndStep({
      subscription,
      customer_id: input.customer_id,
    })

    const updateData = transform({ input }, ({ input }) => {
      const now = new Date()

      return [
        input.status === SubscriptionStatus.CANCELED
          ? { id: input.id, status: input.status, canceled_at: now }
          : {
              id: input.id,
              status: input.status,
              failed_at: now,
              failure_reason: input.failure_reason ?? null,
            },
      ]
    })

    const updated = updateSubscriptionsStep(updateData)

    const ended = transform(
      { updated },
      ({ updated }) => updated[0] as SubscriptionDTO
    )

    return new WorkflowResponse(ended)
  }
)
