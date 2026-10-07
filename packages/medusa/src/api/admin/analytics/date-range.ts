/**
 * Date range rules for `GET /admin/analytics/sales-summary` (issue #30).
 *
 * Kept free of other imports so both the request validator and the route can
 * use it without pulling in the order helpers.
 */

/**
 * How many days the summary covers when the request names no dates. The
 * dashboard shows "Last 7 days" on every page load, so the API defaults to the
 * same window.
 */
export const DEFAULT_RANGE_DAYS = 7

/**
 * The longest range a request may cover, in calendar months. The route reads
 * every order in the range, so this bounds how much work one request can ask
 * for.
 */
export const MAX_RANGE_MONTHS = 12

/**
 * Extra time allowed on top of `MAX_RANGE_MONTHS`. Clients send local day
 * boundaries converted to UTC, so a "last year" range can run a few hours past
 * twelve calendar months once time zones and daylight saving changes are
 * counted. A day of slack keeps those requests valid.
 */
const MAX_RANGE_GRACE_MS = 24 * 60 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

export type SalesSummaryDateParams = {
  start_date?: Date
  end_date?: Date
}

/**
 * The dates a request actually covers, before they are clamped to "now". A
 * missing end date means "up to now", and a missing start date means
 * `DEFAULT_RANGE_DAYS` before the end.
 */
export const getRequestedRange = (
  params: SalesSummaryDateParams,
  now: Date = new Date()
): { start: Date; end: Date } => {
  const end = params.end_date ?? now
  const start =
    params.start_date ?? new Date(end.getTime() - DEFAULT_RANGE_DAYS * DAY_MS)

  return { start, end }
}

/**
 * Returns whether the range is no longer than `MAX_RANGE_MONTHS` (plus the
 * grace period). Months are counted on the calendar, so a leap year doesn't
 * make a one year range too long.
 */
export const isRangeWithinLimit = (start: Date, end: Date): boolean => {
  const earliestStart = new Date(end)
  earliestStart.setUTCMonth(earliestStart.getUTCMonth() - MAX_RANGE_MONTHS)

  return start.getTime() >= earliestStart.getTime() - MAX_RANGE_GRACE_MS
}

/**
 * Works out the range the route should query. The end is clamped to now:
 * orders can't be placed in the future, and clients send the end of the
 * current local day, which is usually still ahead of the server clock.
 */
export const resolveDateRange = (
  params: SalesSummaryDateParams,
  now: Date = new Date()
): { start: Date; end: Date } => {
  const { start, end } = getRequestedRange(params, now)

  return { start, end: end.getTime() > now.getTime() ? now : end }
}
