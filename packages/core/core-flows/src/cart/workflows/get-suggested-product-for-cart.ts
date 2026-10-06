import {
  createWorkflow,
  transform,
  when,
  WorkflowData,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { deduplicate, filterObjectByKeys } from "@medusajs/framework/utils"
import { useQueryGraphStep } from "../../common"
import { getBestSellingProductIdsStep } from "../steps/get-best-selling-product-ids"
import { selectSuggestedProductStep } from "../steps/select-suggested-product"
import { cartFieldsForPricingContext } from "../utils/fields"

/**
 * The details of the cart to get a suggested product for.
 */
export interface GetSuggestedProductForCartWorkflowInput {
  /**
   * The ID of the cart to get a suggested product for.
   */
  cart_id: string
  /**
   * The product fields to retrieve for the suggested product.
   */
  fields: string[]
}

const cartFields = [
  ...cartFieldsForPricingContext,
  "customer_id",
  "region.*",
  "region.countries.iso_2",
  "shipping_address.country_code",
  "shipping_address.province",
  "shipping_address.city",
  "shipping_address.postal_code",
  "items.product_id",
  "items.product.categories.id",
]

export const getSuggestedProductForCartWorkflowId =
  "get-suggested-product-for-cart"
/**
 * This workflow returns a single product to suggest for a cart, such as an
 * upsell during checkout, from the categories of the products already in it.
 * It's used by the
 * [Get Suggested Product Store API Route](https://docs.medusajs.com/api/store#carts_getcartsidsuggestedproduct).
 *
 * Only the categories assigned directly to the cart's products are used, and
 * inactive or internal categories are skipped. When the cart's products are in
 * multiple categories, the products of all of them are considered together.
 *
 * A product is eligible if it:
 *
 * - is in one of the cart's categories.
 * - isn't already in the cart.
 * - is published and available in the cart's sales channel.
 * - has at least one variant that's in stock and priced in the cart's currency.
 * - if it requires shipping, can be shipped to the cart's shipping address, or
 *   to a country in the cart's region if the cart has no shipping address yet.
 *
 * The suggested product is the best-selling eligible product, based on the
 * quantity sold across the most recent orders in the cart's sales channel. If no
 * eligible product has been sold, the first eligible product in the cart's
 * categories is suggested instead, ordered by creation date.
 *
 * The product is returned with only the variants that can be added to the cart,
 * along with their calculated prices. If no product in the cart's categories is
 * eligible, such as when the cart is empty, the workflow returns `null`.
 *
 * @example
 * const { result: product } = await getSuggestedProductForCartWorkflow(container)
 * .run({
 *   input: {
 *     cart_id: "cart_123",
 *     fields: ["id", "title", "*variants"],
 *   }
 * })
 *
 * @summary
 *
 * Get a suggested product for a cart from the cart's categories.
 */
export const getSuggestedProductForCartWorkflow = createWorkflow(
  getSuggestedProductForCartWorkflowId,
  (input: WorkflowData<GetSuggestedProductForCartWorkflowInput>) => {
    const { data: cart } = useQueryGraphStep({
      entity: "cart",
      fields: cartFields,
      filters: { id: input.cart_id },
      options: { throwIfKeyNotFound: true, isList: false },
    }).config({ name: "get-cart" })

    const cartProductIds = transform({ cart }, ({ cart }) => {
      return (cart.items ?? [])
        .map((item) => item?.product_id)
        .filter((id): id is string => !!id)
    })

    const cartCategoryIds = transform({ cart }, ({ cart }) => {
      return deduplicate(
        (cart.items ?? [])
          .flatMap((item) => item?.product?.categories ?? [])
          .map((category) => category?.id)
          .filter((id): id is string => !!id)
      )
    })

    const categories = when(
      "has-cart-categories",
      { cartCategoryIds },
      ({ cartCategoryIds }) => {
        return !!cartCategoryIds.length
      }
    ).then(() => {
      const { data: categories } = useQueryGraphStep({
        entity: "product_category",
        fields: ["id", "products.id"],
        filters: {
          id: cartCategoryIds,
          is_active: true,
          is_internal: false,
        },
      }).config({ name: "get-cart-categories" })

      return categories
    })

    const categoryProductIds = transform(
      { categories, cartProductIds },
      ({ categories, cartProductIds }) => {
        const excludedIds = new Set(cartProductIds)

        return deduplicate(
          (categories ?? [])
            .flatMap((category) => category.products ?? [])
            .map((product) => product?.id)
            .filter((id): id is string => !!id && !excludedIds.has(id))
        )
      }
    )

    const rankingInput = transform(
      { cart, cartProductIds, categoryProductIds },
      ({ cart, cartProductIds, categoryProductIds }) => ({
        sales_channel_id: cart.sales_channel_id,
        exclude_product_ids: cartProductIds,
        include_product_ids: categoryProductIds,
      })
    )

    const productIds = getBestSellingProductIdsStep(rankingInput)

    // Built the same way as when an item is added to the cart, so the
    // suggested prices match what the cart charges for one unit.
    const pricingContext = transform({ cart }, ({ cart }) => {
      return {
        ...filterObjectByKeys(cart, cartFieldsForPricingContext),
        currency_code: cart.currency_code,
        region_id: cart.region_id,
        region: cart.region,
        customer_id: cart.customer_id,
        customer: cart.customer,
        quantity: 1,
      }
    })

    const regionCountryCodes = transform({ cart }, ({ cart }) => {
      return (cart.region?.countries ?? [])
        .map((country) => country?.iso_2)
        .filter((code): code is string => !!code)
    })

    const product = selectSuggestedProductStep({
      product_ids: productIds,
      fallback_product_ids: categoryProductIds,
      exclude_product_ids: cartProductIds,
      sales_channel_id: cart.sales_channel_id,
      pricing_context: pricingContext,
      shipping_address: cart.shipping_address,
      region_country_codes: regionCountryCodes,
      fields: input.fields,
    })

    return new WorkflowResponse(product)
  }
)
