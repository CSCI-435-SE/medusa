import { getSuggestedProductForCartWorkflow } from "@medusajs/core-flows"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { HttpTypes } from "@medusajs/framework/types"

export const GET = async (
  req: MedusaRequest<{}, HttpTypes.StoreGetCartSuggestedProduct>,
  res: MedusaResponse<HttpTypes.StoreCartSuggestedProductResponse>
) => {
  const { result } = await getSuggestedProductForCartWorkflow(req.scope).run({
    input: {
      cart_id: req.params.id,
      fields: req.queryConfig.fields,
    },
  })

  res.json({
    suggested_product: (result ?? null) as HttpTypes.StoreProduct | null,
  })
}
