import type { CustomerDTO } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  SUBSCRIPTION_INTERVAL_METADATA_KEY,
  SUBSCRIPTION_INTERVALS_METADATA_KEY,
  SubscriptionInterval,
} from "@medusajs/framework/utils"
import { createStep } from "@medusajs/framework/workflows-sdk"

/**
 * The details of the line items and customer to validate.
 */
export interface ValidateSubscriptionItemsStepInput {
  /**
   * The line items to validate. Only items whose metadata has a
   * `subscription_interval` are validated.
   */
  items: {
    /**
     * The ID of the item's variant.
     */
    variant_id?: string | null
    /**
     * The item's metadata.
     */
    metadata?: Record<string, unknown> | null
  }[]
  /**
   * The customer that will own the subscriptions.
   */
  customer?: Pick<CustomerDTO, "id" | "has_account"> | null
}

export const validateSubscriptionItemsStepId = "validate-subscription-items"
/**
 * This step validates line items that are bought as a subscription. It throws
 * an error if an item's interval isn't one of the intervals in its variant's
 * `subscription_intervals` metadata, or if the cart has no registered
 * customer to own the subscriptions.
 *
 * @example
 * validateSubscriptionItemsStep({
 *   items: [
 *     {
 *       variant_id: "variant_123",
 *       metadata: { subscription_interval: "monthly" },
 *     },
 *   ],
 *   customer: { id: "cus_123", has_account: true },
 * })
 */
export const validateSubscriptionItemsStep = createStep(
  validateSubscriptionItemsStepId,
  async (input: ValidateSubscriptionItemsStepInput, { container }) => {
    const subscriptionItems = (input.items ?? []).filter((item) =>
      isSubscriptionItem(item)
    )

    if (!subscriptionItems.length) {
      return
    }

    if (!input.customer?.has_account) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "A registered customer is required to purchase a subscription"
      )
    }

    const validIntervals = Object.values(SubscriptionInterval) as string[]
    for (const item of subscriptionItems) {
      const interval = item.metadata![SUBSCRIPTION_INTERVAL_METADATA_KEY]
      if (!validIntervals.includes(interval as string)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Invalid subscription interval: ${interval}`
        )
      }
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: variants } = await query.graph({
      entity: "product_variant",
      fields: ["id", "metadata"],
      filters: { id: subscriptionItems.map((item) => item.variant_id!) },
    })
    const intervalsByVariant = new Map<string, unknown>(
      variants.map((variant) => [
        variant.id,
        variant.metadata?.[SUBSCRIPTION_INTERVALS_METADATA_KEY],
      ])
    )

    for (const item of subscriptionItems) {
      const interval = item.metadata![SUBSCRIPTION_INTERVAL_METADATA_KEY]
      const allowedIntervals = intervalsByVariant.get(item.variant_id!)

      if (
        !Array.isArray(allowedIntervals) ||
        !allowedIntervals.includes(interval)
      ) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          `Variant ${item.variant_id} can't be purchased as a ${interval} subscription`
        )
      }
    }
  }
)

/**
 * Whether a line item is bought as a subscription.
 */
export function isSubscriptionItem(item: {
  variant_id?: string | null
  metadata?: Record<string, unknown> | null
}): boolean {
  return (
    !!item.variant_id &&
    item.metadata?.[SUBSCRIPTION_INTERVAL_METADATA_KEY] !== undefined &&
    item.metadata?.[SUBSCRIPTION_INTERVAL_METADATA_KEY] !== null
  )
}
