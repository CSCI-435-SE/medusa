import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { IStoreModuleService } from "@medusajs/types"
import { ModuleRegistrationName, Modules } from "@medusajs/utils"
import {
  adminHeaders,
  createAdminUser,
} from "../../../../helpers/create-admin-user"
import { setupTaxStructure } from "../../../../modules/__tests__/fixtures"
import { createOrderSeeder } from "../../fixtures/order"

jest.setTimeout(300000)

const SALES_SUMMARY_URL = "/admin/analytics/sales-summary"

const DAY_MS = 24 * 60 * 60 * 1000

// Every summary reports the date range it covers. Most tests don't care what
// the exact dates are, so they only check that they are present.
const dateFields = {
  start_date: expect.any(String),
  end_date: expect.any(String),
}

medusaIntegrationTestRunner({
  testSuite: ({ dbConnection, getContainer, api, dbUtils }) => {
    let container

    beforeAll(async () => {
      container = getContainer()

      await setupTaxStructure(container.resolve(ModuleRegistrationName.TAX))
      await createAdminUser(dbConnection, adminHeaders, container)

      // The default store is created with EUR as its default currency, but
      // the order seeder creates USD orders. Make USD the default so the
      // seeded orders are included in the summary.
      const storeModule: IStoreModuleService = container.resolve(Modules.STORE)
      const [store] = await storeModule.listStores()
      await storeModule.updateStores(store.id, {
        supported_currencies: [
          { currency_code: "usd", is_default: true },
          { currency_code: "eur" },
        ],
      })

      // Every test starts from this state (the runner restores the snapshot
      // after each test).
      await dbUtils.snapshot()
    })

    /**
     * Creates an order through the storefront flow (cart -> payment session
     * -> complete). The payment is authorized but not yet captured.
     */
    const seedOrder = async () => {
      const inventoryItemOverride = (
        await api.post(
          `/admin/inventory-items`,
          { sku: "test-variant", requires_shipping: false },
          adminHeaders
        )
      ).data.inventory_item

      return await createOrderSeeder({
        api,
        container,
        inventoryItemOverride,
        withoutShipping: true,
      })
    }

    /**
     * Captures the order's payment so it counts as "paid".
     */
    const capturePayment = async (order) => {
      const payment = order.payment_collections[0].payments[0]

      await api.post(
        `/admin/payments/${payment.id}/capture`,
        undefined,
        adminHeaders
      )
    }

    const getSalesSummary = async (query: Record<string, string> = {}) =>
      (
        await api.get(
          `${SALES_SUMMARY_URL}?${new URLSearchParams(query)}`,
          adminHeaders
        )
      ).data.sales_summary

    /**
     * Moves an order's purchase time back by the given number of days.
     */
    const backdateOrder = async (orderId: string, daysAgo: number) =>
      await dbConnection.raw(`UPDATE "order" SET created_at = ? WHERE id = ?`, [
        new Date(Date.now() - daysAgo * DAY_MS),
        orderId,
      ])

    describe("GET /admin/analytics/sales-summary", () => {
      it("should return a zero state when there are no orders", async () => {
        const response = await api.get(SALES_SUMMARY_URL, adminHeaders)

        expect(response.status).toEqual(200)
        expect(response.data.sales_summary).toEqual({
          ...dateFields,
          currency_code: "usd",
          total_revenue: 0,
          order_count: 0,
          top_products: [],
        })
      })

      it("should not count orders whose payment has not been captured", async () => {
        await seedOrder()

        expect(await getSalesSummary()).toEqual({
          ...dateFields,
          currency_code: "usd",
          total_revenue: 0,
          order_count: 0,
          top_products: [],
        })
      })

      it("should count paid orders and list their products", async () => {
        const { order, product } = await seedOrder()
        await capturePayment(order)

        expect(await getSalesSummary()).toEqual({
          ...dateFields,
          currency_code: "usd",
          // Revenue is the order's current total (items + tax).
          total_revenue: order.summary.current_order_total,
          order_count: 1,
          top_products: [
            {
              product_id: product.id,
              title: product.title,
              units_sold: 1,
            },
          ],
        })
      })

      it("should count partially refunded orders net of the refund", async () => {
        const { order } = await seedOrder()
        await capturePayment(order)

        // Refund part of the payment directly, without a return. This is the
        // case that used to count the order's full total as revenue.
        const payment = order.payment_collections[0].payments[0]
        const refundAmount = 1

        await api.post(
          `/admin/payments/${payment.id}/refund`,
          { amount: refundAmount },
          adminHeaders
        )

        const summary = await getSalesSummary()

        // The order is still a sale...
        expect(summary.order_count).toEqual(1)
        // ...but revenue is reduced by exactly the refunded amount.
        // `toBeCloseTo` because the total includes tax and may have decimals.
        expect(summary.total_revenue).toBeCloseTo(
          order.summary.current_order_total - refundAmount
        )
      })

      it("should not count canceled orders even if they were paid", async () => {
        const { order } = await seedOrder()
        await capturePayment(order)

        await api.post(`/admin/orders/${order.id}/cancel`, {}, adminHeaders)

        expect(await getSalesSummary()).toEqual({
          ...dateFields,
          currency_code: "usd",
          total_revenue: 0,
          order_count: 0,
          top_products: [],
        })
      })

      it("should only include orders in the store's default currency", async () => {
        const { order } = await seedOrder()
        await capturePayment(order)

        // Switch the default currency away from the order's currency (USD).
        const storeModule: IStoreModuleService = container.resolve(
          Modules.STORE
        )
        const [store] = await storeModule.listStores()
        await storeModule.updateStores(store.id, {
          supported_currencies: [
            { currency_code: "usd" },
            { currency_code: "eur", is_default: true },
          ],
        })

        expect(await getSalesSummary()).toEqual({
          ...dateFields,
          currency_code: "eur",
          total_revenue: 0,
          order_count: 0,
          top_products: [],
        })
      })

      describe("date range", () => {
        it("should cover the last 7 days by default", async () => {
          const summary = await getSalesSummary()

          const rangeMs =
            new Date(summary.end_date).getTime() -
            new Date(summary.start_date).getTime()

          expect(rangeMs).toEqual(7 * DAY_MS)
          expect(new Date(summary.end_date).getTime()).toBeLessThanOrEqual(
            Date.now()
          )
        })

        it("should not count orders placed before the default range", async () => {
          const { order } = await seedOrder()
          await capturePayment(order)
          await backdateOrder(order.id, 20)

          expect(await getSalesSummary()).toEqual({
            ...dateFields,
            currency_code: "usd",
            total_revenue: 0,
            order_count: 0,
            top_products: [],
          })
        })

        it("should count an older order when the range includes it", async () => {
          const { order, product } = await seedOrder()
          await capturePayment(order)
          await backdateOrder(order.id, 20)

          const summary = await getSalesSummary({
            start_date: new Date(Date.now() - 30 * DAY_MS).toISOString(),
            end_date: new Date().toISOString(),
          })

          expect(summary.order_count).toEqual(1)
          expect(summary.total_revenue).toEqual(
            order.summary.current_order_total
          )
          expect(summary.top_products).toEqual([
            { product_id: product.id, title: product.title, units_sold: 1 },
          ])
        })

        it("should not count orders placed after the range ends", async () => {
          const { order } = await seedOrder()
          await capturePayment(order)

          const summary = await getSalesSummary({
            start_date: new Date(Date.now() - 30 * DAY_MS).toISOString(),
            end_date: new Date(Date.now() - 10 * DAY_MS).toISOString(),
          })

          expect(summary.order_count).toEqual(0)
          expect(summary.total_revenue).toEqual(0)
          expect(summary.top_products).toEqual([])
        })

        it("should treat an end date in the future as now", async () => {
          const { order } = await seedOrder()
          await capturePayment(order)

          const summary = await getSalesSummary({
            end_date: new Date(Date.now() + 2 * DAY_MS).toISOString(),
          })

          expect(summary.order_count).toEqual(1)
          expect(new Date(summary.end_date).getTime()).toBeLessThanOrEqual(
            Date.now()
          )
        })

        it("should reject an end date before the start date", async () => {
          const error = await api
            .get(
              `${SALES_SUMMARY_URL}?${new URLSearchParams({
                start_date: new Date(Date.now() - DAY_MS).toISOString(),
                end_date: new Date(Date.now() - 3 * DAY_MS).toISOString(),
              })}`,
              adminHeaders
            )
            .catch((e) => e)

          expect(error.response.status).toEqual(400)
          expect(error.response.data.message).toContain(
            "end_date cannot be before start_date"
          )
        })

        it("should reject a range longer than 12 months", async () => {
          const error = await api
            .get(
              `${SALES_SUMMARY_URL}?${new URLSearchParams({
                start_date: new Date(Date.now() - 400 * DAY_MS).toISOString(),
                end_date: new Date().toISOString(),
              })}`,
              adminHeaders
            )
            .catch((e) => e)

          expect(error.response.status).toEqual(400)
          expect(error.response.data.message).toContain("12 months")
        })

        it("should accept a range of 12 months", async () => {
          const response = await api.get(
            `${SALES_SUMMARY_URL}?${new URLSearchParams({
              start_date: new Date(Date.now() - 360 * DAY_MS).toISOString(),
              end_date: new Date().toISOString(),
            })}`,
            adminHeaders
          )

          expect(response.status).toEqual(200)
        })

        it("should reject dates that are not valid", async () => {
          const error = await api
            .get(`${SALES_SUMMARY_URL}?start_date=yesterday`, adminHeaders)
            .catch((e) => e)

          expect(error.response.status).toEqual(400)
        })
      })

      it("should require authentication", async () => {
        const error = await api.get(SALES_SUMMARY_URL).catch((e) => e)

        expect(error.response.status).toEqual(401)
      })
    })
  },
})
