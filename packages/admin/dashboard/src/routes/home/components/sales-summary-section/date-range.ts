import {
  addDays,
  addYears,
  endOfDay,
  startOfDay,
  subDays,
  subMonths,
  subYears,
} from "date-fns"

/**
 * The time periods the sales overview can show (issue #30). `custom` lets the
 * merchant pick the start and end dates themselves.
 */
export type SalesSummaryInterval =
  | "week"
  | "month"
  | "quarter"
  | "year"
  | "custom"

export const PRESET_INTERVALS = ["week", "month", "quarter", "year"] as const

/**
 * The period shown on every page load.
 */
export const DEFAULT_INTERVAL = "week" satisfies SalesSummaryInterval

export type DateRange = {
  start: Date
  end: Date
}

/**
 * Returns the date range for a preset, in the merchant's local time. Ranges
 * are whole days and include today, e.g. "Last 7 days" is today and the six
 * days before it. The backend rejects ranges longer than 12 months, so the
 * year preset starts one day after the same date last year.
 */
export const getPresetRange = (
  interval: (typeof PRESET_INTERVALS)[number],
  now: Date = new Date()
): DateRange => {
  const today = startOfDay(now)

  const start = {
    week: subDays(today, 6),
    month: subDays(today, 29),
    quarter: addDays(subMonths(today, 3), 1),
    year: addDays(subYears(today, 1), 1),
  }[interval]

  return { start, end: endOfDay(now) }
}

/**
 * The earliest start date the custom picker allows for a given end date. It
 * mirrors the backend's 12 month limit.
 */
export const getEarliestStart = (end: Date): Date =>
  startOfDay(addDays(subYears(end, 1), 1))

/**
 * The latest end date the custom picker allows for a given start date: the
 * end of today at the latest (future dates can't have orders), and no more
 * than 12 months after the start.
 */
export const getLatestEnd = (start: Date, now: Date = new Date()): Date => {
  const limit = endOfDay(subDays(addYears(start, 1), 1))

  return limit < now ? limit : endOfDay(now)
}
