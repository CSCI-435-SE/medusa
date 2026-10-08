import type { CreateCustomerDTO } from "@medusajs/framework/types"
import { MedusaError, validateEmail } from "@medusajs/framework/utils"
import { parse } from "csv-parse/sync"

/**
 * A customer row read from an import CSV, numbered like a spreadsheet row
 * (the header is row 1).
 */
export type CustomerImportRow = {
  rowNumber: number
  email: string
  first_name: string
  last_name: string
  company_name: string
  phone: string
}

const OPTIONAL_FIELDS = [
  "first_name",
  "last_name",
  "company_name",
  "phone",
] as const

/**
 * Parses an import CSV with the columns Email, First Name, Last Name,
 * Company and Phone.
 */
export const parseCustomerImportCsv = (
  fileContent: string
): CustomerImportRow[] => {
  let records: { record: Record<string, string>; info: { lines: number } }[]

  try {
    records = parse(fileContent, {
      columns: true,
      bom: true,
      skip_empty_lines: true,
      trim: true,
      info: true,
    })
  } catch (error) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `The file could not be read as a CSV: ${error.message}`
    )
  }

  return records.map(({ record, info }) => ({
    rowNumber: info.lines,
    email: record["Email"] ?? "",
    first_name: record["First Name"] ?? "",
    last_name: record["Last Name"] ?? "",
    company_name: record["Company"] ?? "",
    phone: record["Phone"] ?? "",
  }))
}

const isValidEmail = (email: string) => {
  try {
    validateEmail(email)
    return true
  } catch {
    return false
  }
}

/**
 * Checks every row and returns the customers to create along with one error
 * per failing row. Emails are compared exactly, both within the file and
 * against `existingEmails`.
 */
export const validateCustomerImport = (
  rows: CustomerImportRow[],
  existingEmails: string[]
): { customers: CreateCustomerDTO[]; errors: string[] } => {
  const existing = new Set(existingEmails)
  const firstRowByEmail = new Map<string, number>()
  const customers: CreateCustomerDTO[] = []
  const errors: string[] = []

  for (const row of rows) {
    const { rowNumber, email } = row

    if (!email) {
      errors.push(`Row ${rowNumber}: Email is required`)
      continue
    }

    if (!isValidEmail(email)) {
      errors.push(`Row ${rowNumber}: "${email}" is not a valid email`)
      continue
    }

    const firstRow = firstRowByEmail.get(email)
    if (firstRow) {
      errors.push(
        `Row ${rowNumber}: ${email} is also used on row ${firstRow} of this file`
      )
      continue
    }
    firstRowByEmail.set(email, rowNumber)

    if (existing.has(email)) {
      errors.push(
        `Row ${rowNumber}: A customer with the email ${email} already exists`
      )
      continue
    }

    const customer: CreateCustomerDTO = { email }
    for (const field of OPTIONAL_FIELDS) {
      if (row[field]) {
        customer[field] = row[field]
      }
    }
    customers.push(customer)
  }

  return { customers, errors }
}
