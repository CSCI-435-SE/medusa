import { describe, expect, it } from "vitest"

import { EditInventoryItemSchema } from "./schema"

const parseThreshold = (low_stock_threshold: unknown) =>
  EditInventoryItemSchema.safeParse({ sku: "sku", low_stock_threshold })

describe("EditInventoryItemSchema low_stock_threshold", () => {
  it.each(["", " ", "-1", "1.5", "abc", "2147483648"])(
    "rejects %j",
    (value) => {
      expect(parseThreshold(value).success).toBe(false)
    }
  )

  it.each([
    ["0", 0],
    ["25", 25],
    [10, 10],
  ])("accepts %j as %j", (value, expected) => {
    const result = parseThreshold(value)

    expect(result.success).toBe(true)
    expect(result.data?.low_stock_threshold).toBe(expected)
  })
})
