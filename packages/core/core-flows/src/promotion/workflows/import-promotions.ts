import {
  WorkflowData,
  WorkflowResponse,
  createWorkflow,
} from "@medusajs/framework/workflows-sdk"
import { validatePromotionImportStep } from "../steps/validate-promotion-import"
import { createPromotionsWorkflow } from "./create-promotions"

/**
 * The data to import promotions from a CSV file.
 */
export type ImportPromotionsWorkflowInput = {
  /**
   * The content of the CSV file, with the columns of the promotion import
   * template: Code, Type, Status, Automatic, Tax Inclusive, Usage Limit,
   * Campaign ID, Discount Type, Discount Value, Currency Code, Target,
   * Allocation, Max Quantity, Buy Min Quantity, Apply To Quantity, Rules,
   * Target Rules and Buy Rules.
   */
  file_content: string
}

export const importPromotionsWorkflowId = "import-promotions"
/**
 * This workflow imports promotions from a CSV file. It checks every row first
 * and creates no promotions if any row is invalid. Otherwise it creates all of
 * them with a single run of {@link createPromotionsWorkflow}.
 *
 * @example
 * const { result } = await importPromotionsWorkflow(container)
 * .run({
 *   input: {
 *     file_content: "Code,Type,Discount Type,Discount Value,Target,Allocation\nSAVE10,standard,percentage,10,items,across",
 *   }
 * })
 *
 * @summary
 *
 * Import promotions from a CSV file.
 */
export const importPromotionsWorkflow = createWorkflow(
  importPromotionsWorkflowId,
  (input: WorkflowData<ImportPromotionsWorkflowInput>) => {
    const promotionsData = validatePromotionImportStep(input)

    const promotions = createPromotionsWorkflow.runAsStep({
      input: { promotionsData },
    })

    return new WorkflowResponse(promotions)
  }
)
