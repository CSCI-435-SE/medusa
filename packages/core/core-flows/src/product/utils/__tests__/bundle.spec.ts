import { MedusaError } from "@medusajs/framework/utils"
import {
  BUNDLE_IN_USE_ERROR_CODE,
  assertBundleKeepsSingleVariant,
  assertNoBundleUsesVariants,
  assertNoBundleVariants,
  buildBundleInventoryLinks,
  findBundlesUsingVariants,
  getBundleVariantId,
  isEmptyMetadataUpdate,
  protectBundleUpdate,
  validateBundleComponents,
} from "../bundle"

// A plain variant that tracks inventory through one inventory item.
const variant = (
  id: string,
  overrides: Record<string, unknown> = {}
): any => ({
  id,
  manage_inventory: true,
  product: { id: `prod_${id}`, metadata: null },
  inventory_items: [{ inventory_item_id: `inv_${id}`, required_quantity: 1 }],
  ...overrides,
})

const camera = variant("var_camera")
const lens = variant("var_lens")
const bag = variant("var_bag")

const validComponents = [
  { variant_id: "var_camera", quantity: 1 },
  { variant_id: "var_lens", quantity: 1 },
  { variant_id: "var_bag", quantity: 1 },
]

describe("validateBundleComponents (issue #112, AC 7)", () => {
  it("accepts a valid bundle", () => {
    expect(() =>
      validateBundleComponents(validComponents, [camera, lens, bag])
    ).not.toThrow()
  })

  it("rejects fewer than 2 components", () => {
    expect(() =>
      validateBundleComponents(
        [{ variant_id: "var_camera", quantity: 1 }],
        [camera]
      )
    ).toThrow(/at least 2 components/)
  })

  it("rejects a component variant that doesn't exist", () => {
    // var_lens is requested but was not found in the database
    expect(() =>
      validateBundleComponents(validComponents, [camera, bag])
    ).toThrow(
      expect.objectContaining({
        type: MedusaError.Types.NOT_FOUND,
        message: expect.stringContaining("var_lens"),
      })
    )
  })

  it("rejects a component that doesn't track inventory", () => {
    const untracked = variant("var_lens", { manage_inventory: false })
    expect(() =>
      validateBundleComponents(validComponents, [camera, untracked, bag])
    ).toThrow(/var_lens.*doesn't track inventory/)
  })

  it("rejects a component that has no inventory items", () => {
    const noItems = variant("var_lens", { inventory_items: [] })
    expect(() =>
      validateBundleComponents(validComponents, [camera, noItems, bag])
    ).toThrow(/doesn't track inventory/)
  })

  it("rejects a component that is itself a bundle", () => {
    const nested = variant("var_lens", {
      product: {
        id: "prod_other_bundle",
        metadata: {
          bundle: { components: [{ variant_id: "x", quantity: 1 }] },
        },
      },
    })
    expect(() =>
      validateBundleComponents(validComponents, [camera, nested, bag])
    ).toThrow(/belongs to a bundle/)
  })

  it("rejects the same component listed twice", () => {
    expect(() =>
      validateBundleComponents(
        [
          { variant_id: "var_camera", quantity: 1 },
          { variant_id: "var_camera", quantity: 2 },
        ],
        [camera]
      )
    ).toThrow(/must be unique.*var_camera/)
  })

  it.each([0, -1, 1.5])("rejects quantity %p", (quantity) => {
    expect(() =>
      validateBundleComponents(
        [
          { variant_id: "var_camera", quantity },
          { variant_id: "var_lens", quantity: 1 },
        ],
        [camera, lens]
      )
    ).toThrow(/whole number greater than 0/)
  })

  it("throws MedusaError so the API returns a clean 4xx", () => {
    expect(() => validateBundleComponents([], [])).toThrow(MedusaError)
  })
})

describe("buildBundleInventoryLinks (issue #112, AC 1 and 5)", () => {
  it("links each component inventory item with its quantity", () => {
    const links = buildBundleInventoryLinks(
      [
        { variant_id: "var_camera", quantity: 1 },
        { variant_id: "var_lens", quantity: 2 },
      ],
      [camera, lens]
    )

    expect(links).toEqual([
      { inventory_item_id: "inv_var_camera", required_quantity: 1 },
      { inventory_item_id: "inv_var_lens", required_quantity: 2 },
    ])
  })

  it("multiplies the quantity by the component's own required_quantity", () => {
    const multipack = variant("var_pack", {
      inventory_items: [{ inventory_item_id: "inv_cell", required_quantity: 4 }],
    })

    // 3 packs * 4 cells each = 12 cells per bundle
    const links = buildBundleInventoryLinks(
      [{ variant_id: "var_pack", quantity: 3 }],
      [multipack]
    )

    expect(links).toEqual([
      { inventory_item_id: "inv_cell", required_quantity: 12 },
    ])
  })

  it("adds up components that share an inventory item", () => {
    const a = variant("var_a", {
      inventory_items: [{ inventory_item_id: "inv_shared", required_quantity: 1 }],
    })
    const b = variant("var_b", {
      inventory_items: [{ inventory_item_id: "inv_shared", required_quantity: 3 }],
    })

    // 2x a (1 each) + 1x b (3) = 5
    const links = buildBundleInventoryLinks(
      [
        { variant_id: "var_a", quantity: 2 },
        { variant_id: "var_b", quantity: 1 },
      ],
      [a, b]
    )

    expect(links).toEqual([
      { inventory_item_id: "inv_shared", required_quantity: 5 },
    ])
  })
})

describe("bundle usage lookup (issue #112, AC 11)", () => {
  const cameraKit = {
    id: "prod_kit",
    title: "Camera kit",
    metadata: { bundle: { components: validComponents } },
  }
  const lensDeal = {
    id: "prod_deal",
    title: "Lens deal",
    metadata: {
      bundle: {
        components: [
          { variant_id: "var_lens", quantity: 2 },
          { variant_id: "var_other", quantity: 1 },
        ],
      },
    },
  }
  const normalProduct = { id: "prod_x", title: "Shirt", metadata: null }

  it("finds every bundle that uses the variant", () => {
    const found = findBundlesUsingVariants(
      [cameraKit, lensDeal, normalProduct],
      ["var_lens"]
    )
    expect(found.map((b) => b.id)).toEqual(["prod_kit", "prod_deal"])
  })

  it("names every bundle in the error", () => {
    expect(() =>
      assertNoBundleUsesVariants([cameraKit, lensDeal], ["var_lens"])
    ).toThrow(/"Camera kit" \(prod_kit\).*"Lens deal" \(prod_deal\)/)
  })

  it("does not block when no bundle uses the variant", () => {
    expect(() =>
      assertNoBundleUsesVariants([cameraKit], ["var_unrelated"])
    ).not.toThrow()
  })

  it("does not block a bundle that is deleted in the same request", () => {
    expect(() =>
      assertNoBundleUsesVariants([cameraKit], ["var_lens"], ["prod_kit"])
    ).not.toThrow()
  })

  // The admin dashboard needs to tell this error apart from any other reason a
  // delete failed, so that it can list the bundles with a link to each one
  // (issue #114, AC 7) instead of showing the message as it is. Matching on the
  // code keeps it off the message text.
  it("tags the error with the bundle-in-use code", () => {
    expect.assertions(3)

    try {
      assertNoBundleUsesVariants([cameraKit], ["var_lens"])
    } catch (error) {
      expect(error.code).toEqual(BUNDLE_IN_USE_ERROR_CODE)
      expect(error.code).toEqual("bundle_in_use")
      expect(error.type).toEqual(MedusaError.Types.NOT_ALLOWED)
    }
  })
})

// ---------------------------------------------------------------------------
// Review follow-up for #112: plain product routes must not break a bundle.
// ---------------------------------------------------------------------------

const aBundle = { id: "prod_kit", title: "Camera kit" }
const bundleMetadata = { bundle: { components: validComponents } }

describe("isEmptyMetadataUpdate", () => {
  it.each([null, {}])("is true for %p (these replace all metadata)", (value) => {
    expect(isEmptyMetadataUpdate(value)).toBe(true)
  })

  it.each([undefined, { erp_id: "1" }, { bundle: "" }])(
    "is false for %p",
    (value) => {
      expect(isEmptyMetadataUpdate(value)).toBe(false)
    }
  )
})

describe("protectBundleUpdate", () => {
  it.each([null, {}])(
    "drops metadata %p so the marker isn't erased",
    (metadata) => {
      const result = protectBundleUpdate(
        { id: "prod_kit", title: "New", metadata },
        aBundle
      )

      expect(result).toEqual({ id: "prod_kit", title: "New" })
      expect(result).not.toHaveProperty("metadata")
    }
  )

  it("keeps a non-empty metadata value (the base service merges it)", () => {
    const update = { metadata: { erp_id: "1" } }
    expect(protectBundleUpdate(update, aBundle)).toEqual(update)
  })

  it("keeps an update without metadata untouched", () => {
    const update = { title: "New" }
    expect(protectBundleUpdate(update, aBundle)).toEqual(update)
  })

  it("rejects a variant without an id, which would add a second variant", () => {
    expect(() =>
      protectBundleUpdate({ variants: [{ id: "var_1" }, {}] }, aBundle)
    ).toThrow(/exactly one variant/)
  })

  it("allows updating the existing variant by id", () => {
    const update = { variants: [{ id: "var_1" }] }
    expect(protectBundleUpdate(update, aBundle)).toEqual(update)
  })

  it.each(["", null])(
    "rejects naming the bundle marker with %p, which would delete it",
    (value) => {
      expect(() =>
        protectBundleUpdate({ metadata: { bundle: value } }, aBundle)
      ).toThrow(/bundle marker.*can't be removed/)
    }
  )

  it("allows writing real components to the marker (what the bundle workflows do)", () => {
    const update = { metadata: { bundle: { components: validComponents } } }
    expect(protectBundleUpdate(update, aBundle)).toEqual(update)
  })

  it("does not modify the input object", () => {
    const update = { metadata: null as any, title: "x" }
    protectBundleUpdate(update, aBundle)
    expect(update.metadata).toBeNull()
  })
})

describe("assertBundleKeepsSingleVariant", () => {
  it("rejects adding a variant to a bundle that already has one", () => {
    expect(() =>
      assertBundleKeepsSingleVariant(
        [{ ...aBundle, metadata: bundleMetadata, variantCount: 1 }],
        { prod_kit: 1 }
      )
    ).toThrow(/"Camera kit" \(prod_kit\).*exactly one variant/)
  })

  it("allows the bundle's own first variant (bundle creation)", () => {
    expect(() =>
      assertBundleKeepsSingleVariant(
        [{ ...aBundle, metadata: bundleMetadata, variantCount: 0 }],
        { prod_kit: 1 }
      )
    ).not.toThrow()
  })

  it("rejects creating two variants at once for a new bundle", () => {
    expect(() =>
      assertBundleKeepsSingleVariant(
        [{ ...aBundle, metadata: bundleMetadata, variantCount: 0 }],
        { prod_kit: 2 }
      )
    ).toThrow(/exactly one variant/)
  })

  it("does not limit normal products", () => {
    expect(() =>
      assertBundleKeepsSingleVariant(
        [{ id: "prod_x", title: "Shirt", metadata: null, variantCount: 3 }],
        { prod_x: 5 }
      )
    ).not.toThrow()
  })
})

describe("assertNoBundleVariants", () => {
  it("rejects deleting a bundle's variant and names the bundle", () => {
    expect(() =>
      assertNoBundleVariants([
        { id: "var_k", product: { ...aBundle, metadata: bundleMetadata } },
      ])
    ).toThrow(/"Camera kit" \(prod_kit\).*Delete the bundle instead/)
  })

  it("allows deleting variants of normal products", () => {
    expect(() =>
      assertNoBundleVariants([
        {
          id: "var_x",
          product: { id: "prod_x", title: "Shirt", metadata: null },
        },
        { id: "var_y", product: null },
      ])
    ).not.toThrow()
  })
})

describe("getBundleVariantId", () => {
  it("returns the id of the only variant", () => {
    expect(
      getBundleVariantId({ id: "prod_kit", variants: [{ id: "var_1" }] })
    ).toEqual("var_1")
  })

  it.each([
    ["two variants", [{ id: "var_1" }, { id: "var_2" }]],
    ["no variants", []],
    ["missing variants", undefined],
  ])("throws for %s instead of picking one", (_label, variants) => {
    expect(() => getBundleVariantId({ id: "prod_kit", variants })).toThrow(
      /must have exactly 1/
    )
  })
})
