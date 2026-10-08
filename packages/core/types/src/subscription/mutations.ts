import { SubscriptionIntervalType, SubscriptionStatusType } from "./common"

/**
 * The subscription to be created.
 */
export interface CreateSubscriptionDTO {
  /**
   * The ID of the customer the subscription belongs to.
   */
  customer_id: string

  /**
   * The ID of the product variant the customer subscribed to.
   */
  variant_id: string

  /**
   * The quantity of the variant ordered at each renewal.
   */
  quantity: number

  /**
   * The interval at which the subscription renews.
   */
  interval: SubscriptionIntervalType

  /**
   * The status of the subscription. Defaults to `active`.
   */
  status?: SubscriptionStatusType

  /**
   * The date and time the subscription is next renewed.
   */
  next_billing_at: Date | string

  /**
   * The ID of the payment provider used to charge renewals.
   */
  payment_provider_id: string

  /**
   * The ID of the saved payment method in the payment provider used to charge
   * renewals.
   */
  payment_method_id?: string | null
}

/**
 * The attributes to update in the subscription.
 */
export interface UpdateSubscriptionDTO {
  /**
   * The ID of the subscription to update.
   */
  id: string

  /**
   * The status of the subscription.
   */
  status?: SubscriptionStatusType

  /**
   * The date and time the subscription is next renewed.
   */
  next_billing_at?: Date | string

  /**
   * The date and time the subscription was canceled.
   */
  canceled_at?: Date | string | null

  /**
   * The date and time a renewal of the subscription failed.
   */
  failed_at?: Date | string | null

  /**
   * The reason a renewal of the subscription failed.
   */
  failure_reason?: string | null
}
