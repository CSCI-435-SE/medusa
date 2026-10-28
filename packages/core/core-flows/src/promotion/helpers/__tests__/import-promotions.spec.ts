import {
  parsePromotionImportCsv,
  validatePromotionImport,
} from "../import-promotions"

const HEADER =
  "Code,Type,Status,Automatic,Tax Inclusive,Usage Limit,Campaign ID,Discount Type,Discount Value,Currency Code,Target,Allocation,Max Quantity,Buy Min Quantity,Apply To Quantity,Rules,Target Rules,Buy Rules"

const csv = (...rows: string[]) => [HEADER, ...rows].join("\n")

const STANDARD =
  "SAVE10,standard,active,false,false,,,percentage,10,,items,across,,,,,,"
const BUYGET =
  "BUY2GET1,buyget,draft,,,,,percentage,100,,items,each,1,2,1,,product_id:in:prod_1,product_id:eq:prod_2"

const CAMPAIGNS = ["camp_1"]

describe("parsePromotionImportCsv", () => {
  it("maps the template columns and numbers rows like a spreadsheet", () => {
    const rows = parsePromotionImportCsv(
      csv(
        "SAVE10,standard,active,true,false,,camp_1,fixed,5,usd,order,,,,,currency_code:eq:usd,,",
        "SHIP,standard,,,,,,,,,,,,,,,,"
      )
    )

    expect(rows).toEqual([
      {
        rowNumber: 2,
        code: "SAVE10",
        type: "standard",
        status: "active",
        is_automatic: "true",
        is_tax_inclusive: "false",
        limit: "",
        campaign_id: "camp_1",
        discount_type: "fixed",
        value: "5",
        currency_code: "usd",
        target_type: "order",
        allocation: "",
        max_quantity: "",
        buy_rules_min_quantity: "",
        apply_to_quantity: "",
        rules: "currency_code:eq:usd",
        target_rules: "",
        buy_rules: "",
      },
      {
        rowNumber: 3,
        code: "SHIP",
        type: "standard",
        status: "",
        is_automatic: "",
        is_tax_inclusive: "",
        limit: "",
        campaign_id: "",
        discount_type: "",
        value: "",
        currency_code: "",
        target_type: "",
        allocation: "",
        max_quantity: "",
        buy_rules_min_quantity: "",
        apply_to_quantity: "",
        rules: "",
        target_rules: "",
        buy_rules: "",
      },
    ])
  })

  it("reads the Code column when the file starts with a UTF-8 BOM", () => {
    const rows = parsePromotionImportCsv("﻿" + csv(STANDARD))

    expect(rows[0].code).toBe("SAVE10")
  })
})

describe("validatePromotionImport", () => {
  const validate = (
    content: string,
    existingCodes: string[] = [],
    campaignIds: string[] = CAMPAIGNS
  ) =>
    validatePromotionImport(
      parsePromotionImportCsv(content),
      existingCodes,
      campaignIds
    )

  it("returns the promotions to create and leaves blank optional fields off", () => {
    const { promotions, errors } = validate(
      csv(
        "SAVE5,standard,active,TRUE,true,,camp_1,fixed,5,usd,order,,,,,currency_code:eq:usd,,",
        STANDARD
      )
    )

    expect(errors).toEqual([])
    expect(promotions).toEqual([
      {
        code: "SAVE5",
        type: "standard",
        status: "active",
        is_automatic: true,
        is_tax_inclusive: true,
        campaign_id: "camp_1",
        rules: [
          { attribute: "currency_code", operator: "eq", values: ["usd"] },
        ],
        application_method: {
          type: "fixed",
          value: 5,
          currency_code: "usd",
          target_type: "order",
        },
      },
      {
        code: "SAVE10",
        type: "standard",
        status: "active",
        is_automatic: false,
        is_tax_inclusive: false,
        application_method: {
          type: "percentage",
          value: 10,
          target_type: "items",
          allocation: "across",
        },
      },
    ])
  })

  it("returns a buyget promotion with its quantities and rules", () => {
    const { promotions, errors } = validate(csv(BUYGET))

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

  it("defaults a blank Status to draft", () => {
    const { promotions } = validate(
      csv("SAVE10,standard,,,,,,percentage,10,,items,across,,,,,,")
    )

    expect(promotions[0].status).toBe("draft")
  })

  it("splits rules on ; and values on |", () => {
    const { promotions, errors } = validate(
      csv(
        "SAVE10,standard,,,,,,percentage,10,,items,across,,,,customer.groups.id:in:cg_1|cg_2;currency_code:eq:usd,,"
      )
    )

    expect(errors).toEqual([])
    expect(promotions[0].rules).toEqual([
      {
        attribute: "customer.groups.id",
        operator: "in",
        values: ["cg_1", "cg_2"],
      },
      { attribute: "currency_code", operator: "eq", values: ["usd"] },
    ])
  })

  it("rejects a row with blank required fields and names each one", () => {
    const { errors } = validate(csv(",,active,,,,,,,,,,,,,,,"))

    expect(errors).toEqual([
      "Row 2: Code, Type, Discount Type, Discount Value and Target are required",
    ])
  })

  it("rejects a row with one blank required field", () => {
    const { errors } = validate(
      csv("SAVE10,standard,,,,,,percentage,,,items,across,,,,,,")
    )

    expect(errors).toEqual(["Row 2: Discount Value is required"])
  })

  it("rejects a code used twice in the file", () => {
    const { errors } = validate(csv(STANDARD, STANDARD))

    expect(errors).toEqual(["Row 3: SAVE10 is also used on row 2 of this file"])
  })

  it("rejects a code that already exists in the store", () => {
    const { errors } = validate(csv(STANDARD), ["SAVE10"])

    expect(errors).toEqual([
      "Row 2: A promotion with the code SAVE10 already exists",
    ])
  })

  it("matches codes exactly", () => {
    const { errors } = validate(csv(STANDARD), ["save10"])

    expect(errors).toEqual([])
  })

  it("rejects a Type that is not standard or buyget", () => {
    const { errors } = validate(
      csv("SAVE10,bogo,,,,,,percentage,10,,items,across,,,,,,")
    )

    expect(errors).toEqual([
      'Row 2: Type must be standard or buyget, got "bogo"',
    ])
  })

  it.each([
    [
      "Status",
      "SAVE10,standard,live,,,,,percentage,10,,items,across,,,,,,",
      'Status must be draft, active or inactive, got "live"',
    ],
    [
      "Automatic",
      "SAVE10,standard,,yes,,,,percentage,10,,items,across,,,,,,",
      'Automatic must be true or false, got "yes"',
    ],
    [
      "Tax Inclusive",
      "SAVE10,standard,,,no,,,percentage,10,,items,across,,,,,,",
      'Tax Inclusive must be true or false, got "no"',
    ],
    [
      "Discount Type",
      "SAVE10,standard,,,,,,percent,10,,items,across,,,,,,",
      'Discount Type must be fixed or percentage, got "percent"',
    ],
    [
      "Target",
      "SAVE10,standard,,,,,,percentage,10,,cart,across,,,,,,",
      'Target must be order, shipping_methods or items, got "cart"',
    ],
    [
      "Allocation",
      "SAVE10,standard,,,,,,percentage,10,,items,all,,,,,,",
      'Allocation must be each, across or once, got "all"',
    ],
  ])("rejects an invalid %s", (_, row, message) => {
    const { errors } = validate(csv(row))

    expect(errors).toEqual([`Row 2: ${message}`])
  })

  it("rejects a Discount Value that is not a number", () => {
    const { errors } = validate(
      csv("SAVE10,standard,,,,,,fixed,ten,usd,order,,,,,,,")
    )

    expect(errors).toEqual([
      'Row 2: Discount Value must be a number, got "ten"',
    ])
  })

  it.each(["Max Quantity", "Buy Min Quantity", "Apply To Quantity"])(
    "rejects a %s that is not a number",
    (column) => {
      const values = {
        "Max Quantity": "1",
        "Buy Min Quantity": "2",
        "Apply To Quantity": "1",
      }
      values[column] = "two"
      const { errors } = validate(
        csv(
          `BUY2GET1,buyget,,,,,,percentage,100,,items,each,${values["Max Quantity"]},${values["Buy Min Quantity"]},${values["Apply To Quantity"]},,product_id:in:prod_1,product_id:eq:prod_2`
        )
      )

      expect(errors).toEqual([`Row 2: ${column} must be a number, got "two"`])
    }
  )

  it.each(["0", "-1", "1.5", "five"])(
    "rejects a Usage Limit of %s",
    (limit) => {
      const { errors } = validate(
        csv(`SAVE10,standard,,,,${limit},,percentage,10,,items,across,,,,,,`)
      )

      expect(errors).toEqual([
        `Row 2: Usage Limit must be a whole number of 1 or more, got "${limit}"`,
      ])
    }
  )

  it.each(["0", "-5", "100.5"])(
    "rejects a percentage Discount Value of %s",
    (value) => {
      const { errors } = validate(
        csv(`SAVE10,standard,,,,,,percentage,${value},,items,across,,,,,,`)
      )

      expect(errors).toEqual([
        "Row 2: A percentage Discount Value must be greater than 0 and at most 100",
      ])
    }
  )

  it("accepts a percentage Discount Value of 100", () => {
    const { errors } = validate(
      csv("SAVE100,standard,,,,,,percentage,100,,items,across,,,,,,")
    )

    expect(errors).toEqual([])
  })

  it("rejects an automatic promotion with a Usage Limit", () => {
    const { errors } = validate(
      csv("SAVE10,standard,,true,,5,,percentage,10,,items,across,,,,,,")
    )

    expect(errors).toEqual([
      "Row 2: Automatic promotions cannot have a Usage Limit",
    ])
  })

  it("accepts a Usage Limit on a promotion that is not automatic", () => {
    const { promotions, errors } = validate(
      csv("SAVE10,standard,,false,,5,,percentage,10,,items,across,,,,,,")
    )

    expect(errors).toEqual([])
    expect(promotions[0].limit).toBe(5)
  })

  it("rejects a buyget promotion missing its rules and quantities and names each one", () => {
    const { errors } = validate(
      csv("BUY2GET1,buyget,,,,,,percentage,100,,items,each,,,,,,")
    )

    expect(errors).toEqual([
      "Row 2: buyget promotions require Buy Rules, Target Rules, Buy Min Quantity, Apply To Quantity and Max Quantity",
    ])
  })

  it("rejects a buyget promotion missing one of them", () => {
    const { errors } = validate(
      csv(
        "BUY2GET1,buyget,,,,,,percentage,100,,items,each,1,2,1,,product_id:in:prod_1,"
      )
    )

    expect(errors).toEqual(["Row 2: buyget promotions require Buy Rules"])
  })

  it.each([
    "product_id:in",
    "product_id::prod_1",
    ":eq:prod_1",
    "product_id:contains:prod_1",
  ])("rejects the rule %s", (rule) => {
    const { errors } = validate(
      csv(`SAVE10,standard,,,,,,percentage,10,,items,across,,,,${rule},,`)
    )

    expect(errors).toEqual([
      `Row 2: Rules has an invalid rule "${rule}". Each rule must be attribute:operator:value1|value2 with an operator of gte, lte, gt, lt, eq, ne or in`,
    ])
  })

  it("names the rule column that has the invalid rule", () => {
    const { errors } = validate(
      csv(
        "BUY2GET1,buyget,,,,,,percentage,100,,items,each,1,2,1,,product_id:in:prod_1,product_id"
      )
    )

    expect(errors).toEqual([
      'Row 2: Buy Rules has an invalid rule "product_id". Each rule must be attribute:operator:value1|value2 with an operator of gte, lte, gt, lt, eq, ne or in',
    ])
  })

  it("rejects a Campaign ID that does not match a campaign", () => {
    const { errors } = validate(
      csv("SAVE10,standard,,,,,camp_missing,percentage,10,,items,across,,,,,,")
    )

    expect(errors).toEqual(['Row 2: No campaign has the ID "camp_missing"'])
  })

  it("reports every failing row", () => {
    const { promotions, errors } = validate(
      csv(
        STANDARD,
        ",standard,,,,,,percentage,10,,items,across,,,,,,",
        "SAVE20,standard,,,,,,percentage,200,,items,across,,,,,,",
        STANDARD
      ),
      [],
      CAMPAIGNS
    )

    expect(errors).toEqual([
      "Row 3: Code is required",
      "Row 4: A percentage Discount Value must be greater than 0 and at most 100",
      "Row 5: SAVE10 is also used on row 2 of this file",
    ])
    expect(promotions).toHaveLength(1)
  })
})
