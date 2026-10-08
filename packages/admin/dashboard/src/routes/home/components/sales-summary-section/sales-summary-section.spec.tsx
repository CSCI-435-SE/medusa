// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { differenceInCalendarDays } from "date-fns"
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { getLocaleAmount } from "../../../../lib/money-amount-helpers"
import { SalesSummarySection } from "./sales-summary-section"

// `lib/client` reads these build-time globals when it is imported (via the
// analytics hook), so they must exist before any imports run.
vi.hoisted(() => {
  const g = global as any
  g.__BACKEND_URL__ = "http://localhost:9000"
  g.__AUTH_TYPE__ = "session"
  g.__JWT_TOKEN_STORAGE_KEY__ = ""
})

// Return the translation key itself so assertions don't depend on the English
// copy. For pluralised strings, append the count so we can check it.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count !== undefined ? `${key}:${options.count}` : key,
  }),
}))

// `@medusajs/icons` resolves its own copy of React in the monorepo, which
// makes rendering real icons fail under jsdom. Stub the icons used by this
// component and by `NoRecords`, as other dashboard specs do.
vi.mock("@medusajs/icons", () => ({
  ExclamationCircle: () => <div data-testid="exclamation-circle" />,
  PlusMini: () => <div data-testid="plus-mini" />,
  // Used by the interval dropdown and the custom range date pickers.
  Check: () => <div />,
  TrianglesMini: () => <div />,
  TriangleLeftMini: () => <div />,
  TriangleRightMini: () => <div />,
  CalendarMini: () => <div />,
  Clock: () => <div />,
  XMarkMini: () => <div />,
}))

// Replace the data hook so each test can control what the API "returned"
// without a QueryClient or network.
const useSalesSummaryMock = vi.fn()
vi.mock("../../../../hooks/api/analytics", () => ({
  useSalesSummary: (query?: unknown) => useSalesSummaryMock(query),
}))

/**
 * Sets what `useSalesSummary` returns for the current test.
 */
const mockHook = (state: {
  sales_summary?: unknown
  isPending?: boolean
  isError?: boolean
}) => {
  useSalesSummaryMock.mockReturnValue({
    isPending: false,
    isError: false,
    ...state,
  })
}

/**
 * The query the panel most recently asked `useSalesSummary` for.
 */
const lastQuery = () =>
  useSalesSummaryMock.mock.calls[useSalesSummaryMock.mock.calls.length - 1][0]

/**
 * Whole days (local time) from the start of the requested range to its end,
 * counting both ends: a 7 day range returns 7.
 */
const daysCovered = (query: { start_date: string; end_date: string }) =>
  differenceInCalendarDays(
    new Date(query.end_date),
    new Date(query.start_date)
  ) + 1

const EMPTY_SUMMARY = {
  currency_code: "usd",
  total_revenue: 0,
  order_count: 0,
  top_products: [],
}

// jsdom doesn't implement the pointer capture and scrolling APIs the Radix
// select relies on, so opening the interval dropdown needs these stand-ins.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.scrollIntoView = () => {}
})

beforeEach(() => {
  useSalesSummaryMock.mockReset()
})

afterEach(() => {
  cleanup()
})

describe("SalesSummarySection", () => {
  it("shows revenue, order count, and the top products", () => {
    mockHook({
      sales_summary: {
        currency_code: "usd",
        total_revenue: 1250.5,
        order_count: 17,
        top_products: [
          { product_id: "prod_a", title: "Shirt", units_sold: 12 },
          { product_id: "prod_b", title: "Pants", units_sold: 7 },
          { product_id: "prod_c", title: "Hat", units_sold: 1 },
        ],
      },
    })

    render(<SalesSummarySection />)

    // Revenue is formatted in the store's currency with the browser locale.
    expect(screen.getByText(getLocaleAmount(1250.5, "usd"))).toBeTruthy()
    expect(screen.getByText("17")).toBeTruthy()

    // All three products are listed with their units sold.
    expect(screen.getByText("Shirt")).toBeTruthy()
    expect(screen.getByText("Pants")).toBeTruthy()
    expect(screen.getByText("Hat")).toBeTruthy()
    expect(screen.getByText("home.salesSummary.unitsSold:12")).toBeTruthy()
    expect(screen.getByText("home.salesSummary.unitsSold:1")).toBeTruthy()

    // No empty-state messaging when there is data.
    expect(screen.queryByText("home.salesSummary.noSalesTitle")).toBeNull()
    expect(screen.queryByText("home.salesSummary.noOrdersHint")).toBeNull()
  })

  it("keeps the products in the order returned by the API", () => {
    mockHook({
      sales_summary: {
        currency_code: "usd",
        total_revenue: 10,
        order_count: 1,
        top_products: [
          { product_id: "prod_b", title: "Second best", units_sold: 5 },
          { product_id: "prod_a", title: "Best", units_sold: 9 },
        ],
      },
    })

    render(<SalesSummarySection />)

    const items = screen.getAllByRole("listitem")
    expect(items[0].textContent).toContain("Second best")
    expect(items[1].textContent).toContain("Best")
  })

  it("shows a zero state with messages when there are no orders", () => {
    mockHook({
      sales_summary: {
        currency_code: "usd",
        total_revenue: 0,
        order_count: 0,
        top_products: [],
      },
    })

    render(<SalesSummarySection />)

    // Each metric shows zero rather than an error or blank space.
    expect(screen.getByText(getLocaleAmount(0, "usd"))).toBeTruthy()
    expect(screen.getByText("0")).toBeTruthy()

    // ...with a short explanation under both metrics and the products list.
    expect(screen.getAllByText("home.salesSummary.noOrdersHint")).toHaveLength(
      2
    )
    expect(screen.getByText("home.salesSummary.noSalesTitle")).toBeTruthy()
    expect(screen.getByText("home.salesSummary.noSalesMessage")).toBeTruthy()
  })

  it("explains how to fix a missing default currency", () => {
    mockHook({
      sales_summary: {
        currency_code: null,
        total_revenue: 0,
        order_count: 0,
        top_products: [],
      },
    })

    render(<SalesSummarySection />)

    expect(screen.getByText("home.salesSummary.noCurrencyHint")).toBeTruthy()
  })

  it("does not show figures while loading", () => {
    mockHook({ isPending: true })

    render(<SalesSummarySection />)

    // The header stays visible so the layout doesn't jump.
    expect(screen.getByText("home.salesSummary.title")).toBeTruthy()
    expect(screen.queryByText("home.salesSummary.totalRevenue")).toBeNull()
    expect(screen.queryByText("home.salesSummary.errorTitle")).toBeNull()
  })

  it("shows an inline error instead of crashing when the request fails", () => {
    mockHook({ isError: true })

    render(<SalesSummarySection />)

    expect(screen.getByText("home.salesSummary.errorTitle")).toBeTruthy()
    expect(screen.getByText("home.salesSummary.errorMessage")).toBeTruthy()
    expect(screen.queryByText("home.salesSummary.totalRevenue")).toBeNull()
  })

  describe("time interval", () => {
    it("starts on the last 7 days", () => {
      mockHook({ sales_summary: EMPTY_SUMMARY })

      render(<SalesSummarySection />)

      expect(daysCovered(lastQuery())).toEqual(7)
      expect(
        screen.getByRole("combobox", {
          name: "home.salesSummary.interval.label",
        }).textContent
      ).toContain("home.salesSummary.interval.week")
      expect(
        screen.queryByLabelText("home.salesSummary.interval.startDate")
      ).toBeNull()
    })

    it.each([
      ["month", 30],
      ["quarter", 90],
      ["year", 365],
    ])("requests the %s preset when it is selected", async (preset, days) => {
      mockHook({ sales_summary: EMPTY_SUMMARY })
      const user = userEvent.setup()

      render(<SalesSummarySection />)

      await user.click(
        screen.getByRole("combobox", {
          name: "home.salesSummary.interval.label",
        })
      )
      await user.click(
        await screen.findByRole("option", {
          name: `home.salesSummary.interval.${preset}`,
        })
      )

      // Quarters and years are calendar based, so allow for month lengths and
      // leap years.
      expect(Math.abs(daysCovered(lastQuery()) - days)).toBeLessThanOrEqual(3)
    })

    it("shows start and end date pickers for a custom range", async () => {
      mockHook({ sales_summary: EMPTY_SUMMARY })
      const user = userEvent.setup()

      render(<SalesSummarySection />)

      await user.click(
        screen.getByRole("combobox", {
          name: "home.salesSummary.interval.label",
        })
      )
      await user.click(
        await screen.findByRole("option", {
          name: "home.salesSummary.interval.custom",
        })
      )

      expect(
        screen.getByLabelText("home.salesSummary.interval.startDate")
      ).toBeTruthy()
      expect(
        screen.getByLabelText("home.salesSummary.interval.endDate")
      ).toBeTruthy()
      // The range starts from the previous period until dates are changed.
      expect(daysCovered(lastQuery())).toEqual(7)
    })
  })
})
