/**
 * A single row in the "top selling products" list of the sales summary.
 *
 * Products are ranked by the total number of units ordered across all
 * qualifying (paid, non-draft, non-canceled) orders.
 */
export interface AdminSalesSummaryTopProduct {
  /**
   * The ID of the product. Line items keep a reference to the product they
   * were created from, so this is used to group units across orders.
   *
   * @example
   * "prod_123"
   */
  product_id: string
  /**
   * The product's title. This comes from the line item snapshot taken when
   * the order was placed, so it reflects the title at the time of purchase.
   *
   * @example
   * "Medusa T-Shirt"
   */
  title: string
  /**
   * The total number of units of this product sold across all qualifying
   * orders.
   *
   * @example
   * 42
   */
  units_sold: number
}

/**
 * The store's sales performance over a date range, shown on the admin
 * dashboard home page.
 *
 * Only orders placed within the date range are counted, using the order's
 * creation time. Of those, only orders that are not drafts, not canceled, and have been paid
 * (captured, partially captured, or partially refunded payments) are counted.
 * Only orders in the store's default currency are included, since amounts in
 * different currencies can't be summed into a single meaningful number.
 */
export interface AdminSalesSummary {
  /**
   * The store's default currency code that all revenue figures are expressed
   * in. This is `null` if the store has no default currency configured, in
   * which case all metrics are zero.
   *
   * @example
   * "usd"
   */
  currency_code: string | null
  /**
   * The start of the date range the figures cover, as an ISO 8601 date-time.
   *
   * @example
   * "2026-09-30T00:00:00.000Z"
   */
  start_date: string
  /**
   * The end of the date range the figures cover, as an ISO 8601 date-time.
   * This is never later than the time of the request.
   *
   * @example
   * "2026-10-07T15:30:00.000Z"
   */
  end_date: string
  /**
   * The revenue from all qualifying orders, net of refunds, in the major
   * unit of the currency (for example, `10.5` means $10.50). Each order
   * counts the smaller of its current total and the amount paid minus the
   * amount refunded, so partial refunds and returns lower the revenue.
   *
   * @example
   * 1250.5
   */
  total_revenue: number
  /**
   * The number of qualifying orders.
   *
   * @example
   * 17
   */
  order_count: number
  /**
   * Up to three of the best selling products, ordered by units sold from
   * highest to lowest. Empty when there are no qualifying orders.
   */
  top_products: AdminSalesSummaryTopProduct[]
}
