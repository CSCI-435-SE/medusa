import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { IFulfillmentModuleService } from "@medusajs/types"
import { ModuleRegistrationName, Modules } from "@medusajs/utils"
import {
  adminHeaders,
  createAdminUser,
} from "../../../../helpers/create-admin-user"
import { setupTaxStructure } from "../../../../modules/__tests__/fixtures"
import { createOrderSeeder } from "../../fixtures/order"

jest.setTimeout(300000)

medusaIntegrationTestRunner({
  testSuite: ({ dbConnection, getContainer, api }) => {
    let order
    let fulfillmentId: string

    beforeEach(async () => {
      const container = getContainer()

      await setupTaxStructure(container.resolve(ModuleRegistrationName.TAX))
      await createAdminUser(dbConnection, adminHeaders, container)

      const seeder = await createOrderSeeder({ api, container })
      order = seeder.order

      const fulfilledOrder = (
        await api.post(
          `/admin/orders/${order.id}/fulfillments?fields=*fulfillments`,
          {
            shipping_option_id: seeder.shippingOption.id,
            location_id: seeder.stockLocation.id,
            items: [{ id: order.items[0].id, quantity: 1 }],
          },
          adminHeaders
        )
      ).data.order

      fulfillmentId = fulfilledOrder.fulfillments[0].id

      // Give the fulfillment existing metadata, so the tests can check that a
      // shipment merges into it instead of replacing it.
      const fulfillmentModule: IFulfillmentModuleService = container.resolve(
        Modules.FULFILLMENT
      )
      await fulfillmentModule.updateFulfillment(fulfillmentId, {
        metadata: { existing_key: "kept" },
      })
    })

    const createShipment = (metadata?: Record<string, unknown>) =>
      api.post(
        `/admin/orders/${order.id}/fulfillments/${fulfillmentId}/shipments`,
        {
          items: [{ id: order.items[0].id, quantity: 1 }],
          ...(metadata && { metadata }),
        },
        adminHeaders
      )

    const getFulfillment = async () => {
      const { order: refetched } = (
        await api.get(
          `/admin/orders/${order.id}?fields=*fulfillments`,
          adminHeaders
        )
      ).data

      return refetched.fulfillments.find((f) => f.id === fulfillmentId)
    }

    describe("POST /admin/orders/:id/fulfillments/:fulfillment_id/shipments", () => {
      it("merges the shipment's metadata into the fulfillment's metadata", async () => {
        await createShipment({
          carrier_name: "UPS",
          tracking_status: "in_transit",
        })

        const fulfillment = await getFulfillment()

        expect(fulfillment.shipped_at).toBeTruthy()
        expect(fulfillment.metadata).toEqual({
          existing_key: "kept",
          carrier_name: "UPS",
          tracking_status: "in_transit",
        })
      })

      it("leaves the fulfillment's metadata unchanged when none is sent", async () => {
        await createShipment()

        const fulfillment = await getFulfillment()

        expect(fulfillment.shipped_at).toBeTruthy()
        expect(fulfillment.metadata).toEqual({ existing_key: "kept" })
      })
    })
  },
})
