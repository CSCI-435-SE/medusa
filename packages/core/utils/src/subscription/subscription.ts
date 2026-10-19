/**
 * @enum
 *
 * The interval at which a subscription renews.
 */
export enum SubscriptionInterval {
  /**
   * The subscription renews every week.
   */
  WEEKLY = "weekly",
  /**
   * The subscription renews every month.
   */
  MONTHLY = "monthly",
  /**
   * The subscription renews every year.
   */
  YEARLY = "yearly",
}

/**
 * @enum
 *
 * The status of a subscription.
 */
export enum SubscriptionStatus {
  /**
   * The subscription renews at its next billing date.
   */
  ACTIVE = "active",
  /**
   * The customer canceled the subscription.
   */
  CANCELED = "canceled",
  /**
   * A renewal failed, for example because the payment was declined or the
   * variant was out of stock, which ended the subscription.
   */
  FAILED = "failed",
}

/**
 * The key of the line item metadata that holds the subscription interval
 * a customer chose for the item, e.g. `"monthly"`.
 */
export const SUBSCRIPTION_INTERVAL_METADATA_KEY = "subscription_interval"

/**
 * The key of the product variant metadata that holds the subscription
 * intervals the variant can be purchased at, e.g. `["weekly", "monthly"]`.
 * A variant without it can't be purchased as a subscription.
 */
export const SUBSCRIPTION_INTERVALS_METADATA_KEY = "subscription_intervals"

/**
 * Computes the date a subscription is next billed, one interval after the
 * given date. When the target month is shorter than the source day (for
 * example, monthly from January 31), the date is clamped to the last day of
 * the target month.
 *
 * @param from - The date to compute from.
 * @param interval - The subscription's interval.
 * @returns The next billing date.
 */
export function computeNextBillingDate(
  from: Date,
  interval: SubscriptionInterval | `${SubscriptionInterval}`
): Date {
  const next = new Date(from.getTime())

  if (interval === SubscriptionInterval.WEEKLY) {
    next.setUTCDate(next.getUTCDate() + 7)
    return next
  }

  const monthsToAdd = interval === SubscriptionInterval.MONTHLY ? 1 : 12
  const day = next.getUTCDate()

  next.setUTCDate(1)
  next.setUTCMonth(next.getUTCMonth() + monthsToAdd)

  const lastDayOfTargetMonth = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)
  ).getUTCDate()

  next.setUTCDate(Math.min(day, lastDayOfTargetMonth))

  return next
}
