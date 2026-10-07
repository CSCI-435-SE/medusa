import { getLastPaymentStatus } from "@medusajs/core-flows"
import {
  BigNumberValue,
  HttpTypes,
  OrderDetailDTO,
} from "@medusajs/framework/types"
import { MathBN, OrderStatus } from "@medusajs/framework/utils"

/**
 * How many products to return in the "top selling products" list.
 * The issue (#42) asks for exactly three entries.
 */
export const TOP_PRODUCTS_LIMIT = 3

/**
 * Order statuses that should never count towards sales metrics.
 *
 * - `draft`: the order was never placed by a customer.
 * - `canceled`: the sale was reversed, so it isn't real revenue.
 *
 * Note: we intentionally do NOT require `status === "completed"`. In Medusa
 * the `completed` status is rarely set, and most paid orders remain `pending`,
 * so filtering on it would hide most real sales. Payment status (below) is
 * what tells us whether an order was actually paid.
 */
export const EXCLUDED_ORDER_STATUSES: string[] = [
  OrderStatus.DRAFT,
  OrderStatus.CANCELED,
]

/**
 * Payment statuses that mean "the merchant actually received money".
 *
 * Payment status isn't stored on the order; it is derived from the order's
 * payment collections by `getLastPaymentStatus` (core-flows). We count:
 *
 * - `captured`: fully paid.
 * - `partially_captured`: some payments captured (e.g. multiple collections).
 * - `partially_refunded`: was paid, and only part of it was refunded, so the
 *   sale still happened.
 *
 * Fully `refunded` orders are excluded, as are orders that are only
 * authorized / awaiting / not paid, since no money has been collected yet.
 *
 * Note: this list only decides whether an order is counted at all. How much
 * of a partially captured or partially refunded order counts as revenue is
 * decided by `getOrderRevenue` below.
 */
export const PAID_PAYMENT_STATUSES: string[] = [
  "captured",
  "partially_captured",
  "partially_refunded",
]

/**
 * The fields the route must request from `query.graph` for each order so that
 * the helpers below have everything they need. Kept here, next to the code
 * that reads them, so the two can't drift apart.
 *
 * We read `summary` (a stored JSON column) instead of `total`, because asking
 * for `total` makes the order module load and recompute every line item's tax
 * lines and adjustments, which is much heavier.
 */
export const SALES_SUMMARY_ORDER_FIELDS = [
  "id",
  "status",
  "is_draft_order",
  "currency_code",
  "summary",
  // Needed by `getLastPaymentStatus` to work out the payment status.
  "payment_collections.status",
  "payment_collections.amount",
  "payment_collections.captured_amount",
  "payment_collections.refunded_amount",
  // Needed to count units sold per product.
  "items.product_id",
  "items.product_title",
  "items.title",
  "items.quantity",
]

/**
 * The minimal shape of an order returned by `query.graph` with
 * `SALES_SUMMARY_ORDER_FIELDS`. Everything is optional / loosely typed because
 * this data comes straight from the database and we don't want a missing
 * relation to crash the dashboard.
 */
export type SalesSummaryOrder = {
  id: string
  status?: string | null
  is_draft_order?: boolean | null
  currency_code?: string | null
  summary?: {
    current_order_total?: BigNumberValue | null
    // Net money kept for the order: everything paid minus everything
    // refunded. Lives in the same stored `summary` JSON, so the route
    // doesn't need to request any extra fields.
    transaction_total?: BigNumberValue | null
  } | null
  payment_collections?: {
    status?: string | null
    amount?: BigNumberValue | null
    captured_amount?: BigNumberValue | null
    refunded_amount?: BigNumberValue | null
  }[]
  items?: {
    product_id?: string | null
    product_title?: string | null
    title?: string | null
    quantity?: BigNumberValue | null
  }[]
}

/**
 * Running totals built up while we page through orders. The route fetches
 * orders in batches (so we never hold every order in memory at once) and
 * feeds each batch into `addOrdersToSalesSummary`.
 */
export type SalesSummaryAccumulator = {
  /** Sum of `getOrderRevenue` for qualifying orders. */
  revenue: ReturnType<typeof MathBN.convert>
  /** Number of qualifying orders. */
  orderCount: number
  /** Units sold per product, keyed by `product_id`. */
  unitsByProduct: Map<
    string,
    { title: string; units: ReturnType<typeof MathBN.convert> }
  >
}

/**
 * Creates an empty accumulator. With no orders added, `finalizeSalesSummary`
 * returns zeros, which the dashboard shows as its empty state.
 */
export const createSalesSummaryAccumulator = (): SalesSummaryAccumulator => ({
  revenue: MathBN.convert(0),
  orderCount: 0,
  unitsByProduct: new Map(),
})

/**
 * Returns whether an order should count towards the sales summary, i.e. it is
 * a real (non-draft), non-canceled, paid order.
 *
 * The route already filters drafts and canceled orders in the database query;
 * checking again here keeps this function correct on its own, which makes it
 * safe to reuse and easy to unit test.
 */
export const isQualifyingOrder = (order: SalesSummaryOrder): boolean => {
  if (order.is_draft_order) {
    return false
  }

  if (order.status && EXCLUDED_ORDER_STATUSES.includes(order.status)) {
    return false
  }

  // `getLastPaymentStatus` iterates `payment_collections`, so make sure it is
  // always an array. An order without payment collections is "not_paid".
  const paymentStatus = getLastPaymentStatus({
    ...order,
    payment_collections: order.payment_collections ?? [],
  } as unknown as OrderDetailDTO)

  return PAID_PAYMENT_STATUSES.includes(paymentStatus)
}

/**
 * Returns how much of an order counts as revenue: the smaller of what the
 * order is worth and what the merchant actually kept.
 *
 * The order summary tracks these two things separately:
 *
 * - `current_order_total`: what the order is worth. It goes down when items
 *   are returned or the order is edited, but a refund made directly from the
 *   payment (e.g. a goodwill refund with no return) isn't guaranteed to lower
 *   it: that only happens when the refund workflow also adds a refund credit
 *   line to the order, so it can't be relied on to reflect refunds.
 * - `transaction_total`: money paid minus money refunded. It goes down on
 *   every refund, but it doesn't change when a return is requested and the
 *   refund hasn't been issued yet.
 *
 * Taking the minimum handles both cases without counting anything twice:
 *
 * | Scenario ($100 order)           | current | transaction | counted |
 * | ------------------------------- | ------- | ----------- | ------- |
 * | Fully paid                      | 100     | 100         | 100     |
 * | $30 refund, no return           | 100     | 70          | 70      |
 * | $30 item returned and refunded  | 70      | 70          | 70      |
 * | $30 item returned, not refunded | 70      | 100         | 70      |
 * | Only $60 captured so far        | 100     | 60          | 60      |
 *
 * Simply subtracting the refunded amount from `current_order_total` would be
 * wrong: for a returned and refunded item the total has already dropped, so
 * the refund would be taken off a second time (100 - 30 - 30 = 40).
 */
export const getOrderRevenue = (
  order: SalesSummaryOrder
): ReturnType<typeof MathBN.convert> => {
  // A missing summary is treated as 0 rather than failing, so one bad order
  // can't break the whole dashboard.
  const currentTotal = order.summary?.current_order_total ?? 0

  // Fall back to the order total when `transaction_total` is missing, which
  // keeps the old behavior instead of silently counting the order as 0.
  const transactionTotal = order.summary?.transaction_total ?? currentTotal

  const revenue = MathBN.min(currentTotal, transactionTotal)

  // Safety net: an order should never reduce revenue (e.g. if more was
  // refunded than captured because of bad data), so clamp at 0.
  return MathBN.max(revenue, 0)
}

/**
 * Adds a batch of orders to the running totals. Orders that don't qualify
 * (see `isQualifyingOrder`) or that are in a different currency than the one
 * being reported are skipped.
 *
 * Amounts are added with `MathBN` (a BigNumber wrapper) rather than plain `+`
 * to avoid floating point rounding errors when summing many prices.
 */
export const addOrdersToSalesSummary = (
  accumulator: SalesSummaryAccumulator,
  orders: SalesSummaryOrder[],
  currencyCode: string
): void => {
  for (const order of orders) {
    // Revenue in different currencies can't be summed, so only count orders
    // in the currency we're reporting in. The route also filters this in the
    // query; the check here is a safety net.
    if (order.currency_code?.toLowerCase() !== currencyCode.toLowerCase()) {
      continue
    }

    if (!isQualifyingOrder(order)) {
      continue
    }

    accumulator.orderCount += 1

    // Count the order's value net of refunds (see `getOrderRevenue`), so a
    // partially refunded order no longer adds its full total.
    accumulator.revenue = MathBN.add(
      accumulator.revenue,
      getOrderRevenue(order)
    )

    for (const item of order.items ?? []) {
      // Custom line items (not created from a product) have no product_id and
      // can't be grouped into a "product", so they are left out of the
      // top products list. They still count towards revenue via the total.
      if (!item.product_id) {
        continue
      }

      const existing = accumulator.unitsByProduct.get(item.product_id)
      const quantity = item.quantity ?? 0

      if (existing) {
        existing.units = MathBN.add(existing.units, quantity)
      } else {
        accumulator.unitsByProduct.set(item.product_id, {
          // Prefer the product title over the line item title (which may
          // include the variant, e.g. "T-Shirt / Large").
          title: item.product_title || item.title || item.product_id,
          units: MathBN.convert(quantity),
        })
      }
    }
  }
}

/**
 * Turns the running totals into the response shape returned by the API. The
 * date range isn't known here, so the route adds `start_date` and `end_date`.
 *
 * Products are sorted by units sold (highest first). Ties are broken by title
 * so the order is stable between page loads, then the list is cut down to
 * `TOP_PRODUCTS_LIMIT` entries.
 */
export const finalizeSalesSummary = (
  accumulator: SalesSummaryAccumulator,
  currencyCode: string | null
): Omit<HttpTypes.AdminSalesSummary, "start_date" | "end_date"> => {
  const topProducts = Array.from(accumulator.unitsByProduct.entries())
    .map(([productId, { title, units }]) => ({
      product_id: productId,
      title,
      units_sold: units.toNumber(),
    }))
    .sort(
      (a, b) => b.units_sold - a.units_sold || a.title.localeCompare(b.title)
    )
    .slice(0, TOP_PRODUCTS_LIMIT)

  return {
    currency_code: currencyCode,
    total_revenue: accumulator.revenue.toNumber(),
    order_count: accumulator.orderCount,
    top_products: topProducts,
  }
}
