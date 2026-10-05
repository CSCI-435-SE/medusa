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

    const getSalesSummary = async () =>
      (await api.get(SALES_SUMMARY_URL, adminHeaders)).data.sales_summary

    describe("GET /admin/analytics/sales-summary", () => {
      it("should return a zero state when there are no orders", async () => {
        const response = await api.get(SALES_SUMMARY_URL, adminHeaders)

        expect(response.status).toEqual(200)
        expect(response.data.sales_summary).toEqual({
          currency_code: "usd",
          total_revenue: 0,
          order_count: 0,
          top_products: [],
        })
      })

      it("should not count orders whose payment has not been captured", async () => {
        await seedOrder()

        expect(await getSalesSummary()).toEqual({
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
          currency_code: "eur",
          total_revenue: 0,
          order_count: 0,
          top_products: [],
        })
      })

      it("should require authentication", async () => {
        const error = await api.get(SALES_SUMMARY_URL).catch((e) => e)

        expect(error.response.status).toEqual(401)
      })
    })
  },
})
