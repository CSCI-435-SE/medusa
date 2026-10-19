import type { InventoryTypes } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { parse } from "csv-parse/sync"

/**
 * An inventory item row read from an import CSV, numbered like a spreadsheet
 * row (the header is row 1).
 */
export type InventoryImportRow = {
  rowNumber: number
  title: string
  sku: string
  requires_shipping: string
  stocked_quantity: string
  location: string
  description: string
  width: string
  length: string
  height: string
  weight: string
  mid_code: string
  hs_code: string
  origin_country: string
  material: string
}

/**
 * An inventory item to create, with its stock at the row's location.
 */
export type InventoryImportItem = InventoryTypes.CreateInventoryItemInput & {
  location_levels: { location_id: string; stocked_quantity: number }[]
}

const COLUMNS: Record<Exclude<keyof InventoryImportRow, "rowNumber">, string> =
  {
    title: "Title",
    sku: "SKU",
    requires_shipping: "Requires Shipping",
    stocked_quantity: "Stocked Quantity",
    location: "Location",
    description: "Description",
    width: "Width",
    length: "Length",
    height: "Height",
    weight: "Weight",
    mid_code: "MID Code",
    hs_code: "HS Code",
    origin_country: "Country of Origin",
    material: "Material",
  }

const REQUIRED_FIELDS = [
  "title",
  "sku",
  "requires_shipping",
  "stocked_quantity",
  "location",
] as const

const NUMBER_FIELDS = ["width", "length", "height", "weight"] as const

const TEXT_FIELDS = [
  "description",
  "mid_code",
  "hs_code",
  "origin_country",
  "material",
] as const

/**
 * Parses an import CSV with the columns of the inventory import template.
 */
export const parseInventoryImportCsv = (
  fileContent: string
): InventoryImportRow[] => {
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

  return records.map(({ record, info }) => {
    const row = { rowNumber: info.lines } as InventoryImportRow
    for (const [field, column] of Object.entries(COLUMNS)) {
      row[field] = record[column] ?? ""
    }
    return row
  })
}

const listFields = (names: string[]) =>
  names.length > 1
    ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
    : names[0]

/**
 * Checks every row and returns the inventory items to create along with one
 * error per failing row. SKUs are compared exactly, both within the file and
 * against `existingSkus`, and Location names are looked up exactly in
 * `locationIdsByName`.
 */
export const validateInventoryImport = (
  rows: InventoryImportRow[],
  existingSkus: string[],
  locationIdsByName: Record<string, string[]>
): { items: InventoryImportItem[]; errors: string[] } => {
  const existing = new Set(existingSkus)
  const firstRowBySku = new Map<string, number>()
  const items: InventoryImportItem[] = []
  const errors: string[] = []

  for (const row of rows) {
    const { rowNumber, sku } = row

    const missing = REQUIRED_FIELDS.filter((field) => !row[field])
    if (missing.length) {
      errors.push(
        `Row ${rowNumber}: ${listFields(
          missing.map((field) => COLUMNS[field])
        )} ${missing.length > 1 ? "are" : "is"} required`
      )
      continue
    }

    const firstRow = firstRowBySku.get(sku)
    if (firstRow) {
      errors.push(
        `Row ${rowNumber}: ${sku} is also used on row ${firstRow} of this file`
      )
      continue
    }
    firstRowBySku.set(sku, rowNumber)

    const requiresShipping = row.requires_shipping.toLowerCase()
    if (requiresShipping !== "true" && requiresShipping !== "false") {
      errors.push(
        `Row ${rowNumber}: Requires Shipping must be true or false, got "${row.requires_shipping}"`
      )
      continue
    }

    if (!/^\d+$/.test(row.stocked_quantity)) {
      errors.push(
        `Row ${rowNumber}: Stocked Quantity must be a whole number of 0 or more, got "${row.stocked_quantity}"`
      )
      continue
    }

    const badNumber = NUMBER_FIELDS.find(
      (field) => row[field] && !Number.isFinite(Number(row[field]))
    )
    if (badNumber) {
      errors.push(
        `Row ${rowNumber}: ${COLUMNS[badNumber]} must be a number, got "${row[badNumber]}"`
      )
      continue
    }

    const locationIds = locationIdsByName[row.location] ?? []
    if (!locationIds.length) {
      errors.push(
        `Row ${rowNumber}: No stock location is named "${row.location}"`
      )
      continue
    }
    if (locationIds.length > 1) {
      errors.push(
        `Row ${rowNumber}: More than one stock location is named "${row.location}"`
      )
      continue
    }

    if (existing.has(sku)) {
      errors.push(
        `Row ${rowNumber}: An inventory item with the SKU ${sku} already exists`
      )
      continue
    }

    const item: InventoryImportItem = {
      title: row.title,
      sku,
      requires_shipping: requiresShipping === "true",
      location_levels: [
        {
          location_id: locationIds[0],
          stocked_quantity: Number(row.stocked_quantity),
        },
      ],
    }
    for (const field of TEXT_FIELDS) {
      if (row[field]) {
        item[field] = row[field]
      }
    }
    for (const field of NUMBER_FIELDS) {
      if (row[field]) {
        item[field] = Number(row[field])
      }
    }
    items.push(item)
  }

  return { items, errors }
}
