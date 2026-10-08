import type {
  CreateCustomerDTO,
  ICustomerModuleService,
} from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { StepResponse, createStep } from "@medusajs/framework/workflows-sdk"
import {
  parseCustomerImportCsv,
  validateCustomerImport,
} from "../helpers/import-customers"

/**
 * The data to validate a customer import.
 */
export type ValidateCustomerImportStepInput = {
  /**
   * The content of the CSV file to import.
   */
  file_content: string
  /**
   * The ID of the user importing the customers.
   */
  created_by?: string
}

export const validateCustomerImportStepId = "validate-customer-import"
/**
 * This step parses a customer import CSV and checks every row. It throws a
 * single error listing each failing row if any row is invalid, otherwise it
 * returns the customers to create.
 *
 * An email counts as already existing when a customer without an account
 * has it. Registered customers with the same email don't conflict.
 */
export const validateCustomerImportStep = createStep(
  validateCustomerImportStepId,
  async (input: ValidateCustomerImportStepInput, { container }) => {
    const rows = parseCustomerImportCsv(input.file_content)
    const emails = [...new Set(rows.map((row) => row.email).filter(Boolean))]

    const customerModule = container.resolve<ICustomerModuleService>(
      Modules.CUSTOMER
    )
    const existingCustomers = emails.length
      ? await customerModule.listCustomers(
          { email: emails, has_account: false },
          { select: ["email"] }
        )
      : []

    const { customers, errors } = validateCustomerImport(
      rows,
      existingCustomers.map((customer) => customer.email!)
    )

    if (errors.length) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, errors.join("\n"))
    }

    return new StepResponse(
      customers.map(
        (customer): CreateCustomerDTO => ({
          ...customer,
          created_by: input.created_by,
        })
      )
    )
  }
)
