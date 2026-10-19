import {
  DEFAULT_RANGE_DAYS,
  getRequestedRange,
  isRangeWithinLimit,
  resolveDateRange,
} from "../date-range"
import { AdminGetSalesSummaryParams } from "../validators"

const NOW = new Date("2026-10-07T15:30:00.000Z")
const DAY_MS = 24 * 60 * 60 * 1000

describe("getRequestedRange", () => {
  it("defaults to the last 7 days when no dates are given", () => {
    const { start, end } = getRequestedRange({}, NOW)

    expect(end).toEqual(NOW)
    expect(start).toEqual(new Date(NOW.getTime() - DEFAULT_RANGE_DAYS * DAY_MS))
  })

  it("ends now when only a start date is given", () => {
    const start_date = new Date("2026-09-01T00:00:00.000Z")

    expect(getRequestedRange({ start_date }, NOW)).toEqual({
      start: start_date,
      end: NOW,
    })
  })

  it("starts 7 days before the end when only an end date is given", () => {
    const end_date = new Date("2026-09-30T23:59:59.999Z")

    const { start, end } = getRequestedRange({ end_date }, NOW)

    expect(end).toEqual(end_date)
    expect(start).toEqual(new Date(end_date.getTime() - 7 * DAY_MS))
  })
})

describe("isRangeWithinLimit", () => {
  const end = new Date("2026-10-07T23:59:59.999Z")

  it("allows a range of exactly 12 months", () => {
    expect(isRangeWithinLimit(new Date("2025-10-07T23:59:59.999Z"), end)).toBe(
      true
    )
  })

  it("allows a range that is a few hours over because of time zones", () => {
    expect(isRangeWithinLimit(new Date("2025-10-07T10:00:00.000Z"), end)).toBe(
      true
    )
  })

  it("allows a full year that includes a leap day", () => {
    expect(
      isRangeWithinLimit(
        new Date("2024-03-01T00:00:00.000Z"),
        new Date("2025-02-28T23:59:59.999Z")
      )
    ).toBe(true)
  })

  it("rejects a range longer than 12 months", () => {
    expect(isRangeWithinLimit(new Date("2025-09-01T00:00:00.000Z"), end)).toBe(
      false
    )
  })
})

describe("resolveDateRange", () => {
  it("keeps dates in the past as they are", () => {
    const start_date = new Date("2026-09-01T00:00:00.000Z")
    const end_date = new Date("2026-09-14T23:59:59.999Z")

    expect(resolveDateRange({ start_date, end_date }, NOW)).toEqual({
      start: start_date,
      end: end_date,
    })
  })

  it("treats an end date in the future as now", () => {
    const start_date = new Date("2026-10-01T00:00:00.000Z")
    const end_date = new Date("2026-10-07T23:59:59.999Z")

    expect(resolveDateRange({ start_date, end_date }, NOW).end).toEqual(NOW)
  })
})

describe("AdminGetSalesSummaryParams", () => {
  it("accepts an empty query", () => {
    expect(AdminGetSalesSummaryParams.safeParse({}).success).toBe(true)
  })

  it("parses ISO dates into Date objects", () => {
    const result = AdminGetSalesSummaryParams.parse({
      start_date: "2026-09-01T00:00:00.000Z",
      end_date: "2026-09-14T23:59:59.999Z",
    })

    expect(result.start_date).toEqual(new Date("2026-09-01T00:00:00.000Z"))
    expect(result.end_date).toEqual(new Date("2026-09-14T23:59:59.999Z"))
  })

  it("rejects an end date before the start date", () => {
    const result = AdminGetSalesSummaryParams.safeParse({
      start_date: "2026-09-14T00:00:00.000Z",
      end_date: "2026-09-01T00:00:00.000Z",
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toContain("end_date")
  })

  it("rejects a range longer than 12 months", () => {
    const result = AdminGetSalesSummaryParams.safeParse({
      start_date: "2024-01-01T00:00:00.000Z",
      end_date: "2025-06-01T00:00:00.000Z",
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toContain("12 months")
  })

  it("rejects a start date more than 12 months ago when no end date is given", () => {
    const result = AdminGetSalesSummaryParams.safeParse({
      start_date: "2020-01-01T00:00:00.000Z",
    })

    expect(result.success).toBe(false)
  })

  it("rejects dates that are not valid", () => {
    expect(
      AdminGetSalesSummaryParams.safeParse({ start_date: "not-a-date" }).success
    ).toBe(false)
  })
})
