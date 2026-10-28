import { duplicatePromotionWorkflow } from "@medusajs/core-flows"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { AdditionalData, HttpTypes } from "@medusajs/framework/types"
import { refetchPromotion } from "../../helpers"

export const POST = async (
  req: AuthenticatedMedusaRequest<
    HttpTypes.AdminDuplicatePromotion & AdditionalData,
    HttpTypes.AdminGetPromotionParams
  >,
  res: MedusaResponse<HttpTypes.AdminPromotionResponse>
) => {
  const { code, additional_data } = req.validatedBody

  // The workflow checks the original promotion and the new code before
  // creating anything, and throws a MedusaError otherwise.
  const { result } = await duplicatePromotionWorkflow(req.scope).run({
    input: { id: req.params.id, code, additional_data },
  })

  const promotion = await refetchPromotion(
    result[0].id,
    req.scope,
    req.queryConfig.fields
  )

  res.status(200).json({ promotion })
}
