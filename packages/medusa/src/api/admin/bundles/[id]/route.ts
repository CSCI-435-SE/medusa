import { updateBundleWorkflow } from "@medusajs/core-flows"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
  refetchEntity,
} from "@medusajs/framework/http"
import { HttpTypes } from "@medusajs/framework/types"
import {
  remapKeysForProduct,
  remapProductResponse,
} from "../../products/helpers"
import { AdminUpdateBundleType } from "../validators"

/**
 * POST /admin/bundles/:id
 * Updates a bundle's product fields, components, quantities and prices.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<
    AdminUpdateBundleType,
    HttpTypes.SelectParams
  >,
  res: MedusaResponse<HttpTypes.AdminProductResponse>
) => {
  await updateBundleWorkflow(req.scope).run({
    input: { id: req.params.id, update: req.validatedBody as any },
  })

  // Read the product back with the fields the caller asked for.
  const product = await refetchEntity({
    entity: "product",
    idOrFilter: req.params.id,
    scope: req.scope,
    fields: remapKeysForProduct(req.queryConfig.fields ?? []),
  })

  res.status(200).json({ product: remapProductResponse(product) })
}
