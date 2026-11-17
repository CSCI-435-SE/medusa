import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ProductStatus, RuleOperator } from "@medusajs/framework/utils"
import {
  adminHeaders,
  createAdminUser,
  generatePublishableKey,
  generateStoreHeaders,
} from "../../../../helpers/create-admin-user"
import { createAuthenticatedCustomer } from "../../../../modules/helpers/create-authenticated-customer"

jest.setTimeout(200000)

/**
 * Integration tests for issue #113 "Handle bundles at checkout and allow
 * returning a single item from a bundle" (part 2 of #101). Each `describe` is
 * named after the acceptance criterion (AC) it covers.
 *
 * The scenario is the issue's: a Camera kit made of a camera (normally $800),
 * a lens ($300) and a bag ($100), sold for $1,000. Its shares are $666.67,
 * $250.00 and $83.33.
 */
medusaIntegrationTestRunner({
  testSuite: ({ dbConnection, getContainer, api }) => {
    let storeHeaders
    let customerHeaders
    let otherCustomerHeaders
    let shippingProfile
    let salesChannel
    let stockLocation
    let region
    let shippingOption
    let returnShippingOption

    let seq = 0

    const createComponent = async (
      title: string,
      price: number,
      stocked: number
    ) => {
      seq++
      const inventoryItem = (
        await api.post(
          "/admin/inventory-items",
          { sku: `${title}-${seq}` },
          adminHeaders
        )
      ).data.inventory_item

      await api.post(
        `/admin/inventory-items/${inventoryItem.id}/location-levels`,
        { location_id: stockLocation.id, stocked_quantity: stocked },
        adminHeaders
      )

      const product = (
        await api.post(
          "/admin/products",
          {
            title,
            status: ProductStatus.PUBLISHED,
            shipping_profile_id: shippingProfile.id,
            sales_channels: [{ id: salesChannel.id }],
            options: [{ title: "Default", values: ["Default"] }],
            variants: [
              {
                title: `${title} ${seq}`,
                options: { Default: "Default" },
                manage_inventory: true,
                inventory_items: [
                  { inventory_item_id: inventoryItem.id, required_quantity: 1 },
                ],
                prices: [{ currency_code: "usd", amount: price }],
              },
            ],
          },
          adminHeaders
        )
      ).data.product

      return { product, variant: product.variants[0], inventoryItem }
    }

    /**
     * The issue's Camera kit, with `stock` units of each component.
     */
    const createCameraKit = async (
      stock = { camera: 10, lens: 10, bag: 10 },
      price = 1000
    ) => {
      const camera = await createComponent("Camera body", 800, stock.camera)
      const lens = await createComponent("Lens", 300, stock.lens)
      const bag = await createComponent("Bag", 100, stock.bag)

      const bundle = (
        await api.post(
          "/admin/bundles",
          {
            title: `Camera kit`,
            status: ProductStatus.PUBLISHED,
            shipping_profile_id: shippingProfile.id,
            sales_channels: [{ id: salesChannel.id }],
            components: [
              { variant_id: camera.variant.id, quantity: 1 },
              { variant_id: lens.variant.id, quantity: 1 },
              { variant_id: bag.variant.id, quantity: 1 },
            ],
            prices: [{ currency_code: "usd", amount: price }],
          },
          adminHeaders
        )
      ).data.product

      return { camera, lens, bag, bundle, variant: bundle.variants[0] }
    }

    const createCart = async (
      items: { variant_id: string; quantity: number }[],
      headers = customerHeaders,
      promoCodes: string[] = []
    ) => {
      const cart = (
        await api.post(
          "/store/carts",
          {
            email: "tony@stark-industries.com",
            currency_code: "usd",
            sales_channel_id: salesChannel.id,
            region_id: region.id,
            shipping_address: {
              address_1: "1 Main St",
              city: "SF",
              country_code: "us",
              province: "CA",
              postal_code: "94016",
            },
            items,
          },
          headers
        )
      ).data.cart

      await api.post(
        `/store/carts/${cart.id}/shipping-methods`,
        { option_id: shippingOption.id },
        headers
      )

      if (promoCodes.length) {
        await api.post(
          `/store/carts/${cart.id}/promotions`,
          { promo_codes: promoCodes },
          headers
        )
      }

      const paymentCollection = (
        await api.post(
          "/store/payment-collections",
          { cart_id: cart.id },
          headers
        )
      ).data.payment_collection

      await api.post(
        `/store/payment-collections/${paymentCollection.id}/payment-sessions`,
        { provider_id: "pp_system_default" },
        headers
      )

      return cart
    }

    const completeCart = async (cartId: string, headers = customerHeaders) =>
      (await api.post(`/store/carts/${cartId}/complete`, {}, headers)).data

    const placeOrder = async (variantId: string, quantity = 1) => {
      const cart = await createCart([{ variant_id: variantId, quantity }])
      const { order } = await completeCart(cart.id)
      return order
    }

    const getOrder = async (orderId: string) =>
      (
        await api.get(
          `/admin/orders/${orderId}?fields=*items,items.metadata,*summary`,
          adminHeaders
        )
      ).data.order

    const fulfillAll = async (orderId: string) => {
      const order = await getOrder(orderId)
      await api.post(
        `/admin/orders/${orderId}/fulfillments`,
        {
          location_id: stockLocation.id,
          items: order.items.map((item) => ({
            id: item.id,
            quantity: item.quantity,
          })),
        },
        adminHeaders
      )
      return await getOrder(orderId)
    }

    const getLevel = async (inventoryItemId: string) =>
      (
        await api.get(
          `/admin/inventory-items/${inventoryItemId}/location-levels`,
          adminHeaders
        )
      ).data.inventory_levels.find(
        (level) => level.location_id === stockLocation.id
      )

    const setStock = async (inventoryItemId: string, stocked: number) =>
      api.post(
        `/admin/inventory-items/${inventoryItemId}/location-levels/${stockLocation.id}`,
        { stocked_quantity: stocked },
        adminHeaders
      )

    // Returns are received right away: Medusa adds a return's refund to the
    // order's pending difference when the items are received.
    const storeReturn = async (
      orderId: string,
      items: any[],
      headers = customerHeaders
    ) =>
      api.post(
        "/store/returns",
        {
          order_id: orderId,
          items,
          return_shipping: { option_id: returnShippingOption.id, price: 0 },
          receive_now: true,
          location_id: stockLocation.id,
        },
        headers
      )

    const pendingDifference = async (orderId: string) =>
      Number((await getOrder(orderId)).summary.pending_difference)

    beforeAll(async () => {
      const container = getContainer()
      await createAdminUser(dbConnection, adminHeaders, container)

      const publishableKey = await generatePublishableKey(container)
      storeHeaders = generateStoreHeaders({ publishableKey })

      const customer = await createAuthenticatedCustomer(api, storeHeaders, {
        email: "tony@stark-industries.com",
      })
      customerHeaders = {
        headers: {
          ...storeHeaders.headers,
          authorization: `Bearer ${customer.jwt}`,
        },
      }
      const otherCustomer = await createAuthenticatedCustomer(
        api,
        storeHeaders,
        {
          email: "steve@rogers.com",
        }
      )
      otherCustomerHeaders = {
        headers: {
          ...storeHeaders.headers,
          authorization: `Bearer ${otherCustomer.jwt}`,
        },
      }

      shippingProfile = (
        await api.post(
          "/admin/shipping-profiles",
          { name: "default", type: "default" },
          adminHeaders
        )
      ).data.shipping_profile

      region = (
        await api.post(
          "/admin/regions",
          { name: "US", currency_code: "usd", countries: ["us"] },
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
          { name: "Bundle-fulfillment", type: "shipping" },
          adminHeaders
        )
      ).data.stock_location.fulfillment_sets

      const fulfillmentSet = (
        await api.post(
          `/admin/fulfillment-sets/${fulfillmentSets[0].id}/service-zones`,
          {
            name: "Zone",
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

      const optionBody = (name: string, rules: any[]) => ({
        name,
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        provider_id: "manual_test-provider",
        price_type: "flat",
        type: { label: "Std", description: "Std", code: "std" },
        prices: [{ currency_code: "usd", amount: 0 }],
        rules,
      })

      shippingOption = (
        await api.post(
          "/admin/shipping-options",
          optionBody("Shipping", []),
          adminHeaders
        )
      ).data.shipping_option

      returnShippingOption = (
        await api.post(
          "/admin/shipping-options",
          optionBody("Return shipping", [
            {
              operator: RuleOperator.EQ,
              attribute: "is_return",
              value: "true",
            },
          ]),
          adminHeaders
        )
      ).data.shipping_option
    })

    describe("AC 1-3: the out-of-stock error names the product", () => {
      it("names the bundle component that is out of stock at checkout (AC 1)", async () => {
        const kit = await createCameraKit()
        const cart = await createCart([
          { variant_id: kit.variant.id, quantity: 1 },
        ])

        // The lens sells out before the shopper checks out.
        await setStock(kit.lens.inventoryItem.id, 0)

        const result = await completeCart(cart.id)

        expect(result.type).toEqual("cart")
        expect(result.error.message).toEqual(
          "Camera kit: Lens is out of stock."
        )
      })

      it("names every out-of-stock component (AC 2)", async () => {
        const kit = await createCameraKit()
        const cart = await createCart([
          { variant_id: kit.variant.id, quantity: 1 },
        ])

        await setStock(kit.lens.inventoryItem.id, 0)
        await setStock(kit.bag.inventoryItem.id, 0)

        const result = await completeCart(cart.id)

        expect(result.error.message).toEqual(
          "Camera kit: Lens, Bag are out of stock."
        )
      })

      it("names the component when adding the bundle to the cart", async () => {
        const kit = await createCameraKit({ camera: 10, lens: 0, bag: 10 })

        const error = await api
          .post(
            "/store/carts",
            {
              currency_code: "usd",
              sales_channel_id: salesChannel.id,
              region_id: region.id,
              items: [{ variant_id: kit.variant.id, quantity: 1 }],
            },
            customerHeaders
          )
          .catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toEqual(
          "Camera kit: Lens is out of stock."
        )
      })

      it("names the variant of an item that isn't a bundle (AC 3)", async () => {
        const lens = await createComponent("Lens", 300, 10)
        const cart = await createCart([
          { variant_id: lens.variant.id, quantity: 1 },
        ])

        await setStock(lens.inventoryItem.id, 0)

        const result = await completeCart(cart.id)

        expect(result.error.message).toEqual("Lens is out of stock.")
      })

      it("checks a bundle and a separate line for one of its components together", async () => {
        // One lens in stock: the kit alone or the lens alone would fit, both don't.
        const kit = await createCameraKit({ camera: 10, lens: 1, bag: 10 })
        const cart = await createCart([
          { variant_id: kit.variant.id, quantity: 1 },
          { variant_id: kit.lens.variant.id, quantity: 1 },
        ])

        const result = await completeCart(cart.id).catch((e) => e.response.data)

        expect(result.error.message).toContain(
          "Camera kit: Lens is out of stock."
        )
        expect(result.error.message).toContain("Lens is out of stock.")
      })
    })

    describe("AC 4: two shoppers buying the last bundle at the same time", () => {
      it("lets one order through and names the component for the other; stock never goes negative", async () => {
        const kit = await createCameraKit({ camera: 1, lens: 1, bag: 1 })

        const cartA = await createCart([
          { variant_id: kit.variant.id, quantity: 1 },
        ])
        const cartB = await createCart([
          { variant_id: kit.variant.id, quantity: 1 },
        ])

        const results = await Promise.all([
          completeCart(cartA.id),
          completeCart(cartB.id),
        ])

        const orders = results.filter((result) => result.type === "order")
        const failures = results.filter((result) => result.type === "cart")

        expect(orders).toHaveLength(1)
        expect(failures).toHaveLength(1)
        expect(failures[0].error.message).toMatch(
          /^Camera kit: .+ (is|are) out of stock\.$/
        )

        for (const part of [kit.camera, kit.lens, kit.bag]) {
          const level = await getLevel(part.inventoryItem.id)
          expect(level.reserved_quantity).toEqual(1)
          expect(
            level.stocked_quantity - level.reserved_quantity
          ).toBeGreaterThanOrEqual(0)
        }
      })
    })

    describe("AC 5: promotions and tax treat a bundle as one line item", () => {
      it("doesn't apply a promotion aimed at a single component to the bundle", async () => {
        const kit = await createCameraKit()

        await api.post(
          "/admin/promotions",
          {
            code: "LENS10",
            type: "standard",
            status: "active",
            application_method: {
              type: "percentage",
              target_type: "items",
              allocation: "each",
              max_quantity: 10,
              value: 10,
              currency_code: "usd",
              target_rules: [
                {
                  attribute: "items.product.id",
                  operator: "in",
                  values: [kit.lens.product.id],
                },
              ],
            },
          },
          adminHeaders
        )

        const cart = await createCart(
          [{ variant_id: kit.variant.id, quantity: 1 }],
          customerHeaders,
          ["LENS10"]
        )
        const updated = (
          await api.get(
            `/store/carts/${cart.id}?fields=*items,*items.adjustments,discount_total,item_total`,
            customerHeaders
          )
        ).data.cart

        expect(updated.items).toHaveLength(1)
        expect(updated.items[0].adjustments).toEqual([])
        expect(updated.discount_total).toEqual(0)
        expect(updated.item_total).toEqual(1000)
      })
    })

    describe("AC 6: fulfilling a bundle ships all of its components", () => {
      it("takes one of each component out of stock", async () => {
        const kit = await createCameraKit()
        const order = await placeOrder(kit.variant.id)

        await fulfillAll(order.id)

        for (const part of [kit.camera, kit.lens, kit.bag]) {
          const level = await getLevel(part.inventoryItem.id)
          expect(level.stocked_quantity).toEqual(9)
          expect(level.reserved_quantity).toEqual(0)
        }
      })
    })

    describe("AC 7-12: refund shares saved when the order is placed", () => {
      it("saves each component's share of the price paid (AC 7, 8, 9)", async () => {
        const kit = await createCameraKit()
        const order = await getOrder((await placeOrder(kit.variant.id)).id)

        expect(order.items[0].metadata.bundle.components).toEqual([
          expect.objectContaining({
            variant_id: kit.camera.variant.id,
            quantity: 1,
            units: 1,
            refund_share: 666.67,
            inventory_items: [
              {
                inventory_item_id: kit.camera.inventoryItem.id,
                required_quantity: 1,
              },
            ],
          }),
          expect.objectContaining({
            variant_id: kit.lens.variant.id,
            refund_share: 250,
          }),
          expect.objectContaining({
            variant_id: kit.bag.variant.id,
            title: "Bag",
            refund_share: 83.33,
          }),
        ])
      })

      it("splits the amount actually paid when the bundle is discounted (AC 10)", async () => {
        const kit = await createCameraKit()

        await api.post(
          "/admin/promotions",
          {
            code: "KIT10",
            type: "standard",
            status: "active",
            application_method: {
              type: "percentage",
              target_type: "items",
              allocation: "each",
              max_quantity: 10,
              value: 10,
              currency_code: "usd",
              target_rules: [
                {
                  attribute: "items.product.id",
                  operator: "in",
                  values: [kit.bundle.id],
                },
              ],
            },
          },
          adminHeaders
        )

        const cart = await createCart(
          [{ variant_id: kit.variant.id, quantity: 1 }],
          customerHeaders,
          ["KIT10"]
        )
        const { order } = await completeCart(cart.id)
        const saved = (await getOrder(order.id)).items[0].metadata.bundle
          .components

        // $900 paid: 600 / 225 / 75
        expect(saved.map((c) => c.refund_share)).toEqual([600, 225, 75])
      })

      it("keeps the saved shares when prices change later (AC 11)", async () => {
        const kit = await createCameraKit()
        const order = await placeOrder(kit.variant.id)

        await api.post(
          `/admin/products/${kit.lens.product.id}/variants/${kit.lens.variant.id}`,
          { prices: [{ currency_code: "usd", amount: 5000 }] },
          adminHeaders
        )
        await api.post(
          `/admin/bundles/${kit.bundle.id}`,
          { prices: [{ currency_code: "usd", amount: 50 }] },
          adminHeaders
        )

        const saved = (await getOrder(order.id)).items[0].metadata.bundle
          .components
        expect(saved.map((c) => c.refund_share)).toEqual([666.67, 250, 83.33])
      })

      it("splits by quantity when a component has no price in the order's currency (AC 12)", async () => {
        const kit = await createCameraKit()
        await api.post(
          `/admin/products/${kit.camera.product.id}/variants/${kit.camera.variant.id}`,
          { prices: [{ currency_code: "eur", amount: 800 }] },
          adminHeaders
        )

        const order = await placeOrder(kit.variant.id)
        const saved = (await getOrder(order.id)).items[0].metadata.bundle
          .components

        expect(saved.map((c) => c.refund_share)).toEqual([
          333.34, 333.33, 333.33,
        ])
      })

      it("doesn't add bundle data to normal lines (AC 21)", async () => {
        const lens = await createComponent("Lens", 300, 10)
        const order = await getOrder((await placeOrder(lens.variant.id)).id)

        expect(order.items[0].metadata?.bundle).toBeUndefined()
      })
    })

    describe("AC 13-21: returning a single item from a bundle", () => {
      let kit
      let order
      let line

      beforeEach(async () => {
        kit = await createCameraKit()
        order = await fulfillAll((await placeOrder(kit.variant.id)).id)
        line = order.items[0]
      })

      it("lets a shopper return just the bag and refunds its share (AC 13, 14)", async () => {
        const before = await pendingDifference(order.id)

        const response = await storeReturn(order.id, [
          {
            id: line.id,
            quantity: 1,
            component_variant_id: kit.bag.variant.id,
          },
        ])

        expect(response.status).toEqual(200)
        expect(response.data.return.items).toEqual([
          expect.objectContaining({
            item_id: line.id,
            quantity: 1,
            metadata: {
              bundle_component: {
                variant_id: kit.bag.variant.id,
                title: "Bag",
                amount: 83.33,
              },
            },
          }),
        ])
        expect((await pendingDifference(order.id)) - before).toBeCloseTo(
          -83.33,
          2
        )

        // The bundle line itself isn't marked as returned.
        const updated = await getOrder(order.id)
        expect(updated.items[0].detail.return_requested_quantity).toEqual(0)
      })

      it("refunds exactly the bundle price once every item is returned (AC 16)", async () => {
        const before = await pendingDifference(order.id)

        for (const part of [kit.camera, kit.lens, kit.bag]) {
          await storeReturn(order.id, [
            { id: line.id, quantity: 1, component_variant_id: part.variant.id },
          ])
        }

        expect((await pendingDifference(order.id)) - before).toBeCloseTo(
          -1000,
          2
        )
      })

      it("returns two items of the same bundle in one return", async () => {
        const response = await storeReturn(order.id, [
          {
            id: line.id,
            quantity: 1,
            component_variant_id: kit.lens.variant.id,
          },
          {
            id: line.id,
            quantity: 1,
            component_variant_id: kit.bag.variant.id,
          },
        ])

        expect(response.data.return.items).toHaveLength(2)
      })

      it("restocks only the returned item when the return is received (AC 15)", async () => {
        const { data } = await api.post(
          "/admin/returns",
          { order_id: order.id, location_id: stockLocation.id },
          adminHeaders
        )
        const returnId = data.return.id

        await api.post(
          `/admin/returns/${returnId}/request-items`,
          {
            items: [
              {
                id: line.id,
                quantity: 1,
                component_variant_id: kit.lens.variant.id,
              },
            ],
          },
          adminHeaders
        )
        await api.post(`/admin/returns/${returnId}/request`, {}, adminHeaders)

        await api.post(`/admin/returns/${returnId}/receive`, {}, adminHeaders)
        await api.post(
          `/admin/returns/${returnId}/receive-items`,
          {
            items: [
              {
                id: line.id,
                quantity: 1,
                component_variant_id: kit.lens.variant.id,
              },
            ],
          },
          adminHeaders
        )
        const confirmed = await api.post(
          `/admin/returns/${returnId}/receive/confirm`,
          {},
          adminHeaders
        )
        expect(confirmed.status).toEqual(200)

        expect(
          (await getLevel(kit.lens.inventoryItem.id)).stocked_quantity
        ).toEqual(10)
        expect(
          (await getLevel(kit.camera.inventoryItem.id)).stocked_quantity
        ).toEqual(9)
        expect(
          (await getLevel(kit.bag.inventoryItem.id)).stocked_quantity
        ).toEqual(9)

        const orderReturn = (
          await api.get(
            `/admin/returns/${returnId}?fields=*items,status`,
            adminHeaders
          )
        ).data.return
        expect(orderReturn.status).toEqual("received")
        expect(orderReturn.items).toEqual([
          expect.objectContaining({ quantity: 1, received_quantity: 1 }),
        ])
      })

      const adminRequestReturn = async (componentVariantId: string) => {
        const { data } = await api.post(
          "/admin/returns",
          { order_id: order.id, location_id: stockLocation.id },
          adminHeaders
        )
        await api.post(
          `/admin/returns/${data.return.id}/request-items`,
          {
            items: [
              {
                id: line.id,
                quantity: 1,
                component_variant_id: componentVariantId,
              },
            ],
          },
          adminHeaders
        )
        await api.post(
          `/admin/returns/${data.return.id}/request`,
          {},
          adminHeaders
        )
        return data.return.id
      }

      it("rejects changing the quantity of a requested single item", async () => {
        const { data } = await api.post(
          "/admin/returns",
          { order_id: order.id, location_id: stockLocation.id },
          adminHeaders
        )
        await api.post(
          `/admin/returns/${data.return.id}/request-items`,
          {
            items: [
              {
                id: line.id,
                quantity: 1,
                component_variant_id: kit.bag.variant.id,
              },
            ],
          },
          adminHeaders
        )
        const changes = (
          await api.get(
            `/admin/orders/${order.id}/changes?fields=*actions`,
            adminHeaders
          )
        ).data.order_changes
        const action = changes
          .flatMap((change) => change.actions)
          .find((a) => a.action === "RETURN_ITEM")

        const error = await api
          .post(
            `/admin/returns/${data.return.id}/request-items/${action.id}`,
            { quantity: 2 },
            adminHeaders
          )
          .catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toEqual(
          "The quantity of a returned bundle item can't be changed. Remove the item and add it again with the new quantity."
        )
      })

      it("frees the item again when its return is canceled", async () => {
        const returnId = await adminRequestReturn(kit.bag.variant.id)

        await api.post(`/admin/returns/${returnId}/cancel`, {}, adminHeaders)

        const response = await storeReturn(order.id, [
          {
            id: line.id,
            quantity: 1,
            component_variant_id: kit.bag.variant.id,
          },
        ])
        expect(response.status).toEqual(200)
      })

      it("refunds but doesn't restock an item received as damaged", async () => {
        const before = await pendingDifference(order.id)
        const returnId = await adminRequestReturn(kit.bag.variant.id)

        await api.post(`/admin/returns/${returnId}/receive`, {}, adminHeaders)
        await api.post(
          `/admin/returns/${returnId}/dismiss-items`,
          {
            items: [
              {
                id: line.id,
                quantity: 1,
                component_variant_id: kit.bag.variant.id,
              },
            ],
          },
          adminHeaders
        )
        await api.post(
          `/admin/returns/${returnId}/receive/confirm`,
          {},
          adminHeaders
        )

        expect(
          (await getLevel(kit.bag.inventoryItem.id)).stocked_quantity
        ).toEqual(9)
        expect((await pendingDifference(order.id)) - before).toBeCloseTo(
          -83.33,
          2
        )
      })

      it("rejects receiving an item the return doesn't have", async () => {
        const returnId = await adminRequestReturn(kit.bag.variant.id)
        await api.post(`/admin/returns/${returnId}/receive`, {}, adminHeaders)

        const error = await api
          .post(
            `/admin/returns/${returnId}/receive-items`,
            {
              items: [
                {
                  id: line.id,
                  quantity: 1,
                  component_variant_id: kit.lens.variant.id,
                },
              ],
            },
            adminHeaders
          )
          .catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toEqual(
          `The return has no item for variant ${kit.lens.variant.id} of item ${line.id}.`
        )
      })

      it("still returns the whole bundle as one item (AC 17)", async () => {
        const before = await pendingDifference(order.id)

        const response = await storeReturn(order.id, [
          { id: line.id, quantity: 1 },
        ])

        expect(response.status).toEqual(200)
        expect((await pendingDifference(order.id)) - before).toBeCloseTo(
          -1000,
          2
        )
      })

      it("rejects a whole-bundle return after one of its items was returned", async () => {
        await storeReturn(order.id, [
          {
            id: line.id,
            quantity: 1,
            component_variant_id: kit.bag.variant.id,
          },
        ])

        const error = await storeReturn(order.id, [
          { id: line.id, quantity: 1 },
        ]).catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toContain(
          "only 0 can be returned whole"
        )
      })

      it("lets an admin refund a different amount than the share (AC 18)", async () => {
        await storeReturn(order.id, [
          {
            id: line.id,
            quantity: 1,
            component_variant_id: kit.bag.variant.id,
          },
        ])

        const payment = (
          await api.get(
            `/admin/orders/${order.id}?fields=*payment_collections.payments`,
            adminHeaders
          )
        ).data.order.payment_collections[0].payments[0]

        await api.post(
          `/admin/payments/${payment.id}/capture`,
          {},
          adminHeaders
        )
        const refunded = await api.post(
          `/admin/payments/${payment.id}/refund`,
          { amount: 50 },
          adminHeaders
        )

        expect(refunded.status).toEqual(200)
        expect(refunded.data.payment.refunds).toEqual([
          expect.objectContaining({ amount: 50 }),
        ])
      })

      it("rejects returning more of an item than was bought (AC 19)", async () => {
        const error = await storeReturn(order.id, [
          {
            id: line.id,
            quantity: 2,
            component_variant_id: kit.bag.variant.id,
          },
        ]).catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toEqual(
          'Cannot return 2 of "Bag" from the bundle "Camera kit": only 1 can be returned.'
        )
      })

      it("rejects returning an item again after it was returned (AC 19)", async () => {
        await storeReturn(order.id, [
          {
            id: line.id,
            quantity: 1,
            component_variant_id: kit.bag.variant.id,
          },
        ])

        const error = await storeReturn(order.id, [
          {
            id: line.id,
            quantity: 1,
            component_variant_id: kit.bag.variant.id,
          },
        ]).catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toContain("only 0 can be returned")
      })

      it("rejects an item that isn't in that bundle (AC 19)", async () => {
        const other = await createComponent("Tripod", 50, 10)

        const error = await storeReturn(order.id, [
          { id: line.id, quantity: 1, component_variant_id: other.variant.id },
        ]).catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toEqual(
          `Variant ${other.variant.id} is not part of the bundle "Camera kit".`
        )
      })

      it("only lets the customer who owns the order return a single item (AC 20)", async () => {
        const item = [
          {
            id: line.id,
            quantity: 1,
            component_variant_id: kit.bag.variant.id,
          },
        ]

        const guest = await storeReturn(order.id, item, storeHeaders).catch(
          (e) => e
        )
        expect(guest.response.status).toEqual(401)

        const stranger = await storeReturn(
          order.id,
          item,
          otherCustomerHeaders
        ).catch((e) => e)
        expect(stranger.response.status).toEqual(404)

        // Nothing was returned by the rejected requests.
        const owner = await storeReturn(order.id, item)
        expect(owner.status).toEqual(200)
      })
    })
  },
})
