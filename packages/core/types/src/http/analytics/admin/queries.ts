/**
 * The query parameters accepted by `GET /admin/analytics/sales-summary`.
 *
 * This type mirrors the `AdminGetSalesSummaryParams` validator in
 * `packages/medusa/src/api/admin/analytics/validators.ts`, which the
 * "Validate HTTP Types" CI check requires. Add fields here whenever you add
 * them to the validator.
 */
export interface AdminGetSalesSummaryParams {
  /**
   * Only count orders placed on or after this date. Defaults to 7 days before
   * `end_date`. The range between `start_date` and `end_date` can't be longer
   * than 12 months.
   *
   * @example
   * "2026-09-30T00:00:00.000Z"
   */
  start_date?: string
  /**
   * Only count orders placed on or before this date. It can't be before
   * `start_date`. Dates in the future are treated as the current time.
   * Defaults to the current time.
   *
   * @example
   * "2026-10-07T23:59:59.999Z"
   */
  end_date?: string
}
