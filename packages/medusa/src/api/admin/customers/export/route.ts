import { exportCustomersWorkflow } from "@medusajs/core-flows"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { FilterableCustomerProps, HttpTypes } from "@medusajs/framework/types"

export const POST = async (
  req: AuthenticatedMedusaRequest<{}, HttpTypes.AdminCustomerFilters>,
  res: MedusaResponse<HttpTypes.AdminExportCustomersResponse>
) => {
  const selectFields = req.queryConfig.fields ?? []
  // filterableFields doesn't include limit and offset, so every customer
  // matching the filters is exported, not only the current page.
  const input = {
    select: selectFields,
    filter: req.filterableFields as FilterableCustomerProps,
  }

  const { transaction } = await exportCustomersWorkflow(req.scope).run({
    input,
  })

  res.status(202).json({ transaction_id: transaction.transactionId })
}
