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

    expect(requests.variantUpdates).toBeUndefined()
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

    const { variantUpdates } = build(values)

    expect(variantUpdates).toHaveLength(1)
    expect(variantUpdates![0].id).toBe("variant_1")
    expect(variantUpdates![0].prices).toEqual([
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
