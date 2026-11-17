import { createBundleWorkflow } from "@medusajs/core-flows"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
  refetchEntity,
} from "@medusajs/framework/http"
import { HttpTypes } from "@medusajs/framework/types"
import {
  remapKeysForProduct,
  remapProductResponse,
} from "../products/helpers"
import { AdminCreateBundleType } from "./validators"

/**
 * POST /admin/bundles
 * Creates a bundle: a product with its own prices that is made of several
 * component variants.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<
    AdminCreateBundleType,
    HttpTypes.SelectParams
  >,
  res: MedusaResponse<HttpTypes.AdminProductResponse>
) => {
  // The body was already validated by the middleware (shape, min 2 components,
  // quantities, prices). The workflow validates against the database.
  const { result } = await createBundleWorkflow(req.scope).run({
    input: { bundle: req.validatedBody as any },
  })

  // Read the product back with the fields the caller asked for.
  const product = await refetchEntity({
    entity: "product",
    idOrFilter: result.id,
    scope: req.scope,
    fields: remapKeysForProduct(req.queryConfig.fields ?? []),
  })

  res.status(200).json({ product: remapProductResponse(product) })
}
