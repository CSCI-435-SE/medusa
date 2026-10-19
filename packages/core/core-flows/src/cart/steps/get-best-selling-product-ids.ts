import { BigNumberInput } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MathBN,
  OrderStatus,
} from "@medusajs/framework/utils"
import { StepResponse, createStep } from "@medusajs/framework/workflows-sdk"

/**
 * The details of the best-selling products to retrieve.
 */
export interface GetBestSellingProductIdsStepInput {
  /**
   * The ID of the sales channel to rank sales in. Only orders placed in this
   * sales channel are counted. If not set, no products are returned.
   */
  sales_channel_id?: string | null
  /**
   * The IDs of products to leave out of the ranking, such as products
   * already in a cart.
   */
  exclude_product_ids?: string[]
  /**
   * The IDs of the only products to rank, such as the products in a cart's
   * categories. If not set, all products are ranked.
   */
  include_product_ids?: string[]
  /**
   * The number of most recent orders to count sales from.
   *
   * @defaultValue 1000
   */
  order_limit?: number
  /**
   * The maximum number of product IDs to return.
   *
   * @defaultValue 50
   */
  limit?: number
}

const DEFAULT_ORDER_LIMIT = 1000
const DEFAULT_LIMIT = 50

export const getBestSellingProductIdsStepId = "get-best-selling-product-ids"
/**
 * This step ranks products by the total quantity sold across the most recent
 * orders in a sales channel, and returns their IDs from best to least selling.
 * The ranking can be limited to specific products, such as the products in a
 * cart's categories. Canceled and draft orders aren't counted. Products with the same quantity
 * sold are ordered by their ID, so the ranking is deterministic.
 *
 * @example
 * const productIds = getBestSellingProductIdsStep({
 *   sales_channel_id: "sc_123",
 *   exclude_product_ids: ["prod_123"],
 * })
 */
export const getBestSellingProductIdsStep = createStep(
  getBestSellingProductIdsStepId,
  async (data: GetBestSellingProductIdsStepInput, { container }) => {
    if (!data.sales_channel_id || data.include_product_ids?.length === 0) {
      return new StepResponse([] as string[])
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "items.product_id", "items.quantity"],
      filters: {
        sales_channel_id: data.sales_channel_id,
        is_draft_order: false,
        status: { $nin: [OrderStatus.CANCELED, OrderStatus.DRAFT] },
      },
      pagination: {
        take: data.order_limit ?? DEFAULT_ORDER_LIMIT,
        order: { created_at: "DESC" },
      },
    })

    const excludedIds = new Set(data.exclude_product_ids ?? [])
    const includedIds = data.include_product_ids
      ? new Set(data.include_product_ids)
      : null
    const quantitySold = new Map<string, BigNumberInput>()

    for (const order of orders) {
      for (const item of order.items ?? []) {
        if (
          !item?.product_id ||
          excludedIds.has(item.product_id) ||
          (includedIds && !includedIds.has(item.product_id))
        ) {
          continue
        }

        quantitySold.set(
          item.product_id,
          MathBN.add(quantitySold.get(item.product_id) ?? 0, item.quantity)
        )
      }
    }

    const productIds = [...quantitySold.entries()]
      .sort(([idA, quantityA], [idB, quantityB]) => {
        if (MathBN.eq(quantityA, quantityB)) {
          return idA.localeCompare(idB)
        }

        return MathBN.gt(quantityA, quantityB) ? -1 : 1
      })
      .slice(0, data.limit ?? DEFAULT_LIMIT)
      .map(([productId]) => productId)

    return new StepResponse(productIds)
  }
)
