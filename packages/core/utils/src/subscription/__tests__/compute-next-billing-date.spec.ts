import { computeNextBillingDate, SubscriptionInterval } from "../subscription"

describe("computeNextBillingDate", () => {
  it("adds seven days for a weekly interval", () => {
    const next = computeNextBillingDate(
      new Date("2026-12-29T10:00:00.000Z"),
      SubscriptionInterval.WEEKLY
    )

    expect(next.toISOString()).toEqual("2027-01-05T10:00:00.000Z")
  })

  it("adds one month for a monthly interval", () => {
    const next = computeNextBillingDate(
      new Date("2026-03-15T10:00:00.000Z"),
      SubscriptionInterval.MONTHLY
    )

    expect(next.toISOString()).toEqual("2026-04-15T10:00:00.000Z")
  })

  it("clamps a monthly interval to the end of a shorter month", () => {
    const next = computeNextBillingDate(
      new Date("2026-01-31T10:00:00.000Z"),
      SubscriptionInterval.MONTHLY
    )

    expect(next.toISOString()).toEqual("2026-02-28T10:00:00.000Z")
  })

  it("rolls a monthly interval over to the next year", () => {
    const next = computeNextBillingDate(
      new Date("2026-12-31T10:00:00.000Z"),
      SubscriptionInterval.MONTHLY
    )

    expect(next.toISOString()).toEqual("2027-01-31T10:00:00.000Z")
  })

  it("adds one year for a yearly interval", () => {
    const next = computeNextBillingDate(
      new Date("2026-06-01T10:00:00.000Z"),
      SubscriptionInterval.YEARLY
    )

    expect(next.toISOString()).toEqual("2027-06-01T10:00:00.000Z")
  })

  it("clamps a yearly interval from a leap day", () => {
    const next = computeNextBillingDate(
      new Date("2028-02-29T10:00:00.000Z"),
      SubscriptionInterval.YEARLY
    )

    expect(next.toISOString()).toEqual("2029-02-28T10:00:00.000Z")
  })

  it("does not mutate the input date", () => {
    const from = new Date("2026-03-15T10:00:00.000Z")

    computeNextBillingDate(from, SubscriptionInterval.MONTHLY)

    expect(from.toISOString()).toEqual("2026-03-15T10:00:00.000Z")
  })
})
