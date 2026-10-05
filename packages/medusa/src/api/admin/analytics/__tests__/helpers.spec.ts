import {
  addOrdersToSalesSummary,
  createSalesSummaryAccumulator,
  finalizeSalesSummary,
  getOrderRevenue,
  isQualifyingOrder,
  SalesSummaryOrder,
} from "../helpers"

/**
 * Builds an order in the shape returned by `query.graph`. By default the order
 * is a fully paid (captured) USD order with a total of 100, so each test only
 * overrides the fields it cares about.
 */
const buildOrder = (
  overrides: Partial<SalesSummaryOrder> = {}
): SalesSummaryOrder => ({
  id: "order_1",
  status: "pending",
  is_draft_order: false,
  currency_code: "usd",
  // Fully paid and nothing refunded, so both totals are 100.
  summary: { current_order_total: 100, transaction_total: 100 },
  payment_collections: [
    {
      status: "completed",
      amount: 100,
      captured_amount: 100,
      refunded_amount: 0,
    },
  ],
  items: [],
  ...overrides,
})

/**
 * Runs the full accumulate -> finalize flow, the same way the route does.
 */
const summarize = (orders: SalesSummaryOrder[], currencyCode = "usd") => {
  const accumulator = createSalesSummaryAccumulator()
  addOrdersToSalesSummary(accumulator, orders, currencyCode)
  return finalizeSalesSummary(accumulator, currencyCode)
}

describe("sales summary helpers", () => {
  describe("isQualifyingOrder", () => {
    it("should include a fully captured order", () => {
      expect(isQualifyingOrder(buildOrder())).toBe(true)
    })

    it("should include a pending order that has been paid", () => {
      // Most paid orders stay "pending" in Medusa, so they must count.
      expect(isQualifyingOrder(buildOrder({ status: "pending" }))).toBe(true)
    })

    it("should include a completed order", () => {
      expect(isQualifyingOrder(buildOrder({ status: "completed" }))).toBe(true)
    })

    it("should exclude draft orders", () => {
      expect(isQualifyingOrder(buildOrder({ status: "draft" }))).toBe(false)
      expect(isQualifyingOrder(buildOrder({ is_draft_order: true }))).toBe(
        false
      )
    })

    it("should exclude canceled orders", () => {
      expect(isQualifyingOrder(buildOrder({ status: "canceled" }))).toBe(false)
    })

    it("should exclude orders that are only authorized", () => {
      const order = buildOrder({
        payment_collections: [
          {
            status: "authorized",
            amount: 100,
            captured_amount: 0,
            refunded_amount: 0,
          },
        ],
      })

      expect(isQualifyingOrder(order)).toBe(false)
    })

    it("should exclude orders with no payment collections", () => {
      expect(isQualifyingOrder(buildOrder({ payment_collections: [] }))).toBe(
        false
      )
      expect(
        isQualifyingOrder(buildOrder({ payment_collections: undefined }))
      ).toBe(false)
    })

    it("should include partially captured orders", () => {
      const order = buildOrder({
        payment_collections: [
          {
            status: "partially_captured",
            amount: 100,
            captured_amount: 40,
            refunded_amount: 0,
          },
        ],
      })

      expect(isQualifyingOrder(order)).toBe(true)
    })

    it("should include partially refunded orders", () => {
      const order = buildOrder({
        payment_collections: [
          {
            status: "completed",
            amount: 100,
            captured_amount: 100,
            refunded_amount: 30,
          },
        ],
      })

      expect(isQualifyingOrder(order)).toBe(true)
    })

    it("should exclude fully refunded orders", () => {
      const order = buildOrder({
        payment_collections: [
          {
            status: "completed",
            amount: 100,
            captured_amount: 100,
            refunded_amount: 100,
          },
        ],
      })

      expect(isQualifyingOrder(order)).toBe(false)
    })
  })

  // Each test here is one row of the scenario table in the `getOrderRevenue`
  // doc comment. `current` = current_order_total (what the order is worth),
  // `transaction` = transaction_total (paid minus refunded).
  describe("getOrderRevenue", () => {
    const revenueOf = (current: number, transaction: number) =>
      getOrderRevenue(
        buildOrder({
          summary: {
            current_order_total: current,
            transaction_total: transaction,
          },
        })
      ).toNumber()

    it("should count the full total of a fully paid order", () => {
      expect(revenueOf(100, 100)).toBe(100)
    })

    it("should subtract a refund that wasn't tied to a return", () => {
      // The bug this guards against: a $30 refund leaves the order total at
      // 100, and we used to count all 100 as revenue.
      expect(revenueOf(100, 70)).toBe(70)
    })

    it("should not subtract a refund twice when an item was returned", () => {
      // The return already lowered the total to 70, and the refund lowered
      // the transactions to 70. Revenue is 70, not 100 - 30 - 30 = 40.
      expect(revenueOf(70, 70)).toBe(70)
    })

    it("should not count money still owed back for a returned item", () => {
      // The item was returned but the refund hasn't been issued yet.
      expect(revenueOf(70, 100)).toBe(70)
    })

    it("should only count the captured part of a partially captured order", () => {
      expect(revenueOf(100, 60)).toBe(60)
    })

    it("should never return a negative amount", () => {
      // More refunded than paid shouldn't happen, but bad data shouldn't be
      // able to lower the store's total revenue.
      expect(revenueOf(100, -20)).toBe(0)
    })

    it("should fall back to the order total when transaction_total is missing", () => {
      const order = buildOrder({ summary: { current_order_total: 100 } })

      expect(getOrderRevenue(order).toNumber()).toBe(100)
    })

    it("should treat a missing summary as zero", () => {
      expect(getOrderRevenue(buildOrder({ summary: null })).toNumber()).toBe(0)
    })
  })

  describe("sales summary aggregation", () => {
    it("should return a zero state when there are no orders", () => {
      expect(summarize([])).toEqual({
        currency_code: "usd",
        total_revenue: 0,
        order_count: 0,
        top_products: [],
      })
    })

    it("should return a null currency when the store has none", () => {
      const accumulator = createSalesSummaryAccumulator()

      expect(finalizeSalesSummary(accumulator, null)).toEqual({
        currency_code: null,
        total_revenue: 0,
        order_count: 0,
        top_products: [],
      })
    })

    it("should sum revenue and count only qualifying orders", () => {
      const summary = summarize([
        buildOrder({ id: "o1", summary: { current_order_total: 100 } }),
        buildOrder({ id: "o2", summary: { current_order_total: 50.25 } }),
        buildOrder({ id: "o3", status: "canceled" }),
        buildOrder({ id: "o4", payment_collections: [] }),
      ])

      expect(summary.order_count).toBe(2)
      expect(summary.total_revenue).toBe(150.25)
    })

    it("should count partially refunded orders net of the refund", () => {
      const summary = summarize([
        buildOrder({ id: "o1" }),
        // $100 order with a $30 refund and no return: only $70 was kept.
        buildOrder({
          id: "o2",
          summary: { current_order_total: 100, transaction_total: 70 },
          payment_collections: [
            {
              status: "completed",
              amount: 100,
              captured_amount: 100,
              refunded_amount: 30,
            },
          ],
        }),
      ])

      // The refunded order still counts as a sale...
      expect(summary.order_count).toBe(2)
      // ...but only contributes what the merchant kept (100 + 70).
      expect(summary.total_revenue).toBe(170)
    })

    it("should not lose precision when summing decimal amounts", () => {
      // 0.1 + 0.2 !== 0.3 with plain JS numbers; MathBN avoids this.
      const summary = summarize([
        buildOrder({ id: "o1", summary: { current_order_total: 0.1 } }),
        buildOrder({ id: "o2", summary: { current_order_total: 0.2 } }),
      ])

      expect(summary.total_revenue).toBe(0.3)
    })

    it("should ignore orders in a different currency", () => {
      const summary = summarize([
        buildOrder({ id: "o1" }),
        buildOrder({ id: "o2", currency_code: "eur" }),
      ])

      expect(summary.order_count).toBe(1)
      expect(summary.total_revenue).toBe(100)
    })

    it("should treat a missing order summary as zero revenue", () => {
      const summary = summarize([buildOrder({ summary: null })])

      expect(summary.order_count).toBe(1)
      expect(summary.total_revenue).toBe(0)
    })

    it("should rank top products by units sold across orders", () => {
      const summary = summarize([
        buildOrder({
          id: "o1",
          items: [
            { product_id: "prod_a", product_title: "Shirt", quantity: 2 },
            { product_id: "prod_b", product_title: "Pants", quantity: 1 },
          ],
        }),
        buildOrder({
          id: "o2",
          items: [
            { product_id: "prod_a", product_title: "Shirt", quantity: 3 },
            { product_id: "prod_c", product_title: "Hat", quantity: 4 },
            { product_id: "prod_d", product_title: "Socks", quantity: 1 },
          ],
        }),
      ])

      expect(summary.top_products).toEqual([
        { product_id: "prod_a", title: "Shirt", units_sold: 5 },
        { product_id: "prod_c", title: "Hat", units_sold: 4 },
        // Pants and Socks are tied at 1 unit; ties are sorted by title.
        { product_id: "prod_b", title: "Pants", units_sold: 1 },
      ])
    })

    it("should only return three products", () => {
      const items = ["a", "b", "c", "d", "e"].map((key, i) => ({
        product_id: `prod_${key}`,
        product_title: `Product ${key}`,
        quantity: i + 1,
      }))

      const summary = summarize([buildOrder({ items })])

      expect(summary.top_products.map((p) => p.product_id)).toEqual([
        "prod_e",
        "prod_d",
        "prod_c",
      ])
    })

    it("should not count units from non-qualifying orders", () => {
      const summary = summarize([
        buildOrder({
          id: "o1",
          items: [
            { product_id: "prod_a", product_title: "Shirt", quantity: 1 },
          ],
        }),
        buildOrder({
          id: "o2",
          status: "canceled",
          items: [{ product_id: "prod_b", product_title: "Hat", quantity: 9 }],
        }),
      ])

      expect(summary.top_products).toEqual([
        { product_id: "prod_a", title: "Shirt", units_sold: 1 },
      ])
    })

    it("should skip custom items without a product and fall back to the item title", () => {
      const summary = summarize([
        buildOrder({
          items: [
            { product_id: null, title: "Custom engraving", quantity: 5 },
            { product_id: "prod_a", title: "Shirt / Large", quantity: 2 },
          ],
        }),
      ])

      expect(summary.top_products).toEqual([
        { product_id: "prod_a", title: "Shirt / Large", units_sold: 2 },
      ])
    })

    it("should accumulate correctly across multiple batches", () => {
      // The route feeds orders in pages; totals must carry over between them.
      const accumulator = createSalesSummaryAccumulator()

      addOrdersToSalesSummary(
        accumulator,
        [
          buildOrder({
            id: "o1",
            items: [
              { product_id: "prod_a", product_title: "Shirt", quantity: 1 },
            ],
          }),
        ],
        "usd"
      )
      addOrdersToSalesSummary(
        accumulator,
        [
          buildOrder({
            id: "o2",
            items: [
              { product_id: "prod_a", product_title: "Shirt", quantity: 2 },
            ],
          }),
        ],
        "usd"
      )

      expect(finalizeSalesSummary(accumulator, "usd")).toEqual({
        currency_code: "usd",
        total_revenue: 200,
        order_count: 2,
        top_products: [{ product_id: "prod_a", title: "Shirt", units_sold: 3 }],
      })
    })
  })
})
