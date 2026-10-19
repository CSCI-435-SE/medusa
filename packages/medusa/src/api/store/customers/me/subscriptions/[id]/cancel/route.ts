import { endSubscriptionWorkflow } from "@medusajs/core-flows"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { HttpTypes } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  SubscriptionStatus,
} from "@medusajs/framework/utils"

export const POST = async (
  req: AuthenticatedMedusaRequest<
    undefined,
    HttpTypes.StoreGetSubscriptionParams
  >,
  res: MedusaResponse<HttpTypes.StoreSubscriptionResponse>
) => {
  await endSubscriptionWorkflow(req.scope).run({
    input: {
      id: req.params.id,
      status: SubscriptionStatus.CANCELED,
      customer_id: req.auth_context.actor_id,
    },
  })

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [subscription],
  } = await query.graph({
    entity: "subscription",
    filters: { id: req.params.id },
    fields: req.queryConfig.fields,
  })

  res.status(200).json({ subscription })
}
