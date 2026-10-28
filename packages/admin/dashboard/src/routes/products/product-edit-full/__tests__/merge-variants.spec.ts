import { describe, expect, it } from "vitest"

import { mergeVariantCombinations } from "../../product-create/merge-variants"

// Builds a form variant row; `variant_id` present means "already saved".
const row = (
  options: Record<string, string>,
  extra: Record<string, unknown> = {}
): any => ({
  title: Object.values(options).join(" / "),
  should_create: true,
  variant_rank: 0,
  options,
  sku: "",
  manage_inventory: false,
  allow_backorder: false,
  inventory_kit: false,
  inventory: [],
  ...extra,
})

describe("mergeVariantCombinations", () => {
  it("keeps a matching saved row untouched (prices, sku, id survive)", () => {
    const saved = row(
      { Size: "M" },
      { variant_id: "variant_1", sku: "SKU-M", prices: { usd: "10" } }
    )

    const result = mergeVariantCombinations([saved], [{ Size: "M" }])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      variant_id: "variant_1",
      sku: "SKU-M",
      prices: { usd: "10" },
      should_create: true,
    })
  })

  it("appends new combinations as new rows ranked after the existing ones", () => {
    const saved = row(
      { Size: "M" },
      { variant_id: "variant_1", variant_rank: 4 }
    )

    const result = mergeVariantCombinations(
      [saved],
      [{ Size: "M" }, { Size: "XL" }]
    )

    expect(result).toHaveLength(2)
    expect(result[1].variant_id).toBeUndefined()
    expect(result[1]).toMatchObject({
      title: "XL",
      options: { Size: "XL" },
      should_create: true,
      variant_rank: 5,
    })
  })

  it("flags a saved row whose combination disappeared for deletion", () => {
    const saved = row({ Size: "M" }, { variant_id: "variant_1" })

    const result = mergeVariantCombinations([saved], [{ Size: "L" }])

    expect(result[0]).toMatchObject({
      variant_id: "variant_1",
      should_create: false,
    })
    // ...and the unclaimed combination becomes a new row.
    expect(result[1]).toMatchObject({ options: { Size: "L" } })
  })

  it("drops an unsaved row whose combination disappeared", () => {
    const unsaved = row({ Size: "XL" })

    const result = mergeVariantCombinations([unsaved], [{ Size: "M" }])

    expect(result).toHaveLength(1)
    expect(result[0].options).toEqual({ Size: "M" })
  })

  it("extends saved variants when a new option is added", () => {
    const saved = row({ Size: "M" }, { variant_id: "variant_1", sku: "SKU-M" })

    const result = mergeVariantCombinations(
      [saved],
      [
        { Size: "M", Color: "Red" },
        { Size: "M", Color: "Blue" },
      ]
    )

    // The saved variant takes the first combination and keeps its data...
    expect(result[0]).toMatchObject({
      variant_id: "variant_1",
      sku: "SKU-M",
      options: { Size: "M", Color: "Red" },
      should_create: true,
    })
    // ...and the other combination is a new variant.
    expect(result[1].variant_id).toBeUndefined()
    expect(result[1].options).toEqual({ Size: "M", Color: "Blue" })
  })

  it("keeps an unchecked saved row unchecked when its combination still exists", () => {
    const saved = row(
      { Size: "M" },
      { variant_id: "variant_1", should_create: false }
    )

    const result = mergeVariantCombinations([saved], [{ Size: "M" }])

    expect(result[0].should_create).toBe(false)
  })
})
