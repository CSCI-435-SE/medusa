import type {
  CartWorkflowDTO,
  CreateSubscriptionDTO,
  ISubscriptionModuleService,
  LinkDefinition,
  PaymentDTO,
  SubscriptionIntervalType,
} from "@medusajs/framework/types"
import {
  computeNextBillingDate,
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  SUBSCRIPTION_INTERVAL_METADATA_KEY,
} from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { isSubscriptionItem } from "./validate-subscription-items"

/**
 * The ID of the system payment provider. It doesn't charge customers, so it
 * doesn't need a saved payment method to renew a subscription.
 */
const SYSTEM_PAYMENT_PROVIDER_ID = "pp_system_default"

/**
 * The details of the completed cart to create subscriptions from.
 */
export interface CreateSubscriptionsFromCartStepInput {
  /**
   * The completed cart.
   */
  cart: Pick<CartWorkflowDTO, "id" | "items" | "customer">
  /**
   * The ID of the order created from the cart.
   */
  order_id: string
  /**
   * The payment authorized for the order.
   */
  payment: Pick<PaymentDTO, "provider_id" | "data"> | null
}

export const createSubscriptionsFromCartStepId =
  "create-subscriptions-from-cart"
/**
 * This step creates a subscription for each line item in a completed cart that
 * was bought as a subscription, and links each subscription to the order.
 *
 * The authorized payment must hold a payment method saved for off-session use,
 * which is used to charge renewals. For Stripe, the payment session must be
 * created with `setup_future_usage: "off_session"` in its `data`.
 *
 * @example
 * const subscriptions = createSubscriptionsFromCartStep({
 *   cart,
 *   order_id: "order_123",
 *   payment,
 * })
 */
export const createSubscriptionsFromCartStep = createStep(
  createSubscriptionsFromCartStepId,
  async (input: CreateSubscriptionsFromCartStepInput, { container }) => {
    const subscriptionItems = (input.cart.items ?? []).filter((item) =>
      isSubscriptionItem(item)
    )

    if (!subscriptionItems.length) {
      return new StepResponse([], { subscriptionIds: [], links: [] })
    }

    // The cart's customer was validated by the validateSubscriptionItemsStep
    const customerId = input.cart.customer!.id

    if (!input.payment) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "An authorized payment is required to purchase a subscription"
      )
    }

    const paymentMethodId = getSavedPaymentMethodId(input.payment)

    const now = new Date()
    const subscriptionsData: CreateSubscriptionDTO[] = subscriptionItems.map(
      (item) => {
        const interval = item.metadata![
          SUBSCRIPTION_INTERVAL_METADATA_KEY
        ] as SubscriptionIntervalType

        return {
          customer_id: customerId,
          variant_id: item.variant_id!,
          quantity: Number(item.quantity),
          interval,
          next_billing_at: computeNextBillingDate(now, interval),
          payment_provider_id: input.payment!.provider_id,
          payment_method_id: paymentMethodId,
        }
      }
    )

    const subscriptionModule = container.resolve<ISubscriptionModuleService>(
      Modules.SUBSCRIPTION
    )
    const link = container.resolve(ContainerRegistrationKeys.LINK)

    const subscriptions = await subscriptionModule.createSubscriptions(
      subscriptionsData
    )

    const links: LinkDefinition[] = subscriptions.map((subscription) => ({
      [Modules.ORDER]: { order_id: input.order_id },
      [Modules.SUBSCRIPTION]: { subscription_id: subscription.id },
    }))

    try {
      await link.create(links)
    } catch (e) {
      await subscriptionModule.deleteSubscriptions(
        subscriptions.map((subscription) => subscription.id)
      )
      throw e
    }

    return new StepResponse(subscriptions, {
      subscriptionIds: subscriptions.map((subscription) => subscription.id),
      links,
    })
  },
  async (data, { container }) => {
    if (!data?.subscriptionIds.length) {
      return
    }

    const subscriptionModule = container.resolve<ISubscriptionModuleService>(
      Modules.SUBSCRIPTION
    )
    const link = container.resolve(ContainerRegistrationKeys.LINK)

    await link.dismiss(data.links)
    await subscriptionModule.deleteSubscriptions(data.subscriptionIds)
  }
)

/**
 * Returns the ID of the payment method saved for off-session use in an
 * authorized payment. Throws if a provider that charges customers didn't
 * save one, since renewals couldn't be charged.
 */
function getSavedPaymentMethodId(
  payment: Pick<PaymentDTO, "provider_id" | "data">
): string | null {
  if (payment.provider_id === SYSTEM_PAYMENT_PROVIDER_ID) {
    return null
  }

  const data = (payment.data ?? {}) as Record<string, any>
  const paymentMethod = data.payment_method
  const paymentMethodId =
    typeof paymentMethod === "string" ? paymentMethod : paymentMethod?.id

  if (!paymentMethodId || data.setup_future_usage !== "off_session") {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `A subscription requires a payment method saved for off-session use. Create the payment session with "setup_future_usage": "off_session" in its data.`
    )
  }

  return paymentMethodId
}
