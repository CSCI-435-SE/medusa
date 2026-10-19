import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  Modules,
  OrderStatus,
  PriceListStatus,
  PriceListType,
  ProductStatus,
} from "@medusajs/utils"
import {
  adminHeaders,
  createAdminUser,
  generatePublishableKey,
  generateStoreHeaders,
} from "../../../../helpers/create-admin-user"

jest.setTimeout(100000)

const env = {}

medusaIntegrationTestRunner({
  env,
  testSuite: ({ dbConnection, getContainer, api }) => {
    describe("GET /store/carts/:id/suggested-product", () => {
      let appContainer
      let storeHeaders
      let region
      let salesChannel
      let otherSalesChannel
      let stockLocation
      let shippingProfile
      let category
      let otherCategory
      let anchor
      let fulfillmentSetCount = 0

      const createProduct = async (
        title: string,
        {
          stockedQuantity = 10,
          currencyCode = "usd",
          salesChannelId = salesChannel.id,
          status = ProductStatus.PUBLISHED,
          categoryIds = [category.id],
          shippingProfileId = shippingProfile.id,
        }: {
          stockedQuantity?: number
          currencyCode?: string
          salesChannelId?: string
          status?: ProductStatus
          categoryIds?: string[]
          shippingProfileId?: string
        } = {}
      ) => {
        const inventoryItem = (
          await api.post(
            `/admin/inventory-items`,
            { sku: `${title}-sku` },
            adminHeaders
          )
        ).data.inventory_item

        await api.post(
          `/admin/inventory-items/${inventoryItem.id}/location-levels`,
          { location_id: stockLocation.id, stocked_quantity: stockedQuantity },
          adminHeaders
        )

        return (
          await api.post(
            "/admin/products",
            {
              title,
              status,
              shipping_profile_id: shippingProfileId,
              sales_channels: [{ id: salesChannelId }],
              categories: categoryIds.map((id) => ({ id })),
              options: [{ title: "size", values: ["S"] }],
              variants: [
                {
                  title: `${title} S`,
                  options: { size: "S" },
                  manage_inventory: true,
                  inventory_items: [
                    {
                      inventory_item_id: inventoryItem.id,
                      required_quantity: 1,
                    },
                  ],
                  prices: [{ currency_code: currencyCode, amount: 1500 }],
                },
              ],
            },
            adminHeaders
          )
        ).data.product
      }

      // Creates a shipping profile with a shipping option that delivers to
      // the given country from the given location
      const createShippingProfile = async (
        name: string,
        {
          countryCode = "us",
          currencyCode = "usd",
          enabledInStore = true,
          locationId = stockLocation.id,
        }: {
          countryCode?: string
          currencyCode?: string
          enabledInStore?: boolean
          locationId?: string
        } = {}
      ) => {
        const profile = (
          await api.post(
            `/admin/shipping-profiles`,
            { name, type: name },
            adminHeaders
          )
        ).data.shipping_profile

        const fulfillmentSets = (
          await api.post(
            `/admin/stock-locations/${locationId}/fulfillment-sets?fields=*fulfillment_sets`,
            {
              name: `${name}-${++fulfillmentSetCount}`,
              type: "shipping",
            },
            adminHeaders
          )
        ).data.stock_location.fulfillment_sets

        const fulfillmentSet = (
          await api.post(
            `/admin/fulfillment-sets/${
              fulfillmentSets[fulfillmentSets.length - 1].id
            }/service-zones?fields=*service_zones`,
            {
              name,
              geo_zones: [{ type: "country", country_code: countryCode }],
            },
            adminHeaders
          )
        ).data.fulfillment_set

        await api.post(
          `/admin/shipping-options`,
          {
            name,
            service_zone_id: fulfillmentSet.service_zones[0].id,
            shipping_profile_id: profile.id,
            provider_id: "manual_test-provider",
            price_type: "flat",
            type: {
              label: "Standard",
              description: "Standard shipping",
              code: "standard",
            },
            prices: [{ currency_code: currencyCode, amount: 1000 }],
            rules: [
              {
                attribute: "enabled_in_store",
                value: enabledInStore ? "true" : "false",
                operator: "eq",
              },
              { attribute: "is_return", value: "false", operator: "eq" },
            ],
          },
          adminHeaders
        )

        return profile
      }

      const createCategory = async (
        name: string,
        {
          isActive = true,
          isInternal = false,
          parentCategoryId,
        }: {
          isActive?: boolean
          isInternal?: boolean
          parentCategoryId?: string
        } = {}
      ) => {
        return (
          await api.post(
            "/admin/product-categories",
            {
              name,
              is_active: isActive,
              is_internal: isInternal,
              parent_category_id: parentCategoryId,
            },
            adminHeaders
          )
        ).data.product_category
      }

      const createOrder = async (
        product,
        quantity: number,
        {
          salesChannelId = salesChannel.id,
          status = OrderStatus.PENDING,
        }: { salesChannelId?: string; status?: OrderStatus } = {}
      ) => {
        const orderModule = appContainer.resolve(Modules.ORDER)

        await orderModule.createOrders({
          region_id: region.id,
          sales_channel_id: salesChannelId,
          currency_code: "usd",
          email: "buyer@medusajs.com",
          status,
          items: [
            {
              title: product.title,
              product_id: product.id,
              variant_id: product.variants[0].id,
              quantity,
              unit_price: 1500,
            },
          ],
        })
      }

      // Most carts hold the anchor product, so its category is the cart's
      const createCart = async (
        variantIds: string[] = [anchor.variants[0].id],
        { countryCode }: { countryCode?: string } = {}
      ) => {
        const cart = (
          await api.post(
            `/store/carts`,
            {
              region_id: region.id,
              sales_channel_id: salesChannel.id,
              ...(countryCode
                ? { shipping_address: { country_code: countryCode } }
                : {}),
              items: variantIds.map((variant_id) => ({
                variant_id,
                quantity: 1,
              })),
            },
            storeHeaders
          )
        ).data.cart

        return cart
      }

      const getSuggestedProduct = async (cartId: string) => {
        const response = await api.get(
          `/store/carts/${cartId}/suggested-product`,
          storeHeaders
        )

        expect(response.status).toEqual(200)

        return response.data.suggested_product
      }

      beforeEach(async () => {
        appContainer = getContainer()
        await createAdminUser(dbConnection, adminHeaders, appContainer)

        const publishableKey = await generatePublishableKey(appContainer)
        storeHeaders = generateStoreHeaders({ publishableKey })

        region = (
          await api.post(
            "/admin/regions",
            {
              name: "North America",
              currency_code: "usd",
              countries: ["us", "ca"],
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

        otherSalesChannel = (
          await api.post(
            "/admin/sales-channels",
            { name: "Marketplace" },
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
            `/admin/stock-locations`,
            { name: "Warehouse" },
            adminHeaders
          )
        ).data.stock_location

        await api.post(
          `/admin/stock-locations/${stockLocation.id}/sales-channels`,
          { add: [salesChannel.id, otherSalesChannel.id] },
          adminHeaders
        )

        await api.post(
          `/admin/stock-locations/${stockLocation.id}/fulfillment-providers`,
          { add: ["manual_test-provider"] },
          adminHeaders
        )

        shippingProfile = await createShippingProfile("default")

        category = await createCategory("Shirts")
        otherCategory = await createCategory("Shoes")

        anchor = await createProduct("anchor")
      })

      it("should return the category's best-selling product with its variants and prices", async () => {
        const runnerUp = await createProduct("runner-up")
        const bestSeller = await createProduct("best-seller")

        await createOrder(bestSeller, 3)
        await createOrder(bestSeller, 2)
        await createOrder(runnerUp, 4)

        const cart = await createCart()
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct).toEqual(
          expect.objectContaining({
            id: bestSeller.id,
            title: "best-seller",
            variants: [
              expect.objectContaining({
                id: bestSeller.variants[0].id,
                calculated_price: expect.objectContaining({
                  calculated_amount: 1500,
                  currency_code: "usd",
                }),
              }),
            ],
          })
        )
      })

      it("should ignore products outside the cart's categories", async () => {
        const outsider = await createProduct("outsider", {
          categoryIds: [otherCategory.id],
        })
        const uncategorized = await createProduct("uncategorized", {
          categoryIds: [],
        })
        const inCategory = await createProduct("in-category")

        await createOrder(outsider, 10)
        await createOrder(uncategorized, 10)
        await createOrder(inCategory, 1)

        const cart = await createCart()
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct.id).toEqual(inCategory.id)
      })

      it("should suggest the best seller across all of the cart's categories", async () => {
        const otherAnchor = await createProduct("other-anchor", {
          categoryIds: [otherCategory.id],
        })
        const shirt = await createProduct("shirt")
        const shoe = await createProduct("shoe", {
          categoryIds: [otherCategory.id],
        })

        await createOrder(shirt, 2)
        await createOrder(shoe, 5)

        const cart = await createCart([
          anchor.variants[0].id,
          otherAnchor.variants[0].id,
        ])
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct.id).toEqual(shoe.id)
      })

      it("should break ties between equal sellers by product ID", async () => {
        const first = await createProduct("first")
        const second = await createProduct("second")

        await createOrder(first, 3)
        await createOrder(second, 3)

        const cart = await createCart()
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct.id).toEqual(
          [first.id, second.id].sort((a, b) => a.localeCompare(b))[0]
        )
      })

      it("should return a variant that can be added to the cart", async () => {
        const bestSeller = await createProduct("best-seller")
        await createOrder(bestSeller, 1)

        const cart = await createCart()
        const suggestedProduct = await getSuggestedProduct(cart.id)

        const response = await api.post(
          `/store/carts/${cart.id}/line-items`,
          { variant_id: suggestedProduct.variants[0].id, quantity: 1 },
          storeHeaders
        )

        expect(response.status).toEqual(200)
        expect(response.data.cart.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ product_id: bestSeller.id }),
          ])
        )
      })

      it("should price variants with the same context as the cart", async () => {
        const bestSeller = await createProduct("best-seller")
        await createOrder(bestSeller, 1)

        // Only applies in the cart's sales channel, which is part of the
        // cart's pricing context but not the region and currency alone
        await api.post(
          `/admin/price-lists`,
          {
            title: "Webshop prices",
            description: "Prices for the webshop sales channel",
            status: PriceListStatus.ACTIVE,
            type: PriceListType.OVERRIDE,
            prices: [
              {
                amount: 900,
                currency_code: "usd",
                variant_id: bestSeller.variants[0].id,
              },
            ],
            rules: { sales_channel_id: [salesChannel.id] },
          },
          adminHeaders
        )

        const cart = await createCart()
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(
          suggestedProduct.variants[0].calculated_price.calculated_amount
        ).toEqual(900)

        const response = await api.post(
          `/store/carts/${cart.id}/line-items`,
          { variant_id: suggestedProduct.variants[0].id, quantity: 1 },
          storeHeaders
        )

        const addedItem = response.data.cart.items.find(
          (item) => item.product_id === bestSeller.id
        )

        expect(addedItem.unit_price).toEqual(
          suggestedProduct.variants[0].calculated_price.calculated_amount
        )
      })

      it("should exclude products already in the cart", async () => {
        // Created first, so the fallback would pick it if ranking were ignored
        await createProduct("never-sold")
        const bestSeller = await createProduct("best-seller")
        const runnerUp = await createProduct("runner-up")

        await createOrder(anchor, 10)
        await createOrder(bestSeller, 5)
        await createOrder(runnerUp, 1)

        const cart = await createCart([
          anchor.variants[0].id,
          bestSeller.variants[0].id,
        ])
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct.id).toEqual(runnerUp.id)
      })

      it("should skip out-of-stock products", async () => {
        // Created first, so the fallback would pick it if ranking were ignored
        await createProduct("never-sold")
        const outOfStock = await createProduct("out-of-stock", {
          stockedQuantity: 0,
        })
        const inStock = await createProduct("in-stock")

        await createOrder(outOfStock, 5)
        await createOrder(inStock, 1)

        const cart = await createCart()
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct.id).toEqual(inStock.id)
      })

      it("should skip products without a price in the cart's currency", async () => {
        // Created first, so the fallback would pick it if ranking were ignored
        await createProduct("never-sold")
        const unpriced = await createProduct("unpriced", {
          currencyCode: "eur",
        })
        const priced = await createProduct("priced")

        await createOrder(unpriced, 5)
        await createOrder(priced, 1)

        const cart = await createCart()
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct.id).toEqual(priced.id)
      })

      it("should skip products that aren't published", async () => {
        // Created first, so the fallback would pick it if ranking were ignored
        await createProduct("never-sold")
        const draft = await createProduct("draft", {
          status: ProductStatus.DRAFT,
        })
        const published = await createProduct("published")

        await createOrder(draft, 5)
        await createOrder(published, 1)

        const cart = await createCart()
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct.id).toEqual(published.id)
      })

      it("should suggest a product the cart can be shipped and checked out with", async () => {
        const bestSeller = await createProduct("best-seller")
        await createOrder(bestSeller, 1)

        const cart = await createCart([anchor.variants[0].id], {
          countryCode: "us",
        })
        const suggestedProduct = await getSuggestedProduct(cart.id)

        await api.post(
          `/store/carts/${cart.id}/line-items`,
          { variant_id: suggestedProduct.variants[0].id, quantity: 1 },
          storeHeaders
        )

        const shippingOptions = (
          await api.get(
            `/store/shipping-options?cart_id=${cart.id}`,
            storeHeaders
          )
        ).data.shipping_options

        expect(shippingOptions).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              shipping_profile_id: shippingProfile.id,
              amount: 1000,
            }),
          ])
        )
      })

      it("should skip products whose shipping profile has no shipping option", async () => {
        const unshippableProfile = (
          await api.post(
            `/admin/shipping-profiles`,
            { name: "unshippable", type: "unshippable" },
            adminHeaders
          )
        ).data.shipping_profile
        const unshippable = await createProduct("unshippable", {
          shippingProfileId: unshippableProfile.id,
        })
        const shippable = await createProduct("shippable")

        await createOrder(unshippable, 5)
        await createOrder(shippable, 1)

        const cart = await createCart()
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct.id).toEqual(shippable.id)
      })

      it("should skip products that can't be shipped to the cart's region", async () => {
        const overseasProfile = await createShippingProfile("overseas", {
          countryCode: "de",
        })
        const overseas = await createProduct("overseas", {
          shippingProfileId: overseasProfile.id,
        })
        const domestic = await createProduct("domestic")

        await createOrder(overseas, 5)
        await createOrder(domestic, 1)

        const cart = await createCart()
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct.id).toEqual(domestic.id)
      })

      it("should skip products that can't be shipped to the cart's shipping address", async () => {
        const canadaProfile = await createShippingProfile("canada", {
          countryCode: "ca",
        })
        const canadaOnly = await createProduct("canada-only", {
          shippingProfileId: canadaProfile.id,
        })
        const domestic = await createProduct("domestic")

        await createOrder(canadaOnly, 5)
        await createOrder(domestic, 1)

        // Canada is in the region, so it's suggested until the cart has an
        // address outside of it
        const cartWithoutAddress = await createCart()
        expect((await getSuggestedProduct(cartWithoutAddress.id)).id).toEqual(
          canadaOnly.id
        )

        const usCart = await createCart([anchor.variants[0].id], {
          countryCode: "us",
        })
        expect((await getSuggestedProduct(usCart.id)).id).toEqual(domestic.id)
      })

      it("should match delivery zones regardless of the country code's case", async () => {
        const upperCaseProfile = await createShippingProfile("upper-case", {
          countryCode: "US",
        })
        const upperCaseZone = await createProduct("upper-case-zone", {
          shippingProfileId: upperCaseProfile.id,
        })
        await createOrder(upperCaseZone, 5)

        const cart = await createCart()
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct.id).toEqual(upperCaseZone.id)
      })

      it("should skip products whose shipping options have no price in the cart's currency", async () => {
        const euroProfile = await createShippingProfile("euro", {
          currencyCode: "eur",
        })
        const euroShipping = await createProduct("euro-shipping", {
          shippingProfileId: euroProfile.id,
        })
        const usdShipping = await createProduct("usd-shipping")

        await createOrder(euroShipping, 5)
        await createOrder(usdShipping, 1)

        const cart = await createCart()
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct.id).toEqual(usdShipping.id)
      })

      it("should skip products whose shipping options aren't enabled in the store", async () => {
        const adminOnlyProfile = await createShippingProfile("admin-only", {
          enabledInStore: false,
        })
        const adminOnly = await createProduct("admin-only", {
          shippingProfileId: adminOnlyProfile.id,
        })
        const storeShipping = await createProduct("store-shipping")

        await createOrder(adminOnly, 5)
        await createOrder(storeShipping, 1)

        const cart = await createCart()
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct.id).toEqual(storeShipping.id)
      })

      it("should skip products only shipped from locations outside the cart's sales channel", async () => {
        const otherLocation = (
          await api.post(
            `/admin/stock-locations`,
            { name: "Other warehouse" },
            adminHeaders
          )
        ).data.stock_location
        await api.post(
          `/admin/stock-locations/${otherLocation.id}/fulfillment-providers`,
          { add: ["manual_test-provider"] },
          adminHeaders
        )
        const elsewhereProfile = await createShippingProfile("elsewhere", {
          locationId: otherLocation.id,
        })
        const shippedElsewhere = await createProduct("shipped-elsewhere", {
          shippingProfileId: elsewhereProfile.id,
        })
        const shippedHere = await createProduct("shipped-here")

        await createOrder(shippedElsewhere, 5)
        await createOrder(shippedHere, 1)

        const cart = await createCart()
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct.id).toEqual(shippedHere.id)
      })

      it("should only count sales and products in the cart's sales channel", async () => {
        const otherChannelProduct = await createProduct("other-channel", {
          salesChannelId: otherSalesChannel.id,
        })
        const soldElsewhere = await createProduct("sold-elsewhere")
        const soldHere = await createProduct("sold-here")

        await createOrder(otherChannelProduct, 10)
        await createOrder(soldElsewhere, 10, {
          salesChannelId: otherSalesChannel.id,
        })
        await createOrder(soldHere, 1)

        const cart = await createCart()
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct.id).toEqual(soldHere.id)
      })

      it("should not count canceled orders", async () => {
        const canceled = await createProduct("canceled")
        const sold = await createProduct("sold")

        await createOrder(canceled, 10, { status: OrderStatus.CANCELED })
        await createOrder(sold, 1)

        const cart = await createCart()
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct.id).toEqual(sold.id)
      })

      it("should suggest the first eligible product in the category when none has been sold", async () => {
        await createProduct("outsider", { categoryIds: [otherCategory.id] })
        const first = await createProduct("first")
        await createProduct("second")

        const cart = await createCart()
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct).toEqual(
          expect.objectContaining({
            id: first.id,
            variants: [
              expect.objectContaining({
                id: first.variants[0].id,
                calculated_price: expect.objectContaining({
                  calculated_amount: 1500,
                }),
              }),
            ],
          })
        )
      })

      it("should fall back to the first eligible product in the category when no best-seller is eligible", async () => {
        const bestSeller = await createProduct("best-seller")
        const neverSold = await createProduct("never-sold")

        await createOrder(bestSeller, 5)

        const cart = await createCart([
          anchor.variants[0].id,
          bestSeller.variants[0].id,
        ])
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct.id).toEqual(neverSold.id)
      })

      it("should skip ineligible products when falling back", async () => {
        await createProduct("out-of-stock", { stockedQuantity: 0 })
        await createProduct("unpriced", { currencyCode: "eur" })
        await createProduct("draft", { status: ProductStatus.DRAFT })
        await createProduct("other-channel", {
          salesChannelId: otherSalesChannel.id,
        })
        const eligible = await createProduct("eligible")

        const cart = await createCart()
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct.id).toEqual(eligible.id)
      })

      it("should only use the categories assigned directly to the cart's products", async () => {
        const subcategory = await createCategory("T-Shirts", {
          parentCategoryId: category.id,
        })
        const inSubcategory = await createProduct("in-subcategory", {
          categoryIds: [subcategory.id],
        })
        await createOrder(inSubcategory, 5)

        const cart = await createCart()
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct).toBeNull()
      })

      it("should skip inactive categories", async () => {
        const inactiveCategory = await createCategory("Hidden", {
          isActive: false,
        })
        const inactiveAnchor = await createProduct("inactive-anchor", {
          categoryIds: [inactiveCategory.id],
        })
        await createProduct("inactive-sibling", {
          categoryIds: [inactiveCategory.id],
        })

        const cart = await createCart([inactiveAnchor.variants[0].id])
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct).toBeNull()
      })

      it("should skip internal categories", async () => {
        const internalCategory = await createCategory("Clearance", {
          isInternal: true,
        })
        const internalAnchor = await createProduct("internal-anchor", {
          categoryIds: [internalCategory.id, category.id],
        })
        const internalSibling = await createProduct("internal-sibling", {
          categoryIds: [internalCategory.id],
        })
        const sibling = await createProduct("sibling")

        await createOrder(internalSibling, 10)
        await createOrder(sibling, 1)

        const cart = await createCart([internalAnchor.variants[0].id])
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct.id).toEqual(sibling.id)
      })

      it("should return null when every product in the category is already in the cart", async () => {
        // Not in the cart's category, so it must not be suggested
        await createProduct("outsider", { categoryIds: [otherCategory.id] })
        await createOrder(anchor, 1)

        const cart = await createCart()
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct).toBeNull()
      })

      it("should return null when no product in the category is eligible", async () => {
        await createProduct("out-of-stock", { stockedQuantity: 0 })

        const cart = await createCart()
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct).toBeNull()
      })

      it("should return null when the cart's products have no category", async () => {
        const uncategorized = await createProduct("uncategorized", {
          categoryIds: [],
        })
        await createProduct("sibling")

        const cart = await createCart([uncategorized.variants[0].id])
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct).toBeNull()
      })

      it("should return null when the cart is empty", async () => {
        const bestSeller = await createProduct("best-seller")
        await createOrder(bestSeller, 1)

        const cart = await createCart([])
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct).toBeNull()
      })

      it("should return the requested fields", async () => {
        const bestSeller = await createProduct("best-seller")
        await createOrder(bestSeller, 1)

        const cart = await createCart()
        const response = await api.get(
          `/store/carts/${cart.id}/suggested-product?fields=id,title`,
          storeHeaders
        )

        expect(response.status).toEqual(200)
        expect(response.data.suggested_product.title).toEqual("best-seller")
        expect(response.data.suggested_product.handle).toBeUndefined()
      })

      it("should only return the shipping fields used for eligibility when requested", async () => {
        const bestSeller = await createProduct("best-seller")
        await createOrder(bestSeller, 1)

        const cart = await createCart()
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct.shipping_profile).toBeUndefined()
        expect(suggestedProduct.variants[0].inventory_items).toBeUndefined()

        const response = await api.get(
          `/store/carts/${cart.id}/suggested-product?fields=id,shipping_profile.id,variants.inventory_items.inventory_item_id`,
          storeHeaders
        )

        expect(response.data.suggested_product.shipping_profile).toEqual(
          expect.objectContaining({ id: shippingProfile.id })
        )
        expect(
          response.data.suggested_product.variants[0].inventory_items
        ).toEqual([
          expect.objectContaining({ inventory_item_id: expect.any(String) }),
        ])
      })

      it("should return 404 when the cart doesn't exist", async () => {
        const error = await api
          .get(
            `/store/carts/cart_does_not_exist/suggested-product`,
            storeHeaders
          )
          .catch((e) => e)

        expect(error.response.status).toEqual(404)
      })
    })
  },
})
