import { MedusaError } from "@medusajs/framework/utils"
import {
  assertNoBundleUsesVariants,
  assertNoBundleVariants,
  buildBundleInventoryLinks,
  getBundleVariantId,
  isEmptyMetadataUpdate,
  protectBundleUpdate,
  validateBundleComponents,
} from "../bundle"

// Tests added for the D6 mutation-testing deliverable (issue #112).
//
// The first Stryker run on bundle.ts scored 90.15%. Of the 20 mutants that were
// not killed, 14 were real test gaps: error messages that were never checked
// beyond their type (so blanking the ", " list separator went unnoticed) and
// a few input edge cases (missing optional fields, non-object metadata).
// Each test below names the mutants (by line in bundle.ts) that it kills.

// Runs `fn` and returns the error it throws (or undefined if it doesn't), so
// a test can check the error type and the full message.
function thrown(fn: () => unknown): any {
  try {
    fn()
  } catch (e) {
    return e
  }
  return undefined
}

// A variant that is a valid bundle component.
const validVariant = (id: string) => ({
  id,
  manage_inventory: true,
  inventory_items: [{ inventory_item_id: `inv_${id}`, required_quantity: 1 }],
})

// Product metadata that marks a product as a bundle containing `variantId`.
const bundleMetadata = (variantId: string) => ({
  bundle: { components: [{ variant_id: variantId, quantity: 1 }] },
})

describe("validateBundleComponents error messages", () => {
  // Kills the StringLiteral mutant on line 120: the ", " separator between
  // the repeated variants. One duplicate never shows the separator, so two
  // different duplicates are needed.
  it("lists every duplicated variant, separated by commas", () => {
    const error = thrown(() =>
      validateBundleComponents(
        [
          { variant_id: "a", quantity: 1 },
          { variant_id: "a", quantity: 1 },
          { variant_id: "b", quantity: 1 },
          { variant_id: "b", quantity: 1 },
        ],
        []
      )
    )

    expect(error).toBeInstanceOf(MedusaError)
    expect(error.message).toContain("listed more than once: a, b.")
  })

  // Kills the ArrowFunction mutant on line 133 (the map that picks the variant
  // id) and the StringLiteral mutant on line 134 (the separator).
  it("names every variant with an invalid quantity", () => {
    const error = thrown(() =>
      validateBundleComponents(
        [
          { variant_id: "a", quantity: 0 },
          { variant_id: "b", quantity: 1.5 },
        ],
        [validVariant("a"), validVariant("b")]
      )
    )

    expect(error).toBeInstanceOf(MedusaError)
    expect(error.message).toContain("Invalid for variants: a, b.")
  })

  // Kills the StringLiteral mutant on line 146 (separator of missing variants).
  it("names every variant that was not found", () => {
    const error = thrown(() =>
      validateBundleComponents(
        [
          { variant_id: "a", quantity: 1 },
          { variant_id: "b", quantity: 1 },
        ],
        []
      )
    )

    expect(error.type).toBe(MedusaError.Types.NOT_FOUND)
    expect(error.message).toContain("were not found: a, b.")
  })
})

describe("validateBundleComponents optional fields", () => {
  const components = [
    { variant_id: "a", quantity: 1 },
    { variant_id: "b", quantity: 1 },
  ]

  // Kills the OptionalChaining mutant on line 155. A variant that has no
  // inventory_items at all must be rejected with a MedusaError, not crash with
  // a TypeError when `.length` is read from undefined.
  it("rejects a variant with no inventory items as a normal error", () => {
    const error = thrown(() =>
      validateBundleComponents(components, [
        validVariant("a"),
        { id: "b", manage_inventory: true },
      ])
    )

    expect(error).toBeInstanceOf(MedusaError)
    expect(error.type).toBe(MedusaError.Types.INVALID_DATA)
    expect(error.message).toContain("doesn't track inventory")
  })

  // Kills the OptionalChaining mutant on line 163. A loaded variant without a
  // `product` is still a valid component; reading `.metadata` of undefined must
  // not throw.
  it("accepts variants that were loaded without their product", () => {
    expect(
      thrown(() =>
        validateBundleComponents(components, [
          validVariant("a"),
          validVariant("b"),
        ])
      )
    ).toBeUndefined()
  })
})

describe("buildBundleInventoryLinks missing data", () => {
  // Kills the OptionalChaining mutant on line 192 (`variant?.`): a component
  // whose variant was not loaded contributes no links instead of crashing.
  it("skips a component whose variant was not loaded", () => {
    const links = buildBundleInventoryLinks(
      [
        { variant_id: "missing", quantity: 1 },
        { variant_id: "a", quantity: 2 },
      ],
      [validVariant("a")]
    )

    expect(links).toEqual([
      { inventory_item_id: "inv_a", required_quantity: 2 },
    ])
  })

  // Kills the NoCoverage ArrayDeclaration mutant on line 192 (the `?? []`
  // fallback was never reached): a variant with no inventory_items gives no
  // links.
  it("gives no links for a variant without inventory items", () => {
    expect(
      buildBundleInventoryLinks(
        [{ variant_id: "a", quantity: 1 }],
        [{ id: "a", manage_inventory: true }]
      )
    ).toEqual([])
  })
})

describe("bundle usage and variant errors list every item", () => {
  // Kills the StringLiteral mutant on line 257: the ", " between bundles.
  it("names every bundle that uses the variant", () => {
    const error = thrown(() =>
      assertNoBundleUsesVariants(
        [
          { id: "b1", title: "A", metadata: bundleMetadata("v1") },
          { id: "b2", title: "B", metadata: bundleMetadata("v1") },
        ],
        ["v1"]
      )
    )

    expect(error.type).toBe(MedusaError.Types.NOT_ALLOWED)
    expect(error.message).toContain(`"A" (b1), "B" (b2)`)
  })

  // Kills the StringLiteral mutant on line 398: the ", " between bundles.
  it("names every bundle whose variant is being deleted", () => {
    const error = thrown(() =>
      assertNoBundleVariants([
        {
          id: "v1",
          product: { id: "p1", title: "A", metadata: bundleMetadata("x") },
        },
        {
          id: "v2",
          product: { id: "p2", title: "B", metadata: bundleMetadata("y") },
        },
      ])
    )

    expect(error.message).toContain(`"A" (p1), "B" (p2)`)
  })
})

describe("isEmptyMetadataUpdate edge cases", () => {
  // Kills the LogicalOperator mutant on line 279 (&& changed to ||): a
  // non-empty object is a real update, not an empty one.
  it("is false for an object with keys", () => {
    expect(isEmptyMetadataUpdate({ a: 1 })).toBe(false)
  })

  // Kills the ConditionalExpression mutant on line 279 (the typeof check
  // forced true): non-object values such as "" and 0 have no keys, so without
  // the typeof check they would wrongly count as empty updates.
  it("is false for non-object values", () => {
    expect(isEmptyMetadataUpdate("")).toBe(false)
    expect(isEmptyMetadataUpdate(0)).toBe(false)
  })
})

describe("protectBundleUpdate marker removal", () => {
  // Kills the ConditionalExpression mutant on line 323. A marker key that is
  // present but explicitly undefined must also be rejected.
  it("rejects an update that sets the bundle marker to undefined", () => {
    const error = thrown(() =>
      protectBundleUpdate(
        { metadata: { bundle: undefined } },
        { id: "prod_1", title: "Bundle" }
      )
    )

    expect(error).toBeInstanceOf(MedusaError)
    expect(error.type).toBe(MedusaError.Types.NOT_ALLOWED)
    expect(error.message).toContain("can't be removed")
  })
})

describe("getBundleVariantId error message", () => {
  // Kills the LogicalOperator mutant on line 415 (`?? 0` changed to `&& 0`).
  // With the mutant, a missing variants list prints "undefined" and a list of
  // two prints "0".
  it("reports 0 variants when the list is missing", () => {
    const error = thrown(() => getBundleVariantId({ id: "prod_1" }))

    expect(error.message).toBe(
      "Bundle prod_1 has 0 variants but must have exactly 1."
    )
  })

  it("reports the real count when there are too many", () => {
    const error = thrown(() =>
      getBundleVariantId({ id: "prod_1", variants: [{ id: "a" }, { id: "b" }] })
    )

    expect(error.message).toBe(
      "Bundle prod_1 has 2 variants but must have exactly 1."
    )
  })
})
