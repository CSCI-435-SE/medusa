import {
  WorkflowData,
  WorkflowResponse,
  createWorkflow,
} from "@medusajs/framework/workflows-sdk"
import { validateCustomerImportStep } from "../steps/validate-customer-import"
import { createCustomersWorkflow } from "./create-customers"

/**
 * The data to import customers from a CSV file.
 */
export type ImportCustomersWorkflowInput = {
  /**
   * The content of the CSV file, with the columns Email, First Name,
   * Last Name, Company and Phone.
   */
  file_content: string
  /**
   * The ID of the user importing the customers.
   */
  created_by?: string
}

export const importCustomersWorkflowId = "import-customers"
/**
 * This workflow imports customers from a CSV file. It checks every row first
 * and creates no customers if any row is invalid. Otherwise it creates all of
 * them with a single run of {@link createCustomersWorkflow}.
 *
 * @example
 * const { result } = await importCustomersWorkflow(container)
 * .run({
 *   input: {
 *     file_content: "Email,First Name\njane@example.com,Jane",
 *   }
 * })
 *
 * @summary
 *
 * Import customers from a CSV file.
 */
export const importCustomersWorkflow = createWorkflow(
  importCustomersWorkflowId,
  (input: WorkflowData<ImportCustomersWorkflowInput>) => {
    const customersData = validateCustomerImportStep(input)

    const customers = createCustomersWorkflow.runAsStep({
      input: { customersData },
    })

    return new WorkflowResponse(customers)
  }
)
