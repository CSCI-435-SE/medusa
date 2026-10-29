import { duplicateProductWorkflow } from "@medusajs/core-flows"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
  refetchEntity,
} from "@medusajs/framework/http"
import { AdditionalData, HttpTypes } from "@medusajs/framework/types"
import { remapKeysForProduct, remapProductResponse } from "../../helpers"

export const POST = async (
  req: AuthenticatedMedusaRequest<
    HttpTypes.AdminDuplicateProduct & AdditionalData,
    HttpTypes.SelectParams
  >,
  res: MedusaResponse<HttpTypes.AdminProductResponse>
) => {
  const { title, handle, additional_data } = req.validatedBody

  // The workflow validates the source product, the new title and the handle
  // before creating anything, and throws a MedusaError otherwise.
  const { result } = await duplicateProductWorkflow(req.scope).run({
    input: { id: req.params.id, title, handle, additional_data },
  })

  const product = await refetchEntity({
    entity: "product",
    idOrFilter: result[0].id,
    scope: req.scope,
    fields: remapKeysForProduct(req.queryConfig.fields ?? []),
  })

  res.status(200).json({ product: remapProductResponse(product) })
}
