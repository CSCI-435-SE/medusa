import {
  createWorkflow,
  transform,
  WorkflowData,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { useQueryGraphStep } from "../../common"
import { getBestSellingProductIdsStep } from "../steps/get-best-selling-product-ids"
import { selectSuggestedProductStep } from "../steps/select-suggested-product"

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
  "id",
  "sales_channel_id",
  "region_id",
  "currency_code",
  "customer.groups.id",
  "items.product_id",
]

export const getSuggestedProductForCartWorkflowId =
  "get-suggested-product-for-cart"
/**
 * This workflow returns a single product to suggest for a cart, such as an
 * upsell during checkout. It's used by the
 * [Get Suggested Product Store API Route](https://docs.medusajs.com/api/store#carts_getcartsidsuggestedproduct).
 *
 * A product is eligible if it:
 *
 * - isn't already in the cart.
 * - is published and available in the cart's sales channel.
 * - has at least one variant that's in stock and priced in the cart's currency.
 *
 * The suggested product is the best-selling eligible product in the cart's sales
 * channel, based on the quantity sold across its most recent orders. If no
 * best-selling product is eligible, such as when the store has no sales yet, the
 * first eligible product in the catalog is suggested instead, ordered by creation
 * date.
 *
 * The product is returned with only the variants that can be added to the cart,
 * along with their calculated prices. If no product in the catalog is eligible,
 * the workflow returns `null`.
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
 * Get a suggested product for a cart.
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

    const rankingInput = transform(
      { cart, cartProductIds },
      ({ cart, cartProductIds }) => ({
        sales_channel_id: cart.sales_channel_id,
        exclude_product_ids: cartProductIds,
      })
    )

    const productIds = getBestSellingProductIdsStep(rankingInput)

    const product = selectSuggestedProductStep({
      product_ids: productIds,
      exclude_product_ids: cartProductIds,
      cart,
      fields: input.fields,
    })

    return new WorkflowResponse(product)
  }
)
