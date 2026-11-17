import { createBundleWorkflow } from "@medusajs/core-flows"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  adminHeaders,
  createAdminUser,
  generatePublishableKey,
  generateStoreHeaders,
} from "../../../../helpers/create-admin-user"

jest.setTimeout(100000)

/**
 * Integration tests for issue #112 "Add API to create and manage product
 * bundles" (part 1 of #101). Each `describe` below is named after the
 * acceptance criterion (AC) it covers, so the issue can be checked off
 * against this file.
 *
 * Model under test: a bundle is a product with ONE variant that has its own
 * prices and is linked (inventory kit) to the component inventory items. The
 * component list is stored in product.metadata.bundle.
 */
medusaIntegrationTestRunner({
  testSuite: ({ dbConnection, getContainer, api }) => {
    let appContainer
    let storeHeaders
    let shippingProfile
    let salesChannel
    let stockLocation
    let category
    let region
    let shippingOption

    // Makes the "failing hook" test (AC 8) possible. Hooks can't be removed once
    // registered, so the handler is registered once and switched on and off.
    let failBundleCreatedHook = false

    // Counter so every helper call gets unique SKUs / titles / handles.
    let seq = 0

    /**
     * Creates a normal product with one variant that tracks inventory, has
     * `stocked` units in the shared stock location and an optional
     * `required_quantity` on its inventory item. This is what a bundle
     * component looks like.
     */
    const createComponent = async (
      title: string,
      stocked: number,
      requiredQuantity = 1
    ) => {
      seq++
      const inventoryItem = (
        await api.post(
          "/admin/inventory-items",
          { sku: `${title}-sku-${seq}` },
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
            title: `${title} ${seq}`,
            status: ProductStatus.PUBLISHED,
            shipping_profile_id: shippingProfile.id,
            sales_channels: [{ id: salesChannel.id }],
            options: [{ title: "Default", values: ["Default"] }],
            variants: [
              {
                title: `${title} variant`,
                options: { Default: "Default" },
                manage_inventory: true,
                inventory_items: [
                  {
                    inventory_item_id: inventoryItem.id,
                    required_quantity: requiredQuantity,
                  },
                ],
                // Component prices are deliberately different from the bundle
                // price (AC 10).
                prices: [{ currency_code: "usd", amount: 500 }],
              },
            ],
          },
          adminHeaders
        )
      ).data.product

      return { product, variant: product.variants[0], inventoryItem }
    }

    /**
     * The "Camera kit" from the issue: 1x camera, 1x lens, 1x bag at
     * $899 / EUR 849. Returns the components too so tests can inspect them.
     */
    const createCameraKitParts = async (stock = { camera: 10, lens: 10, bag: 10 }) => ({
      camera: await createComponent("Camera", stock.camera),
      lens: await createComponent("Lens", stock.lens),
      bag: await createComponent("Bag", stock.bag),
    })

    const bundleBody = (parts, overrides: Record<string, unknown> = {}) => {
      seq++
      return {
        title: `Camera kit ${seq}`,
        description: "Everything to start shooting",
        status: ProductStatus.PUBLISHED,
        images: [{ url: "https://example.com/camera-kit.png" }],
        categories: [{ id: category.id }],
        shipping_profile_id: shippingProfile.id,
        sales_channels: [{ id: salesChannel.id }],
        components: [
          { variant_id: parts.camera.variant.id, quantity: 1 },
          { variant_id: parts.lens.variant.id, quantity: 1 },
          { variant_id: parts.bag.variant.id, quantity: 1 },
        ],
        prices: [
          { currency_code: "usd", amount: 899 },
          { currency_code: "eur", amount: 849 },
        ],
        ...overrides,
      }
    }

    const createBundle = async (body) =>
      (
        await api.post(
          "/admin/bundles?fields=*variants,*variants.prices,*variants.inventory_items,*categories,*images,metadata",
          body,
          adminHeaders
        )
      ).data.product

    const getLinks = async (inventoryItemIds: string[]) => {
      const query = appContainer.resolve(ContainerRegistrationKeys.QUERY)
      const { data } = await query.graph({
        entity: "product_variant_inventory_items",
        fields: ["variant_id", "inventory_item_id", "required_quantity"],
        filters: { inventory_item_id: inventoryItemIds },
      })
      return data
    }

    beforeAll(async () => {
      appContainer = getContainer()
      await createAdminUser(dbConnection, adminHeaders, appContainer)

      // Switchable failure used by the AC 8 (rollback) test.
      createBundleWorkflow.hooks.bundleCreated(async () => {
        if (failBundleCreatedHook) {
          throw new Error("forced failure after bundle creation")
        }
      })

      const publishableKey = await generatePublishableKey(appContainer)
      storeHeaders = generateStoreHeaders({ publishableKey })

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
          { name: "Webshop", description: "channel" },
          adminHeaders
        )
      ).data.sales_channel

      // The publishable key only sees this sales channel, which is what the
      // store needs to compute inventory availability.
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

      // Shipping setup, needed to complete carts (AC 5 and AC 12).
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
            name: "Bundle-zone",
            geo_zones: [{ type: "country", country_code: "US" }],
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
            name: "Bundle shipping",
            service_zone_id: fulfillmentSet.service_zones[0].id,
            shipping_profile_id: shippingProfile.id,
            provider_id: "manual_test-provider",
            price_type: "flat",
            type: { label: "Std", description: "Std", code: "std" },
            prices: [{ currency_code: "usd", amount: 10 }],
            rules: [],
          },
          adminHeaders
        )
      ).data.shipping_option

      category = (
        await api.post(
          "/admin/product-categories",
          { name: "Cameras", is_active: true, is_internal: false },
          adminHeaders
        )
      ).data.product_category
    })

    /**
     * Builds a cart with the bundle, completes it and returns the order.
     */
    const placeOrder = async (bundleVariantId: string, quantity: number) => {
      const cart = (
        await api.post(
          "/store/carts",
          {
            email: "shopper@example.com",
            currency_code: "usd",
            sales_channel_id: salesChannel.id,
            region_id: region.id,
            shipping_address: {
              address_1: "1 Main St",
              city: "SF",
              country_code: "US",
              province: "CA",
              postal_code: "94016",
            },
            items: [{ variant_id: bundleVariantId, quantity }],
          },
          storeHeaders
        )
      ).data.cart

      await api.post(
        `/store/carts/${cart.id}/shipping-methods`,
        { option_id: shippingOption.id },
        storeHeaders
      )

      const paymentCollection = (
        await api.post(
          "/store/payment-collections",
          { cart_id: cart.id },
          storeHeaders
        )
      ).data.payment_collection

      await api.post(
        `/store/payment-collections/${paymentCollection.id}/payment-sessions`,
        { provider_id: "pp_system_default" },
        storeHeaders
      )

      const response = await api.post(
        `/store/carts/${cart.id}/complete`,
        {},
        storeHeaders
      )

      return response.data.order
    }

    describe("AC 1: create a bundle", () => {
      it("creates the Camera kit with product fields, 3 components and prices per currency", async () => {
        const parts = await createCameraKitParts()

        const response = await api.post(
          "/admin/bundles?fields=*variants,*variants.prices,*variants.inventory_items,*categories,*images,metadata",
          bundleBody(parts, { title: "Camera kit" }),
          adminHeaders
        )

        expect(response.status).toEqual(200)
        const bundle = response.data.product

        // normal product fields
        expect(bundle.title).toEqual("Camera kit")
        expect(bundle.description).toEqual("Everything to start shooting")
        expect(bundle.images).toEqual([
          expect.objectContaining({ url: "https://example.com/camera-kit.png" }),
        ])
        expect(bundle.categories).toEqual([
          expect.objectContaining({ id: category.id }),
        ])

        // one variant with its own prices in both currencies
        expect(bundle.variants).toHaveLength(1)
        expect(bundle.variants[0].prices).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ currency_code: "usd", amount: 899 }),
            expect.objectContaining({ currency_code: "eur", amount: 849 }),
          ])
        )

        // components stored on the product
        expect(bundle.metadata.bundle.components).toEqual([
          { variant_id: parts.camera.variant.id, quantity: 1 },
          { variant_id: parts.lens.variant.id, quantity: 1 },
          { variant_id: parts.bag.variant.id, quantity: 1 },
        ])

        // the bundle variant is linked to every component inventory item
        expect(bundle.variants[0].inventory_items).toHaveLength(3)
        expect(
          bundle.variants[0].inventory_items.map((l) => l.inventory_item_id).sort()
        ).toEqual(
          [
            parts.camera.inventoryItem.id,
            parts.lens.inventoryItem.id,
            parts.bag.inventoryItem.id,
          ].sort()
        )
      })
    })

    describe("AC 2: update a bundle", () => {
      it("updates product fields, components, quantities and prices", async () => {
        const parts = await createCameraKitParts()
        const extra = await createComponent("Tripod", 10)
        const bundle = await createBundle(bundleBody(parts))

        const response = await api.post(
          `/admin/bundles/${bundle.id}?fields=*variants,*variants.prices,*variants.inventory_items,metadata`,
          {
            title: "Camera kit v2",
            // swap the bag for a tripod, and take 2 lenses
            components: [
              { variant_id: parts.camera.variant.id, quantity: 1 },
              { variant_id: parts.lens.variant.id, quantity: 2 },
              { variant_id: extra.variant.id, quantity: 1 },
            ],
            prices: [{ currency_code: "usd", amount: 799 }],
          },
          adminHeaders
        )

        expect(response.status).toEqual(200)
        const updated = response.data.product
        expect(updated.title).toEqual("Camera kit v2")
        expect(updated.metadata.bundle.components).toEqual([
          { variant_id: parts.camera.variant.id, quantity: 1 },
          { variant_id: parts.lens.variant.id, quantity: 2 },
          { variant_id: extra.variant.id, quantity: 1 },
        ])
        expect(updated.variants[0].prices).toEqual([
          expect.objectContaining({ currency_code: "usd", amount: 799 }),
        ])

        const links = updated.variants[0].inventory_items
        const byItem = Object.fromEntries(
          links.map((l) => [l.inventory_item_id, l.required_quantity])
        )
        expect(byItem).toEqual({
          [parts.camera.inventoryItem.id]: 1,
          [parts.lens.inventoryItem.id]: 2, // quantity changed
          [extra.inventoryItem.id]: 1, // added
          // bag link removed
        })
      })

      it("keeps components when only the title is updated", async () => {
        const parts = await createCameraKitParts()
        const bundle = await createBundle(bundleBody(parts))

        const response = await api.post(
          `/admin/bundles/${bundle.id}?fields=*variants.inventory_items,metadata`,
          { title: "Renamed kit" },
          adminHeaders
        )

        expect(response.data.product.metadata.bundle.components).toHaveLength(3)
        expect(response.data.product.variants[0].inventory_items).toHaveLength(3)
      })

      it("returns 404 when the product is not a bundle", async () => {
        const plain = await createComponent("Plain", 5)

        const error = await api
          .post(`/admin/bundles/${plain.product.id}`, { title: "x" }, adminHeaders)
          .catch((e) => e)

        expect(error.response.status).toEqual(404)
        expect(error.response.data.message).toMatch(/not a bundle/)
      })

      it("rejects a plain product update that sets the reserved bundle metadata key", async () => {
        const plain = await createComponent("Plain", 5)

        const error = await api
          .post(
            `/admin/products/${plain.product.id}`,
            { metadata: { bundle: { components: [] } } },
            adminHeaders
          )
          .catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toMatch(/'bundle' metadata key is reserved/)
      })
    })

    describe("AC 3: the store API returns a bundle like any other product", () => {
      it("returns the bundle on its own and in category listings with title, images, price and categories", async () => {
        const parts = await createCameraKitParts()
        const bundle = await createBundle(bundleBody(parts, { title: "Store kit" }))
        const fields = "fields=*variants.calculated_price,*images,*categories"
        const pricing = `region_id=${region.id}`

        const single = await api.get(
          `/store/products/${bundle.id}?${fields}&${pricing}`,
          storeHeaders
        )
        expect(single.status).toEqual(200)
        expect(single.data.product).toEqual(
          expect.objectContaining({
            id: bundle.id,
            title: "Store kit",
            images: [expect.objectContaining({ url: "https://example.com/camera-kit.png" })],
            categories: [expect.objectContaining({ id: category.id })],
          })
        )
        expect(single.data.product.variants[0].calculated_price.calculated_amount).toEqual(899)

        const list = await api.get(
          `/store/products?category_id[]=${category.id}&${fields}&${pricing}`,
          storeHeaders
        )
        expect(list.data.products.map((p) => p.id)).toContain(bundle.id)
      })
    })

    describe("AC 4: the store API marks bundles and lists their components", () => {
      it("returns bundle.components for a bundle and no bundle field for a normal product", async () => {
        const parts = await createCameraKitParts()
        const bundle = await createBundle(bundleBody(parts))

        const bundleRes = await api.get(`/store/products/${bundle.id}`, storeHeaders)
        expect(bundleRes.data.product.bundle).toEqual({
          components: [
            { variant_id: parts.camera.variant.id, quantity: 1 },
            { variant_id: parts.lens.variant.id, quantity: 1 },
            { variant_id: parts.bag.variant.id, quantity: 1 },
          ],
        })
        // metadata is not leaked unless asked for
        expect(bundleRes.data.product.metadata).toBeUndefined()

        const plainRes = await api.get(
          `/store/products/${parts.camera.product.id}`,
          storeHeaders
        )
        expect(plainRes.data.product.bundle).toBeUndefined()

        // also in the list route
        const list = await api.get("/store/products", storeHeaders)
        expect(list.data.products.find((p) => p.id === bundle.id).bundle).toBeDefined()
        expect(
          list.data.products.find((p) => p.id === parts.camera.product.id).bundle
        ).toBeUndefined()
      })
    })

    describe("AC 5: ordering a bundle reduces stock of each component", () => {
      it("reserves quantity x number of bundles ordered for every component", async () => {
        // lens counts 2 per bundle; 2 bundles are ordered
        const parts = {
          camera: await createComponent("Camera", 20),
          lens: await createComponent("Lens", 20),
          bag: await createComponent("Bag", 20),
        }
        const bundle = await createBundle(
          bundleBody(parts, {
            components: [
              { variant_id: parts.camera.variant.id, quantity: 1 },
              { variant_id: parts.lens.variant.id, quantity: 2 },
              { variant_id: parts.bag.variant.id, quantity: 1 },
            ],
          })
        )

        const order = await placeOrder(bundle.variants[0].id, 2)
        expect(order.items).toEqual([
          expect.objectContaining({ quantity: 2 }),
        ])

        const reservations = (
          await api.get("/admin/reservations?limit=100", adminHeaders)
        ).data.reservations
        const reservedFor = (inventoryItemId: string) =>
          reservations
            .filter((r) => r.inventory_item_id === inventoryItemId)
            .reduce((sum, r) => sum + Number(r.quantity), 0)

        expect(reservedFor(parts.camera.inventoryItem.id)).toEqual(2) // 1 x 2
        expect(reservedFor(parts.lens.inventoryItem.id)).toEqual(4) // 2 x 2
        expect(reservedFor(parts.bag.inventoryItem.id)).toEqual(2) // 1 x 2
      })
    })

    describe("AC 6: bundle availability", () => {
      const availability = async (bundleId: string) =>
        (
          await api.get(
            `/store/products/${bundleId}?fields=%2bvariants.inventory_quantity`,
            storeHeaders
          )
        ).data.product.variants[0].inventory_quantity

      it("is the lowest number of complete bundles the component stock can make", async () => {
        // camera 10 (1 each) -> 10, lens 7 (2 each) -> 3, bag 3 (1 each) -> 3
        const parts = await createCameraKitParts({ camera: 10, lens: 7, bag: 3 })
        const bundle = await createBundle(
          bundleBody(parts, {
            components: [
              { variant_id: parts.camera.variant.id, quantity: 1 },
              { variant_id: parts.lens.variant.id, quantity: 2 },
              { variant_id: parts.bag.variant.id, quantity: 1 },
            ],
          })
        )

        expect(await availability(bundle.id)).toEqual(3)
      })

      it("is 0 (out of stock) when any component is out of stock", async () => {
        const parts = await createCameraKitParts({ camera: 10, lens: 10, bag: 0 })
        const bundle = await createBundle(bundleBody(parts))

        expect(await availability(bundle.id)).toEqual(0)
      })
    })

    describe("AC 7: invalid requests are rejected with a clear error", () => {
      let parts

      beforeAll(async () => {
        parts = await createCameraKitParts()
      })

      const expectRejected = async (body, status: number, message: RegExp) => {
        const error = await api.post("/admin/bundles", body, adminHeaders).catch((e) => e)
        expect(error.response.status).toEqual(status)
        expect(error.response.data.message).toMatch(message)
      }

      it("fewer than 2 components", async () => {
        await expectRejected(
          bundleBody(parts, {
            components: [{ variant_id: parts.camera.variant.id, quantity: 1 }],
          }),
          400,
          /components/i
        )
      })

      it("a component variant that doesn't exist", async () => {
        await expectRejected(
          bundleBody(parts, {
            components: [
              { variant_id: parts.camera.variant.id, quantity: 1 },
              { variant_id: "variant_does_not_exist", quantity: 1 },
            ],
          }),
          404,
          /variant_does_not_exist/
        )
      })

      it("a component that doesn't track inventory", async () => {
        seq++
        const untracked = (
          await api.post(
            "/admin/products",
            {
              title: `Untracked ${seq}`,
              options: [{ title: "Default", values: ["Default"] }],
              variants: [
                {
                  title: "v",
                  options: { Default: "Default" },
                  manage_inventory: false,
                  prices: [{ currency_code: "usd", amount: 5 }],
                },
              ],
            },
            adminHeaders
          )
        ).data.product

        await expectRejected(
          bundleBody(parts, {
            components: [
              { variant_id: parts.camera.variant.id, quantity: 1 },
              { variant_id: untracked.variants[0].id, quantity: 1 },
            ],
          }),
          400,
          /doesn't track inventory/
        )
      })

      it("a component that is itself a bundle", async () => {
        const inner = await createBundle(bundleBody(parts))

        await expectRejected(
          bundleBody(parts, {
            components: [
              { variant_id: parts.camera.variant.id, quantity: 1 },
              { variant_id: inner.variants[0].id, quantity: 1 },
            ],
          }),
          400,
          /belongs to a bundle/
        )
      })

      it("the same component listed twice", async () => {
        await expectRejected(
          bundleBody(parts, {
            components: [
              { variant_id: parts.camera.variant.id, quantity: 1 },
              { variant_id: parts.camera.variant.id, quantity: 2 },
            ],
          }),
          400,
          /must be unique/
        )
      })

      it.each([0, -1])("a quantity of %p", async (quantity) => {
        await expectRejected(
          bundleBody(parts, {
            components: [
              { variant_id: parts.camera.variant.id, quantity },
              { variant_id: parts.lens.variant.id, quantity: 1 },
            ],
          }),
          400,
          /quantity/i
        )
      })

      it("a missing price", async () => {
        const body: any = bundleBody(parts)
        delete body.prices
        await expectRejected(body, 400, /prices/i)
        await expectRejected(bundleBody(parts, { prices: [] }), 400, /prices/i)
      })

      it("a negative price", async () => {
        await expectRejected(
          bundleBody(parts, { prices: [{ currency_code: "usd", amount: -1 }] }),
          400,
          /amount/i
        )
      })

      it("applies the same rules to updates", async () => {
        const bundle = await createBundle(bundleBody(parts))

        const error = await api
          .post(
            `/admin/bundles/${bundle.id}`,
            {
              components: [
                { variant_id: parts.camera.variant.id, quantity: 1 },
                { variant_id: parts.camera.variant.id, quantity: 1 },
              ],
            },
            adminHeaders
          )
          .catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toMatch(/must be unique/)
      })
    })

    describe("AC 8: a rejected create leaves no partial bundle behind", () => {
      afterEach(() => {
        failBundleCreatedHook = false
      })

      it("rolls back the product, variant and links when the workflow fails after creating them", async () => {
        const parts = await createCameraKitParts()
        const inventoryItemIds = [
          parts.camera.inventoryItem.id,
          parts.lens.inventoryItem.id,
          parts.bag.inventoryItem.id,
        ]
        // each component has only its own link before the attempt
        expect(await getLinks(inventoryItemIds)).toHaveLength(3)

        failBundleCreatedHook = true
        const error = await api
          .post("/admin/bundles", bundleBody(parts, { title: "Rollback kit" }), adminHeaders)
          .catch((e) => e)
        expect(error.response.status).toBeGreaterThanOrEqual(400)

        // no product left behind
        const products = (
          await api.get("/admin/products?q=Rollback kit", adminHeaders)
        ).data.products
        expect(products).toHaveLength(0)

        // no extra inventory links left behind (still only the components' own)
        expect(await getLinks(inventoryItemIds)).toHaveLength(3)
      })

      it("creates nothing when validation fails", async () => {
        const parts = await createCameraKitParts()
        const before = (await api.get("/admin/products?limit=1", adminHeaders)).data.count

        await api
          .post(
            "/admin/bundles",
            bundleBody(parts, {
              components: [
                { variant_id: parts.camera.variant.id, quantity: 1 },
                { variant_id: "variant_does_not_exist", quantity: 1 },
              ],
            }),
            adminHeaders
          )
          .catch(() => {})

        const after = (await api.get("/admin/products?limit=1", adminHeaders)).data.count
        expect(after).toEqual(before)
      })
    })

    describe("AC 9: only logged-in admins can create or update bundles", () => {
      it("returns 401 without admin credentials", async () => {
        const parts = await createCameraKitParts()
        const bundle = await createBundle(bundleBody(parts))

        const createError = await api
          .post("/admin/bundles", bundleBody(parts))
          .catch((e) => e)
        expect(createError.response.status).toEqual(401)

        const updateError = await api
          .post(`/admin/bundles/${bundle.id}`, { title: "hacked" })
          .catch((e) => e)
        expect(updateError.response.status).toEqual(401)

        // and a store (publishable key only) caller is not an admin either
        const storeError = await api
          .post("/admin/bundles", bundleBody(parts), storeHeaders)
          .catch((e) => e)
        expect(storeError.response.status).toEqual(401)
      })
    })

    describe("AC 10: a component's price change does not change the bundle price", () => {
      it("keeps the bundle price when a component price changes", async () => {
        const parts = await createCameraKitParts()
        const bundle = await createBundle(bundleBody(parts))

        await api.post(
          `/admin/products/${parts.camera.product.id}/variants/${parts.camera.variant.id}`,
          { prices: [{ currency_code: "usd", amount: 9999 }] },
          adminHeaders
        )

        const after = (
          await api.get(
            `/admin/products/${bundle.id}?fields=*variants,*variants.prices`,
            adminHeaders
          )
        ).data.product

        expect(after.variants[0].prices).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ currency_code: "usd", amount: 899 }),
            expect.objectContaining({ currency_code: "eur", amount: 849 }),
          ])
        )
      })
    })

    describe("AC 11: components used in a bundle can't be deleted", () => {
      it("blocks deleting a product used in a bundle and names the bundle", async () => {
        const parts = await createCameraKitParts()
        const bundle = await createBundle(bundleBody(parts, { title: "Camera kit" }))

        const error = await api
          .delete(`/admin/products/${parts.lens.product.id}`, adminHeaders)
          .catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toContain(`"Camera kit" (${bundle.id})`)

        // the product is still there
        const stillThere = await api.get(
          `/admin/products/${parts.lens.product.id}`,
          adminHeaders
        )
        expect(stillThere.status).toEqual(200)
      })

      it("blocks deleting a variant used in a bundle and names the bundle", async () => {
        const parts = await createCameraKitParts()
        const bundle = await createBundle(bundleBody(parts, { title: "Camera kit" }))

        const error = await api
          .delete(
            `/admin/products/${parts.bag.product.id}/variants/${parts.bag.variant.id}`,
            adminHeaders
          )
          .catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toContain(`"Camera kit" (${bundle.id})`)
      })

      it("names every bundle that uses the component", async () => {
        const parts = await createCameraKitParts()
        const first = await createBundle(bundleBody(parts, { title: "Kit one" }))
        const second = await createBundle(bundleBody(parts, { title: "Kit two" }))

        const error = await api
          .delete(`/admin/products/${parts.camera.product.id}`, adminHeaders)
          .catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toContain(`"Kit one" (${first.id})`)
        expect(error.response.data.message).toContain(`"Kit two" (${second.id})`)
      })

      it("allows the delete once the component is removed from every bundle", async () => {
        const parts = await createCameraKitParts()
        const extra = await createComponent("Tripod", 10)
        const bundle = await createBundle(bundleBody(parts))

        // swap the lens for a tripod
        await api.post(
          `/admin/bundles/${bundle.id}`,
          {
            components: [
              { variant_id: parts.camera.variant.id, quantity: 1 },
              { variant_id: extra.variant.id, quantity: 1 },
              { variant_id: parts.bag.variant.id, quantity: 1 },
            ],
          },
          adminHeaders
        )

        const response = await api.delete(
          `/admin/products/${parts.lens.product.id}`,
          adminHeaders
        )
        expect(response.status).toEqual(200)
        expect(response.data.deleted).toEqual(true)
      })

      it("allows deleting the bundle itself", async () => {
        const parts = await createCameraKitParts()
        const bundle = await createBundle(bundleBody(parts))

        const response = await api.delete(`/admin/products/${bundle.id}`, adminHeaders)
        expect(response.status).toEqual(200)

        // and now the components are free to delete too
        const lensDelete = await api.delete(
          `/admin/products/${parts.lens.product.id}`,
          adminHeaders
        )
        expect(lensDelete.status).toEqual(200)
      })
    })

    describe("AC 12: past orders keep working after the bundle is edited or deleted", () => {
      it("can still view and fulfill the order after the bundle is edited", async () => {
        const parts = await createCameraKitParts()
        const extra = await createComponent("Tripod", 10)
        const bundle = await createBundle(bundleBody(parts))
        const order = await placeOrder(bundle.variants[0].id, 1)

        await api.post(
          `/admin/bundles/${bundle.id}`,
          {
            title: "Edited kit",
            components: [
              { variant_id: parts.camera.variant.id, quantity: 1 },
              { variant_id: extra.variant.id, quantity: 1 },
            ],
          },
          adminHeaders
        )

        const viewed = await api.get(`/admin/orders/${order.id}`, adminHeaders)
        expect(viewed.status).toEqual(200)

        const fulfillment = await api.post(
          `/admin/orders/${order.id}/fulfillments`,
          {
            location_id: stockLocation.id,
            items: [{ id: order.items[0].id, quantity: 1 }],
          },
          adminHeaders
        )
        expect(fulfillment.status).toEqual(200)
      })

      it("can still view the order after the bundle is deleted", async () => {
        const parts = await createCameraKitParts()
        const bundle = await createBundle(bundleBody(parts))
        const order = await placeOrder(bundle.variants[0].id, 1)

        await api.delete(`/admin/products/${bundle.id}`, adminHeaders)

        const viewed = await api.get(`/admin/orders/${order.id}`, adminHeaders)
        expect(viewed.status).toEqual(200)
        expect(viewed.data.order.items).toHaveLength(1)
      })

      it("can still fulfill the order after the bundle is deleted", async () => {
        const parts = await createCameraKitParts()
        const bundle = await createBundle(bundleBody(parts))
        const order = await placeOrder(bundle.variants[0].id, 1)

        await api.delete(`/admin/products/${bundle.id}`, adminHeaders)

        const fulfillment = await api.post(
          `/admin/orders/${order.id}/fulfillments`,
          {
            location_id: stockLocation.id,
            items: [{ id: order.items[0].id, quantity: 1 }],
          },
          adminHeaders
        )
        expect(fulfillment.status).toEqual(200)
      })
    })

    describe("AC 13: existing data and behaviour are unchanged", () => {
      it("returns normal products without a bundle field and creates normal products as before", async () => {
        const plain = await createComponent("Plain", 5)

        const store = await api.get(`/store/products/${plain.product.id}`, storeHeaders)
        expect(store.data.product).not.toHaveProperty("bundle")
        expect(store.data.product).not.toHaveProperty("metadata")

        const admin = await api.get(`/admin/products/${plain.product.id}`, adminHeaders)
        expect(admin.data.product.metadata ?? {}).not.toHaveProperty("bundle")
      })

      it("still lets plain products use other metadata keys", async () => {
        const plain = await createComponent("Plain", 5)

        const response = await api.post(
          `/admin/products/${plain.product.id}`,
          { metadata: { erp_id: "123" } },
          adminHeaders
        )
        expect(response.status).toEqual(200)
        expect(response.data.product.metadata).toEqual({ erp_id: "123" })
      })

      it("does not allow duplicating a bundle", async () => {
        const parts = await createCameraKitParts()
        const bundle = await createBundle(bundleBody(parts))

        const error = await api
          .post(
            `/admin/products/${bundle.id}/duplicate`,
            { title: "Copy", handle: `copy-${bundle.id}` },
            adminHeaders
          )
          .catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toMatch(/can't be duplicated/)
      })
    })
  },
})
