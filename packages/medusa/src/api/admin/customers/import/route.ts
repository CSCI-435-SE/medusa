import { importCustomersWorkflow } from "@medusajs/core-flows"
import { HttpTypes } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.AdminImportCustomersResponse>
) => {
  const input = req.file as Express.Multer.File

  if (!input) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "No file was uploaded for importing"
    )
  }

  const { result } = await importCustomersWorkflow(req.scope).run({
    input: {
      file_content: input.buffer.toString("utf-8"),
      created_by: req.auth_context.actor_id,
    },
  })

  res.status(200).json({ created: result.length })
}
