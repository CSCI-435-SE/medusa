import { createAndCompleteReturnOrderWorkflow } from "@medusajs/core-flows"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { HttpTypes } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

/**
 * @since 2.8.0
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.StoreCreateReturn>,
  res: MedusaResponse<HttpTypes.StoreReturnResponse>
) => {
  const input = req.validatedBody as HttpTypes.StoreCreateReturn

  // Issue #113: only the logged-in customer who owns the order can return a
  // single item of a bundle. Other returns keep working for guests.
  if (input.items.some((item) => item.component_variant_id)) {
    const customerId = req.auth_context?.actor_id
    if (!customerId) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "Log in to return a single item from a bundle."
      )
    }

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [order],
    } = await query.graph({
      entity: "order",
      fields: ["id", "customer_id"],
      filters: { id: input.order_id },
    })

    if (!order || order.customer_id !== customerId) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Order with id: ${input.order_id} was not found`
      )
    }
  }

  const workflow = createAndCompleteReturnOrderWorkflow(req.scope)
  const { result } = await workflow.run({
    input,
  })

  res.status(200).json({ return: result as HttpTypes.StoreReturn })
}
