import { BaseCustomer, BaseCustomerAddress } from "../common"

export interface StoreCustomer extends Omit<BaseCustomer, "created_by"> {
  /**
   * The customer's address.
   */
  addresses: StoreCustomerAddress[]
}
export interface StoreCustomerAddress extends BaseCustomerAddress {}

/**
 * The status of a subscription.
 *
 * - `active`: The subscription renews at its next billing date.
 * - `canceled`: The customer canceled the subscription.
 * - `failed`: A renewal failed, which ended the subscription.
 */
export type StoreSubscriptionStatus = "active" | "canceled" | "failed"

export interface StoreSubscription {
  /**
   * The subscription's ID.
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
  interval: "weekly" | "monthly" | "yearly"
  /**
   * The subscription's status.
   */
  status: StoreSubscriptionStatus
  /**
   * The date the subscription is next renewed.
   */
  next_billing_at: string
  /**
   * The date the subscription was canceled.
   */
  canceled_at: string | null
  /**
   * The date a renewal of the subscription failed.
   */
  failed_at: string | null
  /**
   * The reason a renewal of the subscription failed.
   */
  failure_reason: string | null
  /**
   * The date the subscription was created.
   */
  created_at: string
  /**
   * The date the subscription was updated.
   */
  updated_at: string
}
