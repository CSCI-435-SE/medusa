import {
  CustomerDTO,
  FilterableCustomerProps,
  IFileModuleService,
} from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  deduplicate,
} from "@medusajs/framework/utils"
import { StepResponse, createStep } from "@medusajs/framework/workflows-sdk"
import { json2csv } from "json-2-csv"

/**
 * The data to export customers.
 */
export type ExportCustomersStepInput = {
  /**
   * The number of customers to retrieve per batch.
   */
  batch_size?: number | string
  /**
   * The fields to select.
   */
  select: string[]
  /**
   * The filters to select which customers to export.
   */
  filter?: FilterableCustomerProps
}

/**
 * The details of the exported file.
 */
export type ExportCustomersStepOutput = {
  /**
   * The ID of the file.
   */
  id: string
  /**
   * The name of the file.
   */
  filename: string
}

export const exportCustomersStepId = "export-customers"

// The first five columns match the customer import CSV, so an exported file
// can be imported again.
const EXPORT_COLUMNS = [
  "Email",
  "First Name",
  "Last Name",
  "Company",
  "Phone",
  "Customer ID",
  "Has Account",
  "Created At",
]

const normalizeCustomerForExport = (customer: CustomerDTO): object => {
  return {
    Email: customer.email || "",
    "First Name": customer.first_name || "",
    "Last Name": customer.last_name || "",
    Company: customer.company_name || "",
    Phone: customer.phone || "",
    "Customer ID": customer.id,
    "Has Account": customer.has_account,
    "Created At": customer.created_at,
  }
}

/**
 * This step exports the customers matching the filters to a CSV file and
 * uploads it with the File Module. It retrieves the customers in batches, so
 * any pagination in the filters is ignored. The file always has a header row,
 * even when no customers match.
 */
export const exportCustomersStep = createStep(
  exportCustomersStepId,
  async (input: ExportCustomersStepInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const fileModule = container.resolve(Modules.FILE)

    const filename = `${Date.now()}-customer-exports.csv`
    const { writeStream, promise, fileKey } = await fileModule.getUploadStream({
      filename,
      mimeType: "text/csv",
    })

    const pageSize = !isNaN(parseInt(input?.batch_size as string))
      ? parseInt(input?.batch_size as string, 10)
      : 50

    let lastId: string | undefined
    let hasHeader = false

    const fields = deduplicate([
      ...input.select,
      "id",
      "email",
      "first_name",
      "last_name",
      "company_name",
      "phone",
      "has_account",
      "created_at",
    ])

    const filter = input.filter ?? {}

    while (true) {
      // Page with an id cursor instead of an offset, so customers sharing a
      // created_at, or added and deleted during the export, aren't skipped or
      // repeated. The cursor goes in $and so it can't replace an id filter.
      const { data: customers } = await query.graph({
        entity: "customer",
        filters: lastId
          ? {
              ...filter,
              $and: [...(filter.$and ?? []), { id: { $gt: lastId } }],
            }
          : filter,
        pagination: {
          take: pageSize,
          order: { id: "ASC" },
        },
        fields,
      })

      if (customers.length === 0) {
        break
      }

      const batchCsv = json2csv(
        customers.map((customer) =>
          normalizeCustomerForExport(customer as CustomerDTO)
        ),
        {
          keys: EXPORT_COLUMNS,
          prependHeader: !hasHeader,
          preventCsvInjection: true,
          emptyFieldValue: "",
        }
      )

      const ok = writeStream.write((hasHeader ? "\n" : "") + batchCsv)
      if (!ok) {
        await new Promise((resolve) => writeStream.once("drain", resolve))
      }

      hasHeader = true
      lastId = customers[customers.length - 1].id

      if (customers.length < pageSize) {
        break
      }
    }

    if (!hasHeader) {
      writeStream.write(EXPORT_COLUMNS.join(","))
    }

    writeStream.end()

    await promise

    return new StepResponse(
      { id: fileKey, filename } as ExportCustomersStepOutput,
      fileKey
    )
  },
  async (fileId, { container }) => {
    if (!fileId) {
      return
    }

    const fileModule: IFileModuleService = container.resolve(Modules.FILE)
    await fileModule.deleteFiles(fileId)
  }
)
