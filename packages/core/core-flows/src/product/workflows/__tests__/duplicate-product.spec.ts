import {
  buildDuplicateProductInput,
  resolveDuplicateProductInclude,
} from "../duplicate-product"

// A source product shaped the way `DUPLICATE_PRODUCT_FIELDS` loads it: one
// option with two values, one managed variant with two prices, one image.
const source = (overrides: Record<string, unknown> = {}): any => ({
  id: "prod_1",
  title: "Classic Tee",
  handle: "classic-tee",
  subtitle: "Cotton",
  description: "A classic tee",
  is_giftcard: false,
  discountable: false,
  thumbnail: "https://example.com/thumb.png",
  weight: 100,
  metadata: { season: "summer" },
  type_id: "ptyp_1",
  collection_id: "pcol_1",
  images: [{ url: "https://example.com/1.png", metadata: { alt: "front" } }],
  options: [{ title: "Size", values: [{ value: "S" }, { value: "M" }] }],
  tags: [{ id: "ptag_1" }],
  categories: [{ id: "pcat_1" }],
  sales_channels: [{ id: "sc_1" }],
  shipping_profile: { id: "sp_1" },
  variants: [
    {
      title: "S",
      manage_inventory: false,
      allow_backorder: true,
      variant_rank: 0,
      weight: 90,
      metadata: { fit: "slim" },
      options: [{ value: "S", option: { title: "Size" } }],
      prices: [
        {
          amount: 10,
          currency_code: "usd",
          min_quantity: 1,
          max_quantity: 5,
          price_rules: [{ attribute: "region_id", value: "reg_1" }],
        },
        { amount: 9, currency_code: "eur", price_rules: [] },
      ],
    },
  ],
  ...overrides,
})

const build = (include?: any, overrides: Record<string, unknown> = {}) =>
  buildDuplicateProductInput({
    source: source(overrides),
    title: "Classic Tee - Long Sleeve",
    handle: "classic-tee-ls",
    include: resolveDuplicateProductInclude(include),
  })

describe("resolveDuplicateProductInclude", () => {
  // AC3: the defaults keep the behaviour duplication had before the options
  // existed, so an unchanged request copies everything it used to.
  it("selects every group when nothing is requested", () => {
    expect(resolveDuplicateProductInclude()).toEqual({
      images: true,
      variants: true,
      prices: true,
      inventory_settings: true,
    })
  })

  it("selects every group for an empty selection", () => {
    expect(resolveDuplicateProductInclude({})).toEqual({
      images: true,
      variants: true,
      prices: true,
      inventory_settings: true,
    })
  })

  it("keeps the groups that are not mentioned", () => {
    expect(resolveDuplicateProductInclude({ images: false })).toEqual({
      images: false,
      variants: true,
      prices: true,
      inventory_settings: true,
    })
  })

  // AC8: prices and inventory settings are stored on variants, so they cannot
  // be copied on their own.
  it("forces prices and inventory settings off when variants are off", () => {
    expect(
      resolveDuplicateProductInclude({
        variants: false,
        prices: true,
        inventory_settings: true,
      })
    ).toEqual({
      images: true,
      variants: false,
      prices: false,
      inventory_settings: false,
    })
  })

  it("keeps prices off when variants are on but prices are not wanted", () => {
    expect(
      resolveDuplicateProductInclude({ variants: true, prices: false })
    ).toEqual({
      images: true,
      variants: true,
      prices: false,
      inventory_settings: true,
    })
  })
})

describe("buildDuplicateProductInput", () => {
  describe("always copied, whatever is selected", () => {
    // AC2: basic product information is not optional.
    it("copies the basic fields and the requested title and handle", () => {
      const result: any = build({
        images: false,
        variants: false,
        prices: false,
        inventory_settings: false,
      })

      expect(result).toEqual(
        expect.objectContaining({
          title: "Classic Tee - Long Sleeve",
          handle: "classic-tee-ls",
          subtitle: "Cotton",
          description: "A classic tee",
          is_giftcard: false,
          discountable: false,
          weight: 100,
          metadata: { season: "summer" },
          type_id: "ptyp_1",
          collection_id: "pcol_1",
          tag_ids: ["ptag_1"],
          category_ids: ["pcat_1"],
          sales_channels: [{ id: "sc_1" }],
          shipping_profile_id: "sp_1",
        })
      )
    })

    // AC7: the copy is a draft whatever the original's status is.
    it("always starts the copy as a draft", () => {
      expect(build({}).status).toEqual("draft")
      expect(build({ variants: false }).status).toEqual("draft")
      expect(build({}, { status: "published" }).status).toEqual("draft")
    })

    // The create workflow rejects a product with no options, so options are
    // copied even when the variants that use them are not.
    it("copies options even when variants are not copied", () => {
      const result: any = build({ variants: false })

      expect(result.options).toEqual([{ title: "Size", values: ["S", "M"] }])
    })

    it("trims the requested title", () => {
      const result = buildDuplicateProductInput({
        source: source(),
        title: "  Padded Title  ",
        handle: "padded-title",
        include: resolveDuplicateProductInclude(),
      })

      expect(result.title).toEqual("Padded Title")
    })
  })

  describe("images", () => {
    it("copies image urls and metadata when selected", () => {
      const result: any = build({ images: true })

      expect(result.images).toEqual([
        { url: "https://example.com/1.png", metadata: { alt: "front" } },
      ])
    })

    it("copies no images when not selected", () => {
      const result: any = build({ images: false })

      expect(result.images).toEqual([])
    })

    it("copies no images when the original has none", () => {
      const result: any = build({ images: true }, { images: [] })

      expect(result.images).toEqual([])
    })
  })

  describe("variants", () => {
    it("copies variants with their option values when selected", () => {
      const result: any = build({ variants: true })

      expect(result.variants).toHaveLength(1)
      expect(result.variants[0]).toEqual(
        expect.objectContaining({
          title: "S",
          variant_rank: 0,
          weight: 90,
          metadata: { fit: "slim" },
          options: { Size: "S" },
        })
      )
    })

    it("copies no variants when not selected", () => {
      const result: any = build({ variants: false })

      expect(result.variants).toEqual([])
    })

    // Unique columns stay empty so the copy does not collide with the original.
    it("never copies sku, barcode, ean or upc", () => {
      const result: any = build(
        {},
        {
          variants: [
            {
              title: "S",
              sku: "TEE-S",
              barcode: "123",
              ean: "456",
              upc: "789",
              options: [],
              prices: [],
            },
          ],
        }
      )

      expect(result.variants[0]).not.toHaveProperty("sku")
      expect(result.variants[0]).not.toHaveProperty("barcode")
      expect(result.variants[0]).not.toHaveProperty("ean")
      expect(result.variants[0]).not.toHaveProperty("upc")
    })
  })

  describe("prices", () => {
    it("copies every price with its rules when selected", () => {
      const result: any = build({ prices: true })

      expect(result.variants[0].prices).toEqual([
        {
          amount: 10,
          currency_code: "usd",
          min_quantity: 1,
          max_quantity: 5,
          rules: { region_id: "reg_1" },
        },
        {
          amount: 9,
          currency_code: "eur",
          min_quantity: undefined,
          max_quantity: undefined,
          rules: {},
        },
      ])
    })

    it("copies the variant without prices when prices are not selected", () => {
      const result: any = build({ prices: false })

      expect(result.variants).toHaveLength(1)
      expect(result.variants[0].prices).toEqual([])
    })
  })

  describe("inventory settings", () => {
    // AC4: the settings are copied from the original when selected.
    it("copies manage_inventory and allow_backorder when selected", () => {
      const result: any = build({ inventory_settings: true })

      expect(result.variants[0].manage_inventory).toEqual(false)
      expect(result.variants[0].allow_backorder).toEqual(true)
    })

    // Omitted rather than set, so the variant falls back to the product
    // module's own defaults (manage_inventory true, allow_backorder false).
    it("omits both fields when not selected", () => {
      const result: any = build({ inventory_settings: false })

      expect(result.variants[0]).not.toHaveProperty("manage_inventory")
      expect(result.variants[0]).not.toHaveProperty("allow_backorder")
    })

    // AC4: settings are independent of stock, which is never part of the input.
    it("never copies stock quantities", () => {
      const result: any = build(
        { inventory_settings: true },
        {
          variants: [
            {
              title: "S",
              manage_inventory: true,
              inventory_quantity: 42,
              options: [],
              prices: [],
            },
          ],
        }
      )

      expect(result.variants[0]).not.toHaveProperty("inventory_quantity")
    })
  })

  // The source is loaded field by field through Query, so a nested list can
  // come back absent rather than empty, and an option value can come back
  // without the option it belongs to. AC6 requires the copy to stay valid
  // input for createProductsWorkflow in every one of those cases.
  describe("nested data the source can come back without", () => {
    const withVariant = (variant: Record<string, unknown>) =>
      build(
        { variants: true, prices: true, inventory_settings: true },
        { variants: [variant] }
      ) as any

    it("builds empty options for a variant with no options at all", () => {
      const result = withVariant({ title: "S", prices: [] })

      // toStrictEqual, not toEqual: toEqual ignores keys whose value is
      // undefined, so it cannot tell {} from { undefined: undefined }.
      expect(result.variants[0].options).toStrictEqual({})
    })

    it("builds no prices for a variant with no prices at all", () => {
      const result = withVariant({ title: "S", options: [] })

      expect(result.variants[0].prices).toEqual([])
    })

    it("builds empty rules for a price with no price rules at all", () => {
      const result = withVariant({
        title: "S",
        options: [],
        prices: [{ amount: 10, currency_code: "usd" }],
      })

      expect(result.variants[0].prices[0].rules).toStrictEqual({})
    })

    it("does not throw on an option value that has no option linked", () => {
      // A crash here would fail the whole duplication inside transform, which
      // AC9 requires to surface as an error on the form instead.
      expect(() =>
        withVariant({ title: "S", options: [{ value: "S" }], prices: [] })
      ).not.toThrow()
    })
  })

  describe("combinations", () => {
    // AC6: the narrowest selection still produces a product the create
    // workflow accepts, which means a title, a handle and options.
    it("builds a valid product for the narrowest selection", () => {
      const result: any = build({
        images: false,
        variants: false,
        prices: false,
        inventory_settings: false,
      })

      expect(result.title).toEqual("Classic Tee - Long Sleeve")
      expect(result.handle).toEqual("classic-tee-ls")
      expect(result.options).toHaveLength(1)
      expect(result.images).toEqual([])
      expect(result.variants).toEqual([])
    })

    it("copies variants without prices or inventory settings", () => {
      const result: any = build({
        images: false,
        variants: true,
        prices: false,
        inventory_settings: false,
      })

      expect(result.images).toEqual([])
      expect(result.variants[0].title).toEqual("S")
      expect(result.variants[0].prices).toEqual([])
      expect(result.variants[0]).not.toHaveProperty("manage_inventory")
    })

    it("copies images only", () => {
      const result: any = build({
        images: true,
        variants: false,
        prices: false,
        inventory_settings: false,
      })

      expect(result.images).toHaveLength(1)
      expect(result.variants).toEqual([])
    })

    it("copies prices but not inventory settings", () => {
      const result: any = build({
        prices: true,
        inventory_settings: false,
      })

      expect(result.variants[0].prices).toHaveLength(2)
      expect(result.variants[0]).not.toHaveProperty("manage_inventory")
    })
  })
})
