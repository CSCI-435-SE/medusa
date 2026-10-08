import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { HttpTypes } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export const GET = async (
  req: AuthenticatedMedusaRequest<
    undefined,
    HttpTypes.StoreGetSubscriptionsParams
  >,
  res: MedusaResponse<HttpTypes.StoreSubscriptionListResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: subscriptions, metadata } = await query.graph({
    entity: "subscription",
    filters: {
      ...req.filterableFields,
      customer_id: req.auth_context.actor_id,
    },
    fields: req.queryConfig.fields,
    pagination: req.queryConfig.pagination,
  })

  res.json({
    subscriptions,
    count: metadata!.count,
    offset: metadata!.skip,
    limit: metadata!.take,
  })
}
