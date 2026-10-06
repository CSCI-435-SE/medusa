import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { SubscriptionDTO } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export const SUBSCRIPTION_FIELDS = [
  "id",
  "customer_id",
  "variant_id",
  "quantity",
  "interval",
  "status",
  "next_billing_at",
  "canceled_at",
  "failed_at",
  "failure_reason",
  "created_at",
  "updated_at",
]

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<{ subscriptions: Partial<SubscriptionDTO>[] }>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: subscriptions } = await query.graph({
    entity: "subscription",
    filters: { customer_id: req.auth_context.actor_id },
    fields: SUBSCRIPTION_FIELDS,
  })

  res.json({ subscriptions })
}
