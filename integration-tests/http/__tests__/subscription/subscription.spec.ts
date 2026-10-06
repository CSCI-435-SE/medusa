import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ISubscriptionModuleService } from "@medusajs/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/utils"
import {
  adminHeaders,
  createAdminUser,
  generatePublishableKey,
  generateStoreHeaders,
} from "../../../helpers/create-admin-user"
import { createAuthenticatedCustomer } from "../../../modules/helpers/create-authenticated-customer"

jest.setTimeout(100000)

const env = {}

const savedMethodProviderId = "pp_saved-method_saved-method"

const shippingAddress = {
  first_name: "John",
  last_name: "Doe",
  address_1: "1 Main Street",
  city: "SF",
  country_code: "us",
  province: "CA",
  postal_code: "94016",
}

medusaIntegrationTestRunner({
  env,
  testSuite: ({ dbConnection, getContainer, api }) => {
    let appContainer
    let storeHeaders
    let customerHeaders
    let customer
    let region
    let salesChannel
    let stockLocation
    let shippingOption
    let product
    let inventoryItem

    const variantId = () => product.variants[0].id
    const setSubscriptionIntervals = async (intervals: string[] | null) => {
      await api.post(
        `/admin/products/${product.id}/variants/${variantId()}`,
        { metadata: { subscription_intervals: intervals } },
        adminHeaders
      )
    }

    const subscriptionModule = (): ISubscriptionModuleService =>
      appContainer.resolve(Modules.SUBSCRIPTION)

    const runRenewalJob = async () => {
      const { default: renewSubscriptionsJob } = await import(
        "@medusajs/medusa/jobs/renew-subscriptions"
      )
      await renewSubscriptionsJob(appContainer)
    }

    const makeDue = async (subscriptionId: string) => {
      await subscriptionModule().updateSubscriptions({
        id: subscriptionId,
        next_billing_at: new Date(Date.now() - 60 * 1000),
      })
    }

    const getSubscriptionOrders = async (subscriptionId: string) => {
      const query = appContainer.resolve(ContainerRegistrationKeys.QUERY)
      const {
        data: [subscription],
      } = await query.graph({
        entity: "subscription",
        fields: [
          "id",
          "orders.id",
          "orders.created_at",
          "orders.customer_id",
          "orders.items.variant_id",
          "orders.items.unit_price",
          "orders.shipping_address.address_1",
          "orders.shipping_methods.shipping_option_id",
        ],
        filters: { id: subscriptionId },
      })

      return [...subscription.orders].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
    }

    const prepareCart = async ({
      headers = customerHeaders,
      interval = "monthly" as string | null,
      quantity = 1,
      setupFutureUsage = true,
    } = {}) => {
      const cart = (
        await api.post(
          "/store/carts",
          {
            region_id: region.id,
            sales_channel_id: salesChannel.id,
            email: "john@doe.com",
            shipping_address: shippingAddress,
          },
          headers
        )
      ).data.cart

      await api.post(
        `/store/carts/${cart.id}/line-items`,
        {
          variant_id: variantId(),
          quantity,
          ...(interval
            ? { metadata: { subscription_interval: interval } }
            : {}),
        },
        headers
      )

      await api.post(
        `/store/carts/${cart.id}/shipping-methods`,
        { option_id: shippingOption.id },
        headers
      )

      const paymentCollection = (
        await api.post(
          "/store/payment-collections",
          { cart_id: cart.id },
          headers
        )
      ).data.payment_collection

      await api.post(
        `/store/payment-collections/${paymentCollection.id}/payment-sessions`,
        {
          provider_id: savedMethodProviderId,
          data: setupFutureUsage ? { setup_future_usage: "off_session" } : {},
        },
        headers
      )

      return cart
    }

    const purchaseSubscription = async (options = {}) => {
      const cart = await prepareCart(options)
      const response = await api.post(
        `/store/carts/${cart.id}/complete`,
        {},
        customerHeaders
      )

      expect(response.data.type).toEqual("order")

      const subscriptions = (
        await api.get("/store/customers/me/subscriptions", customerHeaders)
      ).data.subscriptions

      return { order: response.data.order, subscription: subscriptions[0] }
    }

    beforeEach(async () => {
      appContainer = getContainer()
      await createAdminUser(dbConnection, adminHeaders, appContainer)

      const publishableKey = await generatePublishableKey(appContainer)
      storeHeaders = generateStoreHeaders({ publishableKey })

      const authenticated = await createAuthenticatedCustomer(api, storeHeaders)
      customer = authenticated.customer
      customerHeaders = {
        headers: {
          ...storeHeaders.headers,
          authorization: `Bearer ${authenticated.jwt}`,
        },
      }

      region = (
        await api.post(
          "/admin/regions",
          {
            name: "US",
            currency_code: "usd",
            countries: ["us"],
            payment_providers: [savedMethodProviderId],
          },
          adminHeaders
        )
      ).data.region

      salesChannel = (
        await api.post(
          "/admin/sales-channels",
          { name: "Webshop" },
          adminHeaders
        )
      ).data.sales_channel

      await api.post(
        `/admin/api-keys/${publishableKey.id}/sales-channels`,
        { add: [salesChannel.id] },
        adminHeaders
      )

      const shippingProfile = (
        await api.post(
          "/admin/shipping-profiles",
          { name: "default", type: "default" },
          adminHeaders
        )
      ).data.shipping_profile

      stockLocation = (
        await api.post(
          "/admin/stock-locations",
          { name: "Warehouse" },
          adminHeaders
        )
      ).data.stock_location

      await api.post(
        `/admin/stock-locations/${stockLocation.id}/sales-channels`,
        { add: [salesChannel.id] },
        adminHeaders
      )

      const fulfillmentSets = (
        await api.post(
          `/admin/stock-locations/${stockLocation.id}/fulfillment-sets?fields=*fulfillment_sets`,
          { name: "Shipping", type: "shipping" },
          adminHeaders
        )
      ).data.stock_location.fulfillment_sets

      const fulfillmentSet = (
        await api.post(
          `/admin/fulfillment-sets/${fulfillmentSets[0].id}/service-zones`,
          {
            name: "US",
            geo_zones: [{ type: "country", country_code: "us" }],
          },
          adminHeaders
        )
      ).data.fulfillment_set

      await api.post(
        `/admin/stock-locations/${stockLocation.id}/fulfillment-providers`,
        { add: ["manual_test-provider"] },
        adminHeaders
      )

      shippingOption = (
        await api.post(
          "/admin/shipping-options",
          {
            name: "Standard",
            service_zone_id: fulfillmentSet.service_zones[0].id,
            shipping_profile_id: shippingProfile.id,
            provider_id: "manual_test-provider",
            price_type: "flat",
            type: { label: "Standard", description: "Standard", code: "std" },
            prices: [{ currency_code: "usd", amount: 500 }],
            rules: [],
          },
          adminHeaders
        )
      ).data.shipping_option

      inventoryItem = (
        await api.post(
          "/admin/inventory-items",
          { sku: "coffee-sku" },
          adminHeaders
        )
      ).data.inventory_item

      await api.post(
        `/admin/inventory-items/${inventoryItem.id}/location-levels`,
        { location_id: stockLocation.id, stocked_quantity: 10 },
        adminHeaders
      )

      product = (
        await api.post(
          "/admin/products",
          {
            title: "Coffee",
            status: ProductStatus.PUBLISHED,
            shipping_profile_id: shippingProfile.id,
            sales_channels: [{ id: salesChannel.id }],
            options: [{ title: "size", values: ["1kg"] }],
            variants: [
              {
                title: "Coffee 1kg",
                options: { size: "1kg" },
                manage_inventory: true,
                inventory_items: [
                  {
                    inventory_item_id: inventoryItem.id,
                    required_quantity: 1,
                  },
                ],
                prices: [{ currency_code: "usd", amount: 2000 }],
              },
            ],
          },
          adminHeaders
        )
      ).data.product

      await setSubscriptionIntervals(["weekly", "monthly"])
    })

    describe("Purchasing a subscription", () => {
      it("should create a subscription for the customer when the cart is completed", async () => {
        const { order, subscription } = await purchaseSubscription({
          quantity: 2,
        })

        expect(subscription).toEqual(
          expect.objectContaining({
            customer_id: customer.id,
            variant_id: variantId(),
            quantity: 2,
            interval: "monthly",
            status: "active",
            canceled_at: null,
            failed_at: null,
          })
        )
        expect(subscription.payment_method_id).toBeUndefined()

        const nextBillingAt = new Date(subscription.next_billing_at)
        const expected = new Date()
        expected.setUTCMonth(expected.getUTCMonth() + 1)
        expect(
          Math.abs(nextBillingAt.getTime() - expected.getTime())
        ).toBeLessThan(3 * 24 * 60 * 60 * 1000)

        const orders = await getSubscriptionOrders(subscription.id)
        expect(orders.map((o) => o.id)).toEqual([order.id])

        const [stored] = await subscriptionModule().listSubscriptions({
          id: subscription.id,
        })
        expect(stored.payment_provider_id).toEqual(savedMethodProviderId)
        expect(stored.payment_method_id).toEqual("pm_saved_card")
      })

      it("should not create a subscription for a one-time purchase", async () => {
        const cart = await prepareCart({ interval: null })
        const response = await api.post(
          `/store/carts/${cart.id}/complete`,
          {},
          customerHeaders
        )

        expect(response.data.type).toEqual("order")

        const subscriptions = (
          await api.get("/store/customers/me/subscriptions", customerHeaders)
        ).data.subscriptions
        expect(subscriptions).toEqual([])
      })

      it("should reject an interval the variant doesn't offer", async () => {
        const cart = await prepareCart({ interval: "yearly" })

        const error = await api
          .post(`/store/carts/${cart.id}/complete`, {}, customerHeaders)
          .catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toContain(
          "can't be purchased as a yearly subscription"
        )
      })

      it("should reject a subscription to a variant that isn't subscription-eligible", async () => {
        const cart = await prepareCart()
        await setSubscriptionIntervals(null)

        const error = await api
          .post(`/store/carts/${cart.id}/complete`, {}, customerHeaders)
          .catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toContain(
          "can't be purchased as a monthly subscription"
        )
      })

      it("should reject a subscription item in a guest checkout", async () => {
        const cart = await prepareCart({ headers: storeHeaders })

        const error = await api
          .post(`/store/carts/${cart.id}/complete`, {}, storeHeaders)
          .catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toEqual(
          "A registered customer is required to purchase a subscription"
        )
      })

      it("should reject a checkout whose payment method isn't saved for off-session use", async () => {
        const cart = await prepareCart({ setupFutureUsage: false })

        const error = await api
          .post(`/store/carts/${cart.id}/complete`, {}, customerHeaders)
          .catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toContain(
          "saved for off-session use"
        )

        const orderModule = appContainer.resolve(Modules.ORDER)
        const orders = await orderModule.listOrders({
          customer_id: customer.id,
        })
        expect(orders).toEqual([])
      })
    })

    describe("Renewing subscriptions", () => {
      it("should place a renewal order at the current price and advance the billing date", async () => {
        const { order, subscription } = await purchaseSubscription()

        await api.post(
          `/admin/products/${product.id}/variants/${variantId()}`,
          { prices: [{ currency_code: "usd", amount: 2500 }] },
          adminHeaders
        )

        await makeDue(subscription.id)
        await runRenewalJob()

        const orders = await getSubscriptionOrders(subscription.id)
        expect(orders).toHaveLength(2)
        expect(orders[0].id).toEqual(order.id)

        const renewal = orders[1]
        expect(renewal).toEqual(
          expect.objectContaining({
            customer_id: customer.id,
            items: [
              expect.objectContaining({
                variant_id: variantId(),
                unit_price: 2500,
              }),
            ],
            shipping_address: expect.objectContaining({
              address_1: shippingAddress.address_1,
            }),
            shipping_methods: [
              expect.objectContaining({
                shipping_option_id: shippingOption.id,
              }),
            ],
          })
        )

        const orderModule = appContainer.resolve(Modules.ORDER)
        const renewalOrder = await orderModule.retrieveOrder(renewal.id, {
          relations: ["items"],
        })
        expect(renewalOrder.items[0].quantity).toEqual(1)

        const [renewed] = await subscriptionModule().listSubscriptions({
          id: subscription.id,
        })
        expect(renewed.status).toEqual("active")
        expect(new Date(renewed.next_billing_at).getTime()).toBeGreaterThan(
          Date.now()
        )
      })

      it("should not renew a subscription that isn't due", async () => {
        const { subscription } = await purchaseSubscription()

        await runRenewalJob()

        const orders = await getSubscriptionOrders(subscription.id)
        expect(orders).toHaveLength(1)
      })

      it("should end the subscription when the renewal payment is declined", async () => {
        const { subscription } = await purchaseSubscription()

        await subscriptionModule().updateSubscriptions({
          id: subscription.id,
          payment_method_id: "pm_declined",
        } as any)
        await makeDue(subscription.id)
        await runRenewalJob()

        const [failed] = await subscriptionModule().listSubscriptions({
          id: subscription.id,
        })
        expect(failed).toEqual(
          expect.objectContaining({
            status: "failed",
            failed_at: expect.any(Date),
            failure_reason: expect.any(String),
          })
        )

        const orders = await getSubscriptionOrders(subscription.id)
        expect(orders).toHaveLength(1)

        const orderModule = appContainer.resolve(Modules.ORDER)
        const customerOrders = await orderModule.listOrders({
          customer_id: customer.id,
        })
        expect(customerOrders).toHaveLength(1)
      })

      it("should end the subscription when the variant is out of stock", async () => {
        const { subscription } = await purchaseSubscription()

        // The first order reserved the only unit in stock
        await api.post(
          `/admin/inventory-items/${inventoryItem.id}/location-levels/${stockLocation.id}`,
          { stocked_quantity: 1 },
          adminHeaders
        )

        await makeDue(subscription.id)
        await runRenewalJob()

        const [failed] = await subscriptionModule().listSubscriptions({
          id: subscription.id,
        })
        expect(failed.status).toEqual("failed")
        expect(failed.failure_reason).toEqual(expect.any(String))

        const orders = await getSubscriptionOrders(subscription.id)
        expect(orders).toHaveLength(1)
      })
    })

    describe("Viewing and canceling subscriptions", () => {
      it("should list the customer's subscriptions", async () => {
        const { subscription } = await purchaseSubscription()

        const list = await api.get(
          "/store/customers/me/subscriptions",
          customerHeaders
        )
        expect(list.data).toEqual({
          subscriptions: [
            expect.objectContaining({
              id: subscription.id,
              customer_id: customer.id,
              status: "active",
            }),
          ],
        })
      })

      it("should cancel a subscription immediately so it isn't renewed", async () => {
        const { subscription } = await purchaseSubscription()

        const response = await api.post(
          `/store/customers/me/subscriptions/${subscription.id}/cancel`,
          {},
          customerHeaders
        )

        expect(response.data.subscription).toEqual(
          expect.objectContaining({
            id: subscription.id,
            status: "canceled",
            canceled_at: expect.any(String),
          })
        )

        await makeDue(subscription.id)
        await runRenewalJob()

        const orders = await getSubscriptionOrders(subscription.id)
        expect(orders).toHaveLength(1)

        const error = await api
          .post(
            `/store/customers/me/subscriptions/${subscription.id}/cancel`,
            {},
            customerHeaders
          )
          .catch((e) => e)
        expect(error.response.status).toEqual(400)
      })

      it("should not let another customer view or cancel the subscription", async () => {
        const { subscription } = await purchaseSubscription()

        const other = await createAuthenticatedCustomer(api, storeHeaders, {
          email: "other@customer.com",
        })
        const otherHeaders = {
          headers: {
            ...storeHeaders.headers,
            authorization: `Bearer ${other.jwt}`,
          },
        }

        const list = await api.get(
          "/store/customers/me/subscriptions",
          otherHeaders
        )
        expect(list.data.subscriptions).toEqual([])

        const cancelError = await api
          .post(
            `/store/customers/me/subscriptions/${subscription.id}/cancel`,
            {},
            otherHeaders
          )
          .catch((e) => e)
        expect(cancelError.response.status).toEqual(404)
      })
    })
  },
})
