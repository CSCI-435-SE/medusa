import { endSubscriptionWorkflow } from "@medusajs/core-flows"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { SubscriptionDTO } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  SubscriptionStatus,
} from "@medusajs/framework/utils"
import { SUBSCRIPTION_FIELDS } from "../../route"

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<{ subscription: Partial<SubscriptionDTO> }>
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
    fields: SUBSCRIPTION_FIELDS,
  })

  res.status(200).json({ subscription })
}
