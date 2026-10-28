import type {
  CreatePromotionDTO,
  CreatePromotionRuleDTO,
} from "@medusajs/framework/types"
import {
  ApplicationMethodAllocation,
  ApplicationMethodTargetType,
  ApplicationMethodType,
  MedusaError,
  PromotionRuleOperator,
  PromotionStatus,
  PromotionType,
} from "@medusajs/framework/utils"
import { parse } from "csv-parse/sync"

/**
 * A promotion row read from an import CSV, numbered like a spreadsheet row
 * (the header is row 1).
 */
export type PromotionImportRow = {
  rowNumber: number
  code: string
  type: string
  status: string
  is_automatic: string
  is_tax_inclusive: string
  limit: string
  campaign_id: string
  discount_type: string
  value: string
  currency_code: string
  target_type: string
  allocation: string
  max_quantity: string
  buy_rules_min_quantity: string
  apply_to_quantity: string
  rules: string
  target_rules: string
  buy_rules: string
}

const COLUMNS: Record<
  Exclude<keyof PromotionImportRow, "rowNumber">,
  string
> = {
  code: "Code",
  type: "Type",
  status: "Status",
  is_automatic: "Automatic",
  is_tax_inclusive: "Tax Inclusive",
  limit: "Usage Limit",
  campaign_id: "Campaign ID",
  discount_type: "Discount Type",
  value: "Discount Value",
  currency_code: "Currency Code",
  target_type: "Target",
  allocation: "Allocation",
  max_quantity: "Max Quantity",
  buy_rules_min_quantity: "Buy Min Quantity",
  apply_to_quantity: "Apply To Quantity",
  rules: "Rules",
  target_rules: "Target Rules",
  buy_rules: "Buy Rules",
}

const REQUIRED_FIELDS = [
  "code",
  "type",
  "discount_type",
  "value",
  "target_type",
] as const

const BUYGET_REQUIRED_FIELDS = [
  "buy_rules",
  "target_rules",
  "buy_rules_min_quantity",
  "apply_to_quantity",
  "max_quantity",
] as const

const BOOLEAN_FIELDS = ["is_automatic", "is_tax_inclusive"] as const

const QUANTITY_FIELDS = [
  "max_quantity",
  "buy_rules_min_quantity",
  "apply_to_quantity",
] as const

const RULE_FIELDS = ["rules", "target_rules", "buy_rules"] as const

const OPERATORS: string[] = Object.values(PromotionRuleOperator)

/**
 * Parses an import CSV with the columns of the promotion import template.
 */
export const parsePromotionImportCsv = (
  fileContent: string
): PromotionImportRow[] => {
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
    const row = { rowNumber: info.lines } as PromotionImportRow
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

const listOptions = (values: string[]) =>
  `${values.slice(0, -1).join(", ")} or ${values[values.length - 1]}`

/**
 * Parses a rule column in the form `attribute:operator:value1|value2`, with
 * rules separated by `;`. Returns the first rule that can't be read when the
 * column is invalid.
 */
const parseRules = (
  value: string
): { rules: CreatePromotionRuleDTO[] } | { invalid: string } => {
  const rules: CreatePromotionRuleDTO[] = []

  for (const rule of value.split(";").map((part) => part.trim())) {
    const [attribute, operator, ...rest] = rule.split(":")
    const values = rest
      .join(":")
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean)

    if (!attribute?.trim() || !OPERATORS.includes(operator) || !values.length) {
      return { invalid: rule }
    }

    rules.push({
      attribute: attribute.trim(),
      operator: operator as CreatePromotionRuleDTO["operator"],
      values,
    })
  }

  return { rules }
}

/**
 * Checks a filled in enum column against its allowed options. Booleans are
 * matched ignoring case, like Requires Shipping in the inventory import.
 */
const checkOption = (
  row: PromotionImportRow,
  field: keyof typeof COLUMNS,
  options: string[]
) => {
  const value = BOOLEAN_FIELDS.includes(field as any)
    ? row[field].toLowerCase()
    : row[field]

  return value && !options.includes(value)
    ? `${COLUMNS[field]} must be ${listOptions(options)}, got "${row[field]}"`
    : undefined
}

/**
 * Checks every row and returns the promotions to create along with one error
 * per failing row. Codes are compared exactly, both within the file and
 * against `existingCodes`, and Campaign IDs are looked up in `campaignIds`.
 */
export const validatePromotionImport = (
  rows: PromotionImportRow[],
  existingCodes: string[],
  campaignIds: string[]
): { promotions: CreatePromotionDTO[]; errors: string[] } => {
  const existing = new Set(existingCodes)
  const campaigns = new Set(campaignIds)
  const firstRowByCode = new Map<string, number>()
  const promotions: CreatePromotionDTO[] = []
  const errors: string[] = []

  for (const row of rows) {
    const { rowNumber, code } = row

    const missing = REQUIRED_FIELDS.filter((field) => !row[field])
    if (missing.length) {
      errors.push(
        `Row ${rowNumber}: ${listFields(
          missing.map((field) => COLUMNS[field])
        )} ${missing.length > 1 ? "are" : "is"} required`
      )
      continue
    }

    const firstRow = firstRowByCode.get(code)
    if (firstRow) {
      errors.push(
        `Row ${rowNumber}: ${code} is also used on row ${firstRow} of this file`
      )
      continue
    }
    firstRowByCode.set(code, rowNumber)

    const badOption = [
      checkOption(row, "type", Object.values(PromotionType)),
      checkOption(row, "status", Object.values(PromotionStatus)),
      ...BOOLEAN_FIELDS.map((field) =>
        checkOption(row, field, ["true", "false"])
      ),
      checkOption(row, "discount_type", Object.values(ApplicationMethodType)),
      checkOption(
        row,
        "target_type",
        Object.values(ApplicationMethodTargetType)
      ),
      checkOption(
        row,
        "allocation",
        Object.values(ApplicationMethodAllocation)
      ),
    ].find(Boolean)
    if (badOption) {
      errors.push(`Row ${rowNumber}: ${badOption}`)
      continue
    }

    if (!Number.isFinite(Number(row.value))) {
      errors.push(
        `Row ${rowNumber}: Discount Value must be a number, got "${row.value}"`
      )
      continue
    }

    const badQuantity = QUANTITY_FIELDS.find(
      (field) => row[field] && !Number.isFinite(Number(row[field]))
    )
    if (badQuantity) {
      errors.push(
        `Row ${rowNumber}: ${COLUMNS[badQuantity]} must be a number, got "${row[badQuantity]}"`
      )
      continue
    }

    if (row.limit && !/^[1-9]\d*$/.test(row.limit)) {
      errors.push(
        `Row ${rowNumber}: Usage Limit must be a whole number of 1 or more, got "${row.limit}"`
      )
      continue
    }

    const value = Number(row.value)
    if (
      row.discount_type === ApplicationMethodType.PERCENTAGE &&
      (value <= 0 || value > 100)
    ) {
      errors.push(
        `Row ${rowNumber}: A percentage Discount Value must be greater than 0 and at most 100`
      )
      continue
    }

    const isAutomatic = row.is_automatic.toLowerCase() === "true"
    if (isAutomatic && row.limit) {
      errors.push(
        `Row ${rowNumber}: Automatic promotions cannot have a Usage Limit`
      )
      continue
    }

    if (row.type === PromotionType.BUYGET) {
      const missingBuyget = BUYGET_REQUIRED_FIELDS.filter(
        (field) => !row[field]
      )
      if (missingBuyget.length) {
        errors.push(
          `Row ${rowNumber}: buyget promotions require ${listFields(
            missingBuyget.map((field) => COLUMNS[field])
          )}`
        )
        continue
      }
    }

    const parsedRules: Partial<
      Record<(typeof RULE_FIELDS)[number], CreatePromotionRuleDTO[]>
    > = {}
    const badRule = RULE_FIELDS.filter((field) => row[field])
      .map((field) => {
        const parsed = parseRules(row[field])
        if ("invalid" in parsed) {
          return `${COLUMNS[field]} has an invalid rule "${parsed.invalid}"`
        }
        parsedRules[field] = parsed.rules
        return undefined
      })
      .find(Boolean)
    if (badRule) {
      errors.push(
        `Row ${rowNumber}: ${badRule}. Each rule must be attribute:operator:value1|value2 with an operator of ${listOptions(
          OPERATORS
        )}`
      )
      continue
    }

    if (row.campaign_id && !campaigns.has(row.campaign_id)) {
      errors.push(
        `Row ${rowNumber}: No campaign has the ID "${row.campaign_id}"`
      )
      continue
    }

    if (existing.has(code)) {
      errors.push(
        `Row ${rowNumber}: A promotion with the code ${code} already exists`
      )
      continue
    }

    const promotion: CreatePromotionDTO = {
      code,
      type: row.type as CreatePromotionDTO["type"],
      status: (row.status ||
        PromotionStatus.DRAFT) as CreatePromotionDTO["status"],
      application_method: {
        type: row.discount_type as ApplicationMethodType,
        value,
        target_type: row.target_type as ApplicationMethodTargetType,
      },
    }
    for (const field of BOOLEAN_FIELDS) {
      if (row[field]) {
        promotion[field] = row[field].toLowerCase() === "true"
      }
    }
    if (row.limit) {
      promotion.limit = Number(row.limit)
    }
    if (row.campaign_id) {
      promotion.campaign_id = row.campaign_id
    }
    if (parsedRules.rules) {
      promotion.rules = parsedRules.rules
    }
    if (row.currency_code) {
      promotion.application_method.currency_code = row.currency_code
    }
    if (row.allocation) {
      promotion.application_method.allocation =
        row.allocation as ApplicationMethodAllocation
    }
    for (const field of QUANTITY_FIELDS) {
      if (row[field]) {
        promotion.application_method[field] = Number(row[field])
      }
    }
    if (parsedRules.target_rules) {
      promotion.application_method.target_rules = parsedRules.target_rules
    }
    if (parsedRules.buy_rules) {
      promotion.application_method.buy_rules = parsedRules.buy_rules
    }
    promotions.push(promotion)
  }

  return { promotions, errors }
}
