import { describe, expect, it } from "vitest"

import {
  BUNDLE_EDIT_FIELDS,
  BUNDLE_IN_USE_ERROR_CODE,
  findBundlesUsingVariants,
  getBundleComponents,
  getOrderLineBundleComponents,
  getReturnedBundleComponentUnits,
  isBundle,
  isBundleUsageError,
  mapBundleToFormValues,
  normalizeBundleFormValues,
} from "../bundles"

const components = [
  { variant_id: "variant_camera", quantity: 1 },
  { variant_id: "variant_lens", quantity: 2 },
]

const cameraKit = {
  id: "prod_kit",
  title: "Camera kit",
  metadata: { bundle: { components } },
} as any

describe("getBundleComponents", () => {
  it("reads the components a bundle stores in its metadata", () => {
    expect(getBundleComponents(cameraKit.metadata)).toEqual(components)
  })

  it("returns null for a product that is not a bundle", () => {
    expect(getBundleComponents(null)).toBeNull()
    expect(getBundleComponents({})).toBeNull()
    expect(getBundleComponents({ bundle: {} })).toBeNull()
    expect(getBundleComponents({ bundle: { components: "nope" } })).toBeNull()
  })
})

describe("isBundle", () => {
  it("is true only for a product with bundle components", () => {
    expect(isBundle(cameraKit)).toBe(true)
    expect(isBundle({ id: "prod_x", metadata: null } as any)).toBe(false)
    expect(isBundle(undefined)).toBe(false)
  })
})

describe("isBundleUsageError", () => {
  it("recognises the error the delete workflows throw for a bundle component", () => {
    expect(isBundleUsageError({ code: BUNDLE_IN_USE_ERROR_CODE } as any)).toBe(
      true
    )
    expect(isBundleUsageError({ code: "bundle_in_use" } as any)).toBe(true)
  })

  it("does not recognise any other failure", () => {
    expect(isBundleUsageError({ code: "insufficient_inventory" } as any)).toBe(
      false
    )
    expect(isBundleUsageError({} as any)).toBe(false)
    expect(isBundleUsageError(undefined)).toBe(false)
  })
})

describe("findBundlesUsingVariants", () => {
  const lensDeal = {
    id: "prod_deal",
    title: "Lens deal",
    metadata: {
      bundle: {
        components: [
          { variant_id: "variant_lens", quantity: 1 },
          { variant_id: "variant_strap", quantity: 1 },
        ],
      },
    },
  } as any
  const shirt = { id: "prod_shirt", title: "Shirt", metadata: null } as any

  it("names every bundle that uses the variant", () => {
    expect(
      findBundlesUsingVariants([cameraKit, lensDeal, shirt], ["variant_lens"])
    ).toEqual([
      { id: "prod_kit", title: "Camera kit" },
      { id: "prod_deal", title: "Lens deal" },
    ])
  })

  it("is empty when no bundle uses the variant", () => {
    expect(
      findBundlesUsingVariants([cameraKit, lensDeal], ["variant_tripod"])
    ).toEqual([])
  })

  it("leaves out the product being deleted", () => {
    expect(
      findBundlesUsingVariants([cameraKit], ["variant_lens"], ["prod_kit"])
    ).toEqual([])
  })
})

describe("normalizeBundleFormValues", () => {
  const values = {
    title: "  Camera kit  ",
    subtitle: "",
    handle: " camera-kit ",
    description: "Everything you need",
    discountable: true,
    type_id: "",
    collection_id: "pcol_1",
    shipping_profile_id: "",
    categories: ["pcat_cameras"],
    tags: ["ptag_new"],
    sales_channels: [{ id: "sc_1", name: "Default" }],
    origin_country: "",
    material: "",
    width: "",
    length: "",
    height: "",
    weight: "",
    mid_code: "",
    hs_code: "",
    media: [
      { url: "https://example.com/thumb.jpg", isThumbnail: true, file: null },
      { url: "https://example.com/other.jpg", isThumbnail: false, file: null },
    ],
    components: [
      { variant_id: "variant_camera", quantity: 1 },
      { variant_id: "variant_lens", quantity: "2" },
    ],
    prices: { usd: 899, eur: "", reg_europe: "849" },
  } as any

  const regionsCurrencyMap = { reg_europe: "eur" }

  it("sends the components with whole-number quantities", () => {
    const payload = normalizeBundleFormValues({
      ...values,
      status: "published",
      regionsCurrencyMap,
    })

    expect(payload.components).toEqual([
      { variant_id: "variant_camera", quantity: 1 },
      { variant_id: "variant_lens", quantity: 2 },
    ])
  })

  it("sends a price per currency and leaves blank ones out", () => {
    const payload = normalizeBundleFormValues({
      ...values,
      status: "published",
      regionsCurrencyMap,
    })

    expect(payload.prices).toEqual([
      { currency_code: "usd", amount: 899 },
      { currency_code: "eur", amount: 849, rules: { region_id: "reg_europe" } },
    ])
  })

  it("sends the product fields the same way the product form does", () => {
    const payload = normalizeBundleFormValues({
      ...values,
      status: "draft",
      regionsCurrencyMap,
    })

    expect(payload.title).toEqual("Camera kit")
    expect(payload.handle).toEqual("camera-kit")
    expect(payload.status).toEqual("draft")
    expect(payload.collection_id).toEqual("pcol_1")
    expect(payload.categories).toEqual([{ id: "pcat_cameras" }])
    expect(payload.tags).toEqual([{ id: "ptag_new" }])
    expect(payload.sales_channels).toEqual([{ id: "sc_1" }])
    expect(payload.thumbnail).toEqual("https://example.com/thumb.jpg")
    expect(payload.images).toEqual([{ url: "https://example.com/other.jpg" }])
  })

  it("does not send variants or options, which the bundle route rejects", () => {
    const payload = normalizeBundleFormValues({
      ...values,
      status: "published",
      regionsCurrencyMap,
    }) as unknown as Record<string, unknown>

    expect("variants" in payload).toBe(false)
    expect("options" in payload).toBe(false)
  })
})

describe("getOrderLineBundleComponents", () => {
  const line = {
    id: "ordli_kit",
    metadata: {
      bundle: {
        components: [
          {
            variant_id: "variant_camera",
            title: "Camera body",
            quantity: 1,
            units: 2,
            refund_share: 666.67,
          },
        ],
      },
    },
  } as any

  it("reads the components saved on the order line", () => {
    expect(getOrderLineBundleComponents(line)).toHaveLength(1)
    expect(getOrderLineBundleComponents(line)![0].title).toEqual("Camera body")
  })

  it("returns null for a line that is not a bundle", () => {
    expect(
      getOrderLineBundleComponents({ id: "ordli_shirt", metadata: null } as any)
    ).toBeNull()
  })
})

describe("getReturnedBundleComponentUnits", () => {
  const returns = [
    {
      id: "ret_1",
      items: [
        {
          item_id: "ordli_kit",
          quantity: 1,
          metadata: { bundle_component: { variant_id: "variant_bag" } },
        },
        {
          item_id: "ordli_kit",
          quantity: 2,
          metadata: { bundle_component: { variant_id: "variant_lens" } },
        },
        // A whole-bundle return of the same line, which names no component.
        { item_id: "ordli_kit", quantity: 1, metadata: null },
        // Another line's component.
        {
          item_id: "ordli_other",
          quantity: 5,
          metadata: { bundle_component: { variant_id: "variant_bag" } },
        },
      ],
    },
    {
      id: "ret_2",
      items: [
        {
          item_id: "ordli_kit",
          quantity: 1,
          metadata: { bundle_component: { variant_id: "variant_bag" } },
        },
      ],
    },
    {
      id: "ret_3",
      canceled_at: "2026-11-01T00:00:00.000Z",
      items: [
        {
          item_id: "ordli_kit",
          quantity: 4,
          metadata: { bundle_component: { variant_id: "variant_bag" } },
        },
      ],
    },
  ] as any

  it("adds up what was returned per component of that line", () => {
    expect(getReturnedBundleComponentUnits(returns, "ordli_kit")).toEqual({
      variant_bag: 2,
      variant_lens: 2,
    })
  })

  it("ignores canceled returns", () => {
    const [, , canceled] = returns

    expect(getReturnedBundleComponentUnits([canceled], "ordli_kit")).toEqual({})
  })

  it("is empty when nothing was returned", () => {
    expect(getReturnedBundleComponentUnits([], "ordli_kit")).toEqual({})
  })
})

describe("mapBundleToFormValues", () => {
  const bundleProduct = {
    id: "prod_kit",
    title: "Camera kit",
    subtitle: null,
    handle: "camera-kit",
    description: "Everything you need",
    discountable: true,
    type_id: null,
    collection_id: "pcol_1",
    shipping_profile: { id: "sp_1" },
    categories: [{ id: "pcat_cameras" }],
    tags: [{ id: "ptag_new" }],
    sales_channels: [{ id: "sc_1", name: "Default" }],
    thumbnail: "https://example.com/thumb.jpg",
    images: [
      { id: "img_1", url: "https://example.com/thumb.jpg" },
      { id: "img_2", url: "https://example.com/other.jpg" },
    ],
    metadata: { bundle: { components } },
    options: [],
    variants: [
      {
        id: "variant_kit",
        title: "Camera kit",
        variant_rank: 0,
        manage_inventory: true,
        prices: [
          { id: "price_1", currency_code: "usd", amount: 899 },
          {
            id: "price_2",
            currency_code: "eur",
            amount: 849,
            rules: { region_id: "reg_europe" },
          },
        ],
      },
    ],
  } as any

  it("fills the form with the bundle's components", () => {
    expect(mapBundleToFormValues(bundleProduct).components).toEqual(components)
  })

  it("fills the form with the bundle's prices, keyed by currency or region", () => {
    expect(mapBundleToFormValues(bundleProduct).prices).toEqual({
      usd: "899",
      reg_europe: "849",
    })
  })

  it("fills the product fields the same way the product edit form does", () => {
    const values = mapBundleToFormValues(bundleProduct)

    expect(values.title).toEqual("Camera kit")
    expect(values.handle).toEqual("camera-kit")
    expect(values.categories).toEqual(["pcat_cameras"])
    expect(values.tags).toEqual(["ptag_new"])
    expect(values.sales_channels).toEqual([{ id: "sc_1", name: "Default" }])
    expect(values.shipping_profile_id).toEqual("sp_1")
  })

  it("marks the product's thumbnail among its images", () => {
    const media = mapBundleToFormValues(bundleProduct).media

    expect(media).toEqual([
      {
        id: "img_1",
        url: "https://example.com/thumb.jpg",
        isThumbnail: true,
        file: null,
      },
      {
        id: "img_2",
        url: "https://example.com/other.jpg",
        isThumbnail: false,
        file: null,
      },
    ])
  })

  it("does not carry options or variants into the form", () => {
    const values = mapBundleToFormValues(bundleProduct) as Record<
      string,
      unknown
    >

    expect("variants" in values).toBe(false)
    expect("options" in values).toBe(false)
  })

  it("gives an empty component list for a product that is not a bundle", () => {
    const values = mapBundleToFormValues({
      ...bundleProduct,
      metadata: null,
    })

    expect(values.components).toEqual([])
  })

  /*
   * The round trip matters: the edit form loads a bundle, the admin changes one
   * thing, and what goes back has to be the same bundle. A field lost in the
   * mapping would silently clear it on the product.
   */
  it("round-trips a bundle through the form and back to a payload", () => {
    const payload = normalizeBundleFormValues({
      ...mapBundleToFormValues(bundleProduct),
      status: "published",
      regionsCurrencyMap: { reg_europe: "eur" },
    })

    expect(payload.components).toEqual(components)
    expect(payload.prices).toEqual([
      { currency_code: "usd", amount: 899 },
      { currency_code: "eur", amount: 849, rules: { region_id: "reg_europe" } },
    ])
    expect(payload.title).toEqual("Camera kit")
    expect(payload.thumbnail).toEqual("https://example.com/thumb.jpg")
    expect(payload.images).toEqual([{ url: "https://example.com/other.jpg" }])
  })
})

describe("BUNDLE_EDIT_FIELDS", () => {
  /*
   * A bare field name in `fields` makes the API return only the fields listed,
   * so `title`, `handle` and the product's other columns disappear and the edit
   * form opens empty. Every entry has to be prefixed with `*` (a relation) or
   * `+` (added to the defaults). Checked against the running API with
   * `GET /admin/products/:id?fields=...`: with `,metadata` the response had 10
   * keys and no title, with `,+metadata` it had 32 and kept everything.
   */
  it("asks for metadata without dropping the product's own fields", () => {
    expect(BUNDLE_EDIT_FIELDS.split(",")).toContain("+metadata")
    expect(BUNDLE_EDIT_FIELDS.split(",")).not.toContain("metadata")
  })

  it("prefixes every field it asks for", () => {
    const bare = BUNDLE_EDIT_FIELDS.split(",").filter(
      (field) => !field.startsWith("*") && !field.startsWith("+")
    )

    expect(bare).toEqual([])
  })
})
