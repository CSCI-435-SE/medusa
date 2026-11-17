import { MedusaError } from "@medusajs/framework/utils"
import {
  assertNoBundleUsesVariants,
  buildBundleInventoryLinks,
  findBundlesUsingVariants,
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
})
