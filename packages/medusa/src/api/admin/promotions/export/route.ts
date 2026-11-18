import { exportPromotionsWorkflow } from "@medusajs/core-flows"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { FilterablePromotionProps, HttpTypes } from "@medusajs/framework/types"

export const POST = async (
  req: AuthenticatedMedusaRequest<{}, HttpTypes.AdminGetPromotionsParams>,
  res: MedusaResponse<HttpTypes.AdminExportPromotionsResponse>
) => {
  const selectFields = req.queryConfig.fields ?? []
  // filterableFields doesn't include limit and offset, so every promotion
  // matching the filters is exported, not only the current page.
  const input = {
    select: selectFields,
    filter: req.filterableFields as FilterablePromotionProps,
  }

  const { transaction } = await exportPromotionsWorkflow(req.scope).run({
    input,
  })

  res.status(202).json({ transaction_id: transaction.transactionId })
}
