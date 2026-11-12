import type { PromotionDTO, PromotionRuleDTO } from "@medusajs/framework/types"
import { json2csv } from "json-2-csv"
import {
  EXPORT_COLUMNS,
  normalizePromotionForExport,
} from "../export-promotions"
import {
  parsePromotionImportCsv,
  validatePromotionImport,
} from "../import-promotions"

// The header the import template defines, written out rather than built from
// the code so a column that moves or is renamed fails this test.
const HEADER =
  "Code,Type,Status,Automatic,Tax Inclusive,Usage Limit,Campaign ID,Discount Type,Discount Value,Currency Code,Target,Allocation,Max Quantity,Buy Min Quantity,Apply To Quantity,Rules,Target Rules,Buy Rules"

const rule = (
  attribute: string,
  operator: string,
  ...values: string[]
): PromotionRuleDTO =>
  ({
    id: `prule_${attribute}`,
    attribute,
    operator,
    values: values.map((value) => ({ id: `pruleval_${value}`, value })),
  } as PromotionRuleDTO)

const STANDARD: PromotionDTO = {
  id: "promo_1",
  code: "SAVE10",
  type: "standard",
  status: "active",
  is_automatic: false,
  is_tax_inclusive: false,
  campaign_id: "camp_1",
  application_method: {
    id: "proappmet_1",
    type: "percentage",
    value: 10,
    target_type: "items",
    allocation: "across",
  },
  rules: [rule("currency_code", "eq", "eur")],
} as PromotionDTO

const BUYGET: PromotionDTO = {
  id: "promo_2",
  code: "BUY2GET1",
  type: "buyget",
  status: "draft",
  application_method: {
    id: "proappmet_2",
    type: "percentage",
    value: 100,
    target_type: "items",
    allocation: "each",
    max_quantity: 1,
    buy_rules_min_quantity: 2,
    apply_to_quantity: 1,
    target_rules: [rule("product_id", "in", "prod_1")],
    buy_rules: [rule("product_id", "eq", "prod_2")],
  },
} as PromotionDTO

const toCsv = (promotions: PromotionDTO[]) =>
  json2csv(promotions.map(normalizePromotionForExport), {
    keys: EXPORT_COLUMNS,
    prependHeader: true,
    preventCsvInjection: true,
    emptyFieldValue: "",
  })

describe("normalizePromotionForExport", () => {
  it("uses the import template's columns in the template's order", () => {
    expect(EXPORT_COLUMNS.join(",")).toEqual(HEADER)
  })

  it("flattens a promotion and its application method into one row", () => {
    expect(normalizePromotionForExport(STANDARD)).toEqual({
      Code: "SAVE10",
      Type: "standard",
      Status: "active",
      Automatic: "false",
      "Tax Inclusive": "false",
      "Usage Limit": "",
      "Campaign ID": "camp_1",
      "Discount Type": "percentage",
      "Discount Value": "10",
      "Currency Code": "",
      Target: "items",
      Allocation: "across",
      "Max Quantity": "",
      "Buy Min Quantity": "",
      "Apply To Quantity": "",
      Rules: "currency_code:eq:eur",
      "Target Rules": "",
      "Buy Rules": "",
    })
  })

  it("joins a rule's values with | and separate rules with ;", () => {
    const promotion = {
      ...STANDARD,
      rules: [
        rule("currency_code", "eq", "eur"),
        rule("customer_group_id", "in", "cg_1", "cg_2"),
      ],
    } as PromotionDTO

    expect(normalizePromotionForExport(promotion).Rules).toEqual(
      "currency_code:eq:eur;customer_group_id:in:cg_1|cg_2"
    )
  })

  it("writes the buyget quantities and both rule columns", () => {
    const row = normalizePromotionForExport(BUYGET)

    expect(row["Max Quantity"]).toEqual("1")
    expect(row["Buy Min Quantity"]).toEqual("2")
    expect(row["Apply To Quantity"]).toEqual("1")
    expect(row["Target Rules"]).toEqual("product_id:in:prod_1")
    expect(row["Buy Rules"]).toEqual("product_id:eq:prod_2")
  })

  it("leaves a field the promotion doesn't have as an empty cell", () => {
    const row = normalizePromotionForExport({
      id: "promo_3",
      code: "BARE",
    } as PromotionDTO)

    expect(row).toEqual(
      Object.fromEntries(
        EXPORT_COLUMNS.map((column) => [
          column,
          column === "Code" ? "BARE" : "",
        ])
      )
    )
  })

  it("writes a limit of 0 and a value of 0 rather than treating them as unset", () => {
    const row = normalizePromotionForExport({
      ...STANDARD,
      limit: 0,
      application_method: { ...STANDARD.application_method, value: 0 },
    } as PromotionDTO)

    expect(row["Usage Limit"]).toEqual("0")
    expect(row["Discount Value"]).toEqual("0")
  })

  it("leaves out a rule with no values, which the import can't read back", () => {
    const promotion = {
      ...STANDARD,
      rules: [
        rule("currency_code", "eq"),
        rule("customer_group_id", "in", "cg_1"),
      ],
    } as PromotionDTO

    expect(normalizePromotionForExport(promotion).Rules).toEqual(
      "customer_group_id:in:cg_1"
    )
  })
})

describe("exported promotions read back through the import", () => {
  it("recreates a standard promotion with the same settings and rules", () => {
    // Two rules, one of them with two values, so the round trip covers both
    // separators from AC4 rather than only a single-value rule.
    const promotion = {
      ...STANDARD,
      rules: [
        rule("currency_code", "eq", "eur"),
        rule("customer_group_id", "in", "cg_1", "cg_2"),
      ],
    } as PromotionDTO

    const rows = parsePromotionImportCsv(toCsv([promotion]))
    const { promotions, errors } = validatePromotionImport(rows, [], ["camp_1"])

    expect(errors).toEqual([])
    expect(promotions).toEqual([
      {
        code: "SAVE10",
        type: "standard",
        status: "active",
        is_automatic: false,
        is_tax_inclusive: false,
        campaign_id: "camp_1",
        application_method: {
          type: "percentage",
          value: 10,
          target_type: "items",
          allocation: "across",
        },
        rules: [
          { attribute: "currency_code", operator: "eq", values: ["eur"] },
          {
            attribute: "customer_group_id",
            operator: "in",
            values: ["cg_1", "cg_2"],
          },
        ],
      },
    ])
  })

  it("recreates a buyget promotion with its quantities and both rule sets", () => {
    const rows = parsePromotionImportCsv(toCsv([BUYGET]))
    const { promotions, errors } = validatePromotionImport(rows, [], [])

    expect(errors).toEqual([])
    expect(promotions).toEqual([
      {
        code: "BUY2GET1",
        type: "buyget",
        status: "draft",
        application_method: {
          type: "percentage",
          value: 100,
          target_type: "items",
          allocation: "each",
          max_quantity: 1,
          buy_rules_min_quantity: 2,
          apply_to_quantity: 1,
          target_rules: [
            { attribute: "product_id", operator: "in", values: ["prod_1"] },
          ],
          buy_rules: [
            { attribute: "product_id", operator: "eq", values: ["prod_2"] },
          ],
        },
      },
    ])
  })

  it("exports every promotion in the file, one row each", () => {
    const rows = parsePromotionImportCsv(toCsv([STANDARD, BUYGET]))

    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.code)).toEqual(["SAVE10", "BUY2GET1"])
  })

  // Known limitation, recorded on #97: the import splits rule values on these
  // characters, so a value containing one is read back as a different rule.
  // Rule values are IDs and currency codes in practice.
  it("does not round trip a rule value containing a delimiter", () => {
    const promotion = {
      ...STANDARD,
      rules: [rule("customer_group_id", "in", "cg|1")],
    } as PromotionDTO

    const rows = parsePromotionImportCsv(toCsv([promotion]))
    const { promotions } = validatePromotionImport(rows, [], ["camp_1"])

    expect(promotions[0].rules).toEqual([
      { attribute: "customer_group_id", operator: "in", values: ["cg", "1"] },
    ])
  })
})
