import type { PromotionDTO, PromotionRuleDTO } from "@medusajs/framework/types"
import { COLUMNS } from "./import-promotions"

/**
 * The export's columns, in the order the import template expects them.
 */
export const EXPORT_COLUMNS = Object.values(COLUMNS)

/**
 * Writes a rule list in the import's format, `attribute:operator:value1|value2`
 * with rules separated by `;`. Rules missing an attribute, an operator or every
 * value are left out, since the import can't read them back.
 */
const serializeRules = (rules?: PromotionRuleDTO[]): string =>
  (rules ?? [])
    .map((rule) => {
      const values = (rule.values ?? [])
        .map((ruleValue) => ruleValue.value)
        .filter((value): value is string => !!value)

      if (!rule.attribute || !rule.operator || !values.length) {
        return undefined
      }

      return `${rule.attribute}:${rule.operator}:${values.join("|")}`
    })
    .filter(Boolean)
    .join(";")

/**
 * Writes a value the import reads as a boolean. A promotion that has never had
 * the flag set exports an empty cell rather than `false`, which the import
 * treats the same way.
 */
const serializeBoolean = (value?: boolean): string =>
  typeof value === "boolean" ? String(value) : ""

const serializeNumber = (value?: number | null): string =>
  typeof value === "number" ? String(value) : ""

/**
 * Flattens a promotion and its application method into one row of the import
 * template, keyed by column name. Fields the promotion doesn't have become
 * empty cells, so the row can be read back by `parsePromotionImportCsv` and
 * `validatePromotionImport`.
 */
export const normalizePromotionForExport = (
  promotion: PromotionDTO
): Record<string, string> => {
  const applicationMethod = promotion.application_method

  return {
    [COLUMNS.code]: promotion.code ?? "",
    [COLUMNS.type]: promotion.type ?? "",
    [COLUMNS.status]: promotion.status ?? "",
    [COLUMNS.is_automatic]: serializeBoolean(promotion.is_automatic),
    [COLUMNS.is_tax_inclusive]: serializeBoolean(promotion.is_tax_inclusive),
    [COLUMNS.limit]: serializeNumber(promotion.limit),
    [COLUMNS.campaign_id]: promotion.campaign_id ?? "",
    [COLUMNS.discount_type]: applicationMethod?.type ?? "",
    [COLUMNS.value]: serializeNumber(applicationMethod?.value),
    [COLUMNS.currency_code]: applicationMethod?.currency_code ?? "",
    [COLUMNS.target_type]: applicationMethod?.target_type ?? "",
    [COLUMNS.allocation]: applicationMethod?.allocation ?? "",
    [COLUMNS.max_quantity]: serializeNumber(applicationMethod?.max_quantity),
    [COLUMNS.buy_rules_min_quantity]: serializeNumber(
      applicationMethod?.buy_rules_min_quantity
    ),
    [COLUMNS.apply_to_quantity]: serializeNumber(
      applicationMethod?.apply_to_quantity
    ),
    [COLUMNS.rules]: serializeRules(promotion.rules),
    [COLUMNS.target_rules]: serializeRules(applicationMethod?.target_rules),
    [COLUMNS.buy_rules]: serializeRules(applicationMethod?.buy_rules),
  }
}
