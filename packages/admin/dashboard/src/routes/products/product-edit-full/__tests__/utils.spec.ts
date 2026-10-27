import { describe, expect, it } from "vitest"

import { buildProductEditRequests, mapProductToFormValues } from "../utils"

// A small stored product with one variant that has a price, a region price and
// a two-item inventory kit. Cast to `any` because the real API type has many
// required fields the tests do not care about.
const product: any = {
  id: "prod_1",
  title: "Shirt",
  subtitle: null,
  handle: "shirt",
  description: "Old description",
  discountable: true,
  thumbnail: "http://img/1.png",
  width: 10,
  length: null,
  height: null,
  weight: null,
  images: [{ id: "img_1", url: "http://img/1.png" }],
  options: [
    { id: "opt_1", title: "Size", values: [{ id: "val_1", value: "M" }] },
  ],
  tags: [],
  categories: [],
  sales_channels: [{ id: "sc_1", name: "Default" }],
  variants: [
    {
      id: "variant_1",
      title: "M",
      sku: "SHIRT-M",
      variant_rank: 0,
      manage_inventory: true,
      allow_backorder: false,
      options: [{ id: "v1", value: "M", option_id: "opt_1" }],
      prices: [
        { id: "price_1", currency_code: "usd", amount: 10, rules: {} },
        {
          id: "price_2",
          currency_code: "eur",
          amount: 9,
          rules: { region_id: "reg_1" },
        },
      ],
      inventory_items: [
        { inventory_item_id: "iitem_1", required_quantity: 1 },
        { inventory_item_id: "iitem_2", required_quantity: 2 },
      ],
    },
  ],
}

const regionsCurrencyMap = { reg_1: "eur" }

const build = (values: any) =>
  buildProductEditRequests({
    values,
    product,
    media: values.media,
    regionsCurrencyMap,
  })

describe("mapProductToFormValues", () => {
  it("pre-fills product fields, turning nulls and numbers into form strings", () => {
    const values = mapProductToFormValues(product)

    expect(values.title).toBe("Shirt")
    expect(values.subtitle).toBe("")
    expect(values.width).toBe("10")
    expect(values.length).toBe("")
    expect(values.sales_channels).toEqual([{ id: "sc_1", name: "Default" }])
  })

  it("maps options, media and the thumbnail flag", () => {
    const values = mapProductToFormValues(product)

    expect(values.options).toEqual([
      { id: "opt_1", title: "Size", values: ["M"], value_ids: ["val_1"] },
    ])
    expect(values.media).toEqual([
      { id: "img_1", url: "http://img/1.png", isThumbnail: true, file: null },
    ])
  })

  it("maps variant prices by currency/region and detects inventory kits", () => {
    const [variant] = mapProductToFormValues(product).variants

    expect(variant.options).toEqual({ Size: "M" })
    expect(variant.prices).toEqual({ usd: "10", reg_1: "9" })
    expect(variant.inventory_kit).toBe(true)
    expect(variant.inventory).toEqual([
      { inventory_item_id: "iitem_1", required_quantity: "1" },
      { inventory_item_id: "iitem_2", required_quantity: "2" },
    ])
  })
})

describe("buildProductEditRequests", () => {
  it("sends no variant or inventory requests when only product fields change", () => {
    const values = mapProductToFormValues(product)
    values.description = "New description"

    const requests = build(values)

    expect(requests.variantsBatch).toBeUndefined()
    expect(requests.variantDeletes).toBeUndefined()
    expect(requests.optionsAdd).toBeUndefined()
    expect(requests.optionsRemove).toBeUndefined()
    expect(requests.inventoryItems).toBeUndefined()
    expect(requests.product.description).toBe("New description")
  })

  it("clears emptied optional fields with null and converts dimensions", () => {
    const values = mapProductToFormValues(product)
    values.width = ""
    values.height = "5"

    const { product: payload } = build(values)

    expect(payload.subtitle).toBeNull()
    expect(payload.width).toBeNull()
    expect(payload.height).toBe(5)
  })

  it("updates only the changed variant, reusing existing price ids", () => {
    const values = mapProductToFormValues(product)
    values.variants[0].prices = { usd: "12", reg_1: "9" }

    const { variantsBatch } = build(values)

    expect(variantsBatch?.create).toBeUndefined()
    expect(variantsBatch?.update).toHaveLength(1)
    expect(variantsBatch!.update![0].id).toBe("variant_1")
    expect(variantsBatch!.update![0].prices).toEqual([
      { id: "price_1", currency_code: "usd", amount: 12 },
      {
        id: "price_2",
        currency_code: "eur",
        amount: 9,
        rules: { region_id: "reg_1" },
      },
    ])
  })

  it("diffs inventory kit rows into create, update and delete", () => {
    const values = mapProductToFormValues(product)
    values.variants[0].inventory = [
      // iitem_1 unchanged, iitem_2 removed, iitem_3 added
      { inventory_item_id: "iitem_1", required_quantity: "1" },
      { inventory_item_id: "iitem_3", required_quantity: "4" },
    ]

    const { inventoryItems } = build(values)

    expect(inventoryItems).toEqual({
      create: [
        {
          variant_id: "variant_1",
          inventory_item_id: "iitem_3",
          required_quantity: 4,
        },
      ],
      update: [],
      delete: [{ variant_id: "variant_1", inventory_item_id: "iitem_2" }],
    })
  })

  it("keeps the thumbnail and image ids from the media list", () => {
    const values = mapProductToFormValues(product)

    const { product: payload } = build(values)

    expect(payload.thumbnail).toBe("http://img/1.png")
    expect(payload.images).toEqual([{ id: "img_1", url: "http://img/1.png" }])
  })
})

describe("buildProductEditRequests: options and variants", () => {
  it("maps stored variants to rows that carry their variant_id", () => {
    const [variant] = mapProductToFormValues(product).variants

    expect(variant.variant_id).toBe("variant_1")
  })

  it("creates a brand-new variant (no variant_id) with its options record", () => {
    const values = mapProductToFormValues(product)
    values.variants.push({
      title: "L",
      should_create: true,
      variant_rank: 1,
      options: { Size: "L" },
      sku: "SHIRT-L",
      manage_inventory: false,
      allow_backorder: false,
      inventory_kit: false,
      prices: { usd: "11" },
      inventory: [{ inventory_item_id: "", required_quantity: "" }],
    })

    const { variantsBatch } = build(values)

    expect(variantsBatch?.update).toBeUndefined()
    expect(variantsBatch?.create).toHaveLength(1)
    expect(variantsBatch!.create![0]).toMatchObject({
      title: "L",
      sku: "SHIRT-L",
      options: { Size: "L" },
      prices: [{ currency_code: "usd", amount: 11 }],
    })
  })

  it("does not create a new row the manager unchecked", () => {
    const values = mapProductToFormValues(product)
    values.variants.push({
      title: "L",
      should_create: false,
      variant_rank: 1,
      options: { Size: "L" },
      inventory: [],
    } as any)

    expect(build(values).variantsBatch).toBeUndefined()
  })

  it("deletes a saved variant that was unchecked", () => {
    const values = mapProductToFormValues(product)
    values.variants[0].should_create = false

    const requests = build(values)

    expect(requests.variantDeletes).toEqual(["variant_1"])
    // A deleted variant must not also be updated.
    expect(requests.variantsBatch).toBeUndefined()
  })

  it("adds a typed value to an existing option before variants are saved", () => {
    const values = mapProductToFormValues(product)
    values.options[0].values = ["M", "XL"]
    values.options[0].value_ids = ["val_1", "XL"] // typed text, not an id

    const { optionsAdd, optionsRemove } = build(values)

    expect(optionsAdd).toEqual({
      update: [{ product_option_id: "opt_1", add: [{ value: "XL" }] }],
    })
    expect(optionsRemove).toBeUndefined()
  })

  it("links an existing option value by id instead of recreating it", () => {
    const values = mapProductToFormValues(product)
    values.options[0].values = ["M", "L"]
    values.options[0].value_ids = ["val_1", "optval_existing_L"]

    expect(build(values).optionsAdd).toEqual({
      update: [{ product_option_id: "opt_1", add: ["optval_existing_L"] }],
    })
  })

  it("creates a new option and gives existing variants the full options record", () => {
    const values = mapProductToFormValues(product)
    values.options.push({ title: "Color", values: ["Red", "Blue"] })
    values.variants[0].options = { Size: "M", Color: "Red" }

    const { optionsAdd, variantsBatch } = build(values)

    expect(optionsAdd?.add).toEqual([
      {
        title: "Color",
        values: ["Red", "Blue"],
        ranks: { Red: 0, Blue: 1 },
        is_exclusive: true,
      },
    ])
    expect(variantsBatch?.update?.[0]).toMatchObject({
      id: "variant_1",
      options: { Size: "M", Color: "Red" },
    })
  })

  it("puts value removals in their own request, separate from additions", () => {
    const values = mapProductToFormValues(product)
    values.options[0].values = []
    values.options[0].value_ids = []

    const { optionsAdd, optionsRemove } = build(values)

    expect(optionsAdd).toBeUndefined()
    expect(optionsRemove).toEqual({
      update: [{ product_option_id: "opt_1", remove: ["val_1"] }],
    })
  })

  it("only sends variant_rank when the order actually changed", () => {
    const values = mapProductToFormValues(product)
    values.variants[0].variant_rank = 3

    expect(build(values).variantsBatch?.update?.[0].variant_rank).toBe(3)
  })
})
