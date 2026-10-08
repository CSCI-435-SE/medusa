import { BaseFilterable, OperatorMap } from "../dal"

/**
 * The interval at which a subscription renews.
 */
export type SubscriptionIntervalType = "weekly" | "monthly" | "yearly"

/**
 * The status of a subscription.
 *
 * - `active`: The subscription renews at its next billing date.
 * - `canceled`: The customer canceled the subscription.
 * - `failed`: A renewal failed, which ended the subscription.
 */
export type SubscriptionStatusType = "active" | "canceled" | "failed"

/**
 * The subscription details. A subscription renews a customer's purchase of a
 * product variant at a recurring interval.
 */
export interface SubscriptionDTO {
  /**
   * The ID of the subscription.
   */
  id: string

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
   * The status of the subscription.
   */
  status: SubscriptionStatusType

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
   * renewals, if the provider returned one.
   */
  payment_method_id: string | null

  /**
   * The date and time the subscription was canceled.
   */
  canceled_at: Date | string | null

  /**
   * The date and time a renewal of the subscription failed.
   */
  failed_at: Date | string | null

  /**
   * The reason a renewal of the subscription failed.
   */
  failure_reason: string | null

  /**
   * The date and time the subscription was created.
   */
  created_at: Date | string

  /**
   * The date and time the subscription was last updated.
   */
  updated_at: Date | string

  /**
   * The date and time the subscription was deleted.
   */
  deleted_at: Date | string | null
}

/**
 * The filters to apply on the retrieved subscriptions.
 */
export interface FilterableSubscriptionProps
  extends BaseFilterable<FilterableSubscriptionProps> {
  /**
   * The IDs to filter the subscriptions by.
   */
  id?: string | string[] | OperatorMap<string | string[]>

  /**
   * The customer IDs to filter the subscriptions by.
   */
  customer_id?: string | string[] | OperatorMap<string | string[]>

  /**
   * The product variant IDs to filter the subscriptions by.
   */
  variant_id?: string | string[] | OperatorMap<string | string[]>

  /**
   * The statuses to filter the subscriptions by.
   */
  status?:
    | SubscriptionStatusType
    | SubscriptionStatusType[]
    | OperatorMap<SubscriptionStatusType | SubscriptionStatusType[]>

  /**
   * Filter the subscriptions by their next billing date.
   */
  next_billing_at?: OperatorMap<string | Date>
}
