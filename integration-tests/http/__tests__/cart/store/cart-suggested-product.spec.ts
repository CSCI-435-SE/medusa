import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules, OrderStatus, ProductStatus } from "@medusajs/utils"
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

      const createProduct = async (
        title: string,
        {
          stockedQuantity = 10,
          currencyCode = "usd",
          salesChannelId = salesChannel.id,
          status = ProductStatus.PUBLISHED,
        }: {
          stockedQuantity?: number
          currencyCode?: string
          salesChannelId?: string
          status?: ProductStatus
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
              shipping_profile_id: shippingProfile.id,
              sales_channels: [{ id: salesChannelId }],
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

      const createCart = async (variantIds: string[] = []) => {
        const cart = (
          await api.post(
            `/store/carts`,
            {
              region_id: region.id,
              sales_channel_id: salesChannel.id,
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

        shippingProfile = (
          await api.post(
            `/admin/shipping-profiles`,
            { name: "default", type: "default" },
            adminHeaders
          )
        ).data.shipping_profile

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
      })

      it("should return the best-selling product with its variants and prices", async () => {
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
        expect(response.data.cart.items).toEqual([
          expect.objectContaining({ product_id: bestSeller.id }),
        ])
      })

      it("should exclude products already in the cart", async () => {
        // Created first, so the fallback would pick it if ranking were ignored
        await createProduct("never-sold")
        const bestSeller = await createProduct("best-seller")
        const runnerUp = await createProduct("runner-up")

        await createOrder(bestSeller, 5)
        await createOrder(runnerUp, 1)

        const cart = await createCart([bestSeller.variants[0].id])
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

      it("should suggest the first eligible product when no product has been sold", async () => {
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

      it("should fall back to the first eligible product when no best-seller is eligible", async () => {
        const bestSeller = await createProduct("best-seller")
        const neverSold = await createProduct("never-sold")

        await createOrder(bestSeller, 5)

        const cart = await createCart([bestSeller.variants[0].id])
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

      it("should return null when the only product is already in the cart", async () => {
        const product = await createProduct("only-product")
        await createOrder(product, 1)

        const cart = await createCart([product.variants[0].id])
        const suggestedProduct = await getSuggestedProduct(cart.id)

        expect(suggestedProduct).toBeNull()
      })

      it("should return null when the catalog has no eligible product", async () => {
        await createProduct("out-of-stock", { stockedQuantity: 0 })

        const cart = await createCart()
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
