import {
  WorkflowData,
  WorkflowResponse,
  createWorkflow,
} from "@medusajs/framework/workflows-sdk"
import { validateInventoryImportStep } from "../steps/validate-inventory-import"
import { createInventoryItemsWorkflow } from "./create-inventory-items"

/**
 * The data to import inventory items from a CSV file.
 */
export type ImportInventoryItemsWorkflowInput = {
  /**
   * The content of the CSV file, with the columns of the inventory import
   * template: Title, SKU, Requires Shipping, Stocked Quantity, Location,
   * Description, Width, Length, Height, Weight, MID Code, HS Code,
   * Country of Origin and Material.
   */
  file_content: string
}

export const importInventoryItemsWorkflowId = "import-inventory-items"
/**
 * This workflow imports inventory items from a CSV file. It checks every row
 * first and creates no inventory items if any row is invalid. Otherwise it
 * creates all of them, with their stock at each row's location, with a single
 * run of {@link createInventoryItemsWorkflow}.
 *
 * @example
 * const { result } = await importInventoryItemsWorkflow(container)
 * .run({
 *   input: {
 *     file_content: "Title,SKU,Requires Shipping,Stocked Quantity,Location\nMug,MUG-1,true,10,Main Warehouse",
 *   }
 * })
 *
 * @summary
 *
 * Import inventory items from a CSV file.
 */
export const importInventoryItemsWorkflow = createWorkflow(
  importInventoryItemsWorkflowId,
  (input: WorkflowData<ImportInventoryItemsWorkflowInput>) => {
    const items = validateInventoryImportStep(input)

    const inventoryItems = createInventoryItemsWorkflow.runAsStep({
      input: { items },
    })

    return new WorkflowResponse(inventoryItems)
  }
)
