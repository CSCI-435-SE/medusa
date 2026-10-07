import { addYears, differenceInCalendarDays, subDays } from "date-fns"
import { describe, expect, it } from "vitest"

import {
  getEarliestStart,
  getLatestEnd,
  getPresetRange,
  PRESET_INTERVALS,
} from "./date-range"

// A fixed "now" in the middle of a day, so tests don't depend on the clock.
const NOW = new Date(2026, 9, 7, 15, 30)

const daysCovered = (range: { start: Date; end: Date }) =>
  differenceInCalendarDays(range.end, range.start) + 1

describe("getPresetRange", () => {
  it("covers whole days, ending at the end of today", () => {
    for (const interval of PRESET_INTERVALS) {
      const { start, end } = getPresetRange(interval, NOW)

      expect(start.getHours()).toEqual(0)
      expect(start.getMinutes()).toEqual(0)
      expect(end.getFullYear()).toEqual(2026)
      expect(end.getDate()).toEqual(7)
      expect(end.getHours()).toEqual(23)
      expect(end.getMinutes()).toEqual(59)
    }
  })

  it("includes today in the last 7 and 30 days", () => {
    expect(daysCovered(getPresetRange("week", NOW))).toEqual(7)
    expect(daysCovered(getPresetRange("month", NOW))).toEqual(30)
  })

  it("covers 3 and 12 calendar months for the quarter and year", () => {
    // 2026-07-08 to 2026-10-07 and 2025-10-08 to 2026-10-07.
    expect(getPresetRange("quarter", NOW).start).toEqual(new Date(2026, 6, 8))
    expect(getPresetRange("year", NOW).start).toEqual(new Date(2025, 9, 8))
  })

  it("keeps the year preset within the custom picker's earliest start", () => {
    const { start, end } = getPresetRange("year", NOW)

    expect(start.getTime()).toBeGreaterThanOrEqual(
      getEarliestStart(end).getTime()
    )
  })
})

describe("custom range limits", () => {
  it("does not allow starting more than 12 months before the end", () => {
    const end = new Date(2026, 9, 7, 23, 59, 59, 999)

    expect(getEarliestStart(end)).toEqual(new Date(2025, 9, 8))
  })

  it("does not allow ending in the future", () => {
    const start = subDays(NOW, 3)

    const latest = getLatestEnd(start, NOW)

    expect(latest.getDate()).toEqual(7)
    expect(latest.getHours()).toEqual(23)
  })

  it("does not allow ending more than 12 months after the start", () => {
    const start = new Date(2024, 0, 15)

    const latest = getLatestEnd(start, NOW)

    // 2025-01-14 is the last day within 12 months of 2024-01-15.
    expect(latest.getTime()).toBeLessThan(addYears(start, 1).getTime())
    expect(latest.getFullYear()).toEqual(2025)
    expect(latest.getMonth()).toEqual(0)
    expect(latest.getDate()).toEqual(14)
  })
})
