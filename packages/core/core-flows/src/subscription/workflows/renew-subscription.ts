import type {
  CreateCartAddressDTO,
  CreateCartWorkflowInputDTO,
} from "@medusajs/framework/types"
import { computeNextBillingDate, Modules } from "@medusajs/framework/utils"
import {
  createWorkflow,
  transform,
  when,
  WorkflowData,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { addShippingMethodToCartWorkflow } from "../../cart/workflows/add-shipping-method-to-cart"
import { completeCartWorkflow } from "../../cart/workflows/complete-cart"
import { createCartWorkflow } from "../../cart/workflows/create-carts"
import { createPaymentCollectionForCartWorkflow } from "../../cart/workflows/create-payment-collection-for-cart"
import { createRemoteLinkStep, useQueryGraphStep } from "../../common"
import { acquireLockStep, releaseLockStep } from "../../locking"
import { createPaymentSessionsWorkflow } from "../../payment-collection/workflows/create-payment-session"
import { updateSubscriptionsStep } from "../steps/update-subscriptions"
import { validateSubscriptionRenewalStep } from "../steps/validate-subscription-renewal"

/**
 * The subscription to renew.
 */
export type RenewSubscriptionWorkflowInput = {
  /**
   * The ID of the subscription.
   */
  id: string
}

/**
 * The result of renewing a subscription.
 */
export type RenewSubscriptionWorkflowOutput = {
  /**
   * The ID of the renewal order.
   */
  order_id: string
}

const ADDRESS_FIELDS = [
  "first_name",
  "last_name",
  "phone",
  "company",
  "address_1",
  "address_2",
  "city",
  "country_code",
  "province",
  "postal_code",
  "metadata",
] as const

const TWO_MINUTES = 60 * 2

export const renewSubscriptionWorkflowId = "renew-subscription"
/**
 * This workflow renews a subscription that is due by placing a new order for
 * it. The order uses the subscription's variant and quantity at the variant's
 * current price, the shipping address and shipping option of the order the
 * subscription was purchased in, and the subscription's saved payment method,
 * charged off-session.
 *
 * The workflow throws if the subscription isn't active or isn't due yet. If
 * any part of the renewal fails, such as a declined payment or the variant
 * being out of stock, the workflow throws and no order is created. The caller
 * is responsible for marking the subscription as failed with the
 * {@link endSubscriptionWorkflow}.
 *
 * @example
 * const { result } = await renewSubscriptionWorkflow(container)
 * .run({
 *   input: {
 *     id: "sub_123",
 *   }
 * })
 *
 * @summary
 *
 * Renew a subscription by placing a new order.
 */
export const renewSubscriptionWorkflow = createWorkflow(
  renewSubscriptionWorkflowId,
  (input: WorkflowData<RenewSubscriptionWorkflowInput>) => {
    // Concurrent renewals of the same subscription wait here, then fail the
    // due check below once the first one has advanced next_billing_at, so a
    // subscription is never charged twice for the same period.
    acquireLockStep({
      key: input.id,
      timeout: TWO_MINUTES,
      ttl: TWO_MINUTES,
    })

    const { data: subscription } = useQueryGraphStep({
      entity: "subscription",
      fields: [
        "id",
        "status",
        "interval",
        "next_billing_at",
        "customer_id",
        "variant_id",
        "quantity",
        "payment_provider_id",
        "payment_method_id",
        "orders.id",
        "orders.created_at",
        "orders.region_id",
        "orders.sales_channel_id",
        "orders.email",
        "orders.currency_code",
        "orders.locale",
        "orders.shipping_address.*",
        "orders.billing_address.*",
        "orders.shipping_methods.shipping_option_id",
        "orders.shipping_methods.data",
      ],
      filters: { id: input.id },
      options: { throwIfKeyNotFound: true, isList: false },
    })

    validateSubscriptionRenewalStep({ subscription })

    const renewalData = transform({ subscription }, ({ subscription }) => {
      const originalOrder = [...(subscription.orders ?? [])]
        .filter(Boolean)
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )[0]

      const cart: CreateCartWorkflowInputDTO = {
        region_id: originalOrder.region_id,
        sales_channel_id: originalOrder.sales_channel_id,
        customer_id: subscription.customer_id,
        email: originalOrder.email,
        currency_code: originalOrder.currency_code,
        locale: originalOrder.locale ?? undefined,
        shipping_address: toCartAddress(originalOrder.shipping_address),
        billing_address: toCartAddress(originalOrder.billing_address),
        items: [
          {
            variant_id: subscription.variant_id,
            quantity: subscription.quantity,
          },
        ],
        metadata: { subscription_id: subscription.id },
      }

      const shippingOptions = (originalOrder.shipping_methods ?? [])
        .filter((method) => !!method?.shipping_option_id)
        .map((method) => ({
          id: method.shipping_option_id as string,
          data: method.data ?? undefined,
        }))

      return {
        cart,
        shippingOptions,
        paymentSessionData: subscription.payment_method_id
          ? {
              payment_method: subscription.payment_method_id,
              off_session: true,
              confirm: true,
            }
          : {},
      }
    })

    const cart = createCartWorkflow.runAsStep({
      input: renewalData.cart,
    })

    when(
      "add-renewal-shipping-methods",
      { renewalData },
      ({ renewalData }) => !!renewalData.shippingOptions.length
    ).then(() => {
      addShippingMethodToCartWorkflow.runAsStep({
        input: {
          cart_id: cart.id,
          options: renewalData.shippingOptions,
        },
      })
    })

    const paymentCollection = createPaymentCollectionForCartWorkflow.runAsStep({
      input: { cart_id: cart.id },
    })

    createPaymentSessionsWorkflow.runAsStep({
      input: {
        payment_collection_id: paymentCollection.id,
        provider_id: subscription.payment_provider_id,
        customer_id: subscription.customer_id,
        data: renewalData.paymentSessionData,
      },
    })

    const order = completeCartWorkflow.runAsStep({
      input: { id: cart.id },
    })

    const links = transform(
      { order, subscription },
      ({ order, subscription }) => [
        {
          [Modules.ORDER]: { order_id: order.id },
          [Modules.SUBSCRIPTION]: { subscription_id: subscription.id },
        },
      ]
    )

    createRemoteLinkStep(links)

    const subscriptionUpdate = transform(
      { subscription },
      ({ subscription }) => {
        const now = new Date()
        let nextBillingAt = computeNextBillingDate(
          new Date(subscription.next_billing_at),
          subscription.interval
        )

        // If renewals were missed (e.g. the server was down), bill the next
        // interval from now instead of catching up on every missed one.
        if (nextBillingAt <= now) {
          nextBillingAt = computeNextBillingDate(now, subscription.interval)
        }

        return [{ id: subscription.id, next_billing_at: nextBillingAt }]
      }
    )

    updateSubscriptionsStep(subscriptionUpdate)

    releaseLockStep({
      key: input.id,
    })

    const result = transform({ order }, ({ order }) => {
      return { order_id: order.id } as RenewSubscriptionWorkflowOutput
    })

    return new WorkflowResponse(result)
  }
)

function toCartAddress(
  address: Record<string, any> | null | undefined
): CreateCartAddressDTO | undefined {
  if (!address) {
    return undefined
  }

  const cartAddress: Record<string, unknown> = {}
  for (const field of ADDRESS_FIELDS) {
    if (address[field] !== undefined && address[field] !== null) {
      cartAddress[field] = address[field]
    }
  }

  return cartAddress as CreateCartAddressDTO
}
