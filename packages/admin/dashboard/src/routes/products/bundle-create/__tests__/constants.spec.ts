import { describe, expect, it } from "vitest"

import { BUNDLE_CREATE_FORM_DEFAULTS, BundleSchema } from "../constants"

// A bundle that satisfies every rule, used as the starting point so each test
// changes one thing only.
const validBundle = {
  ...BUNDLE_CREATE_FORM_DEFAULTS,
  title: "Camera kit",
  handle: "camera-kit",
  components: [
    { variant_id: "variant_camera", quantity: 1 },
    { variant_id: "variant_lens", quantity: 1 },
  ],
  prices: { usd: 899 },
}

const issuesFor = (input: Record<string, unknown>, path: string) => {
  const result = BundleSchema.safeParse(input)

  if (result.success) {
    return []
  }

  return result.error.issues.filter((issue) => issue.path.join(".") === path)
}

describe("BundleSchema", () => {
  it("accepts a bundle with two components and a price", () => {
    expect(BundleSchema.safeParse(validBundle).success).toBe(true)
  })

  // AC 3: fewer than 2 components blocks saving.
  it("rejects a bundle with one component", () => {
    expect(
      issuesFor(
        { ...validBundle, components: [validBundle.components[0]] },
        "components"
      )
    ).not.toHaveLength(0)
  })

  it("rejects a bundle with no components", () => {
    expect(
      issuesFor({ ...validBundle, components: [] }, "components")
    ).not.toHaveLength(0)
  })

  it("rejects a component with no variant picked", () => {
    expect(
      issuesFor(
        {
          ...validBundle,
          components: [
            { variant_id: "", quantity: 1 },
            { variant_id: "variant_lens", quantity: 1 },
          ],
        },
        "components.0.variant_id"
      )
    ).not.toHaveLength(0)
  })

  it("rejects the same variant listed twice", () => {
    expect(
      issuesFor(
        {
          ...validBundle,
          components: [
            { variant_id: "variant_lens", quantity: 1 },
            { variant_id: "variant_lens", quantity: 2 },
          ],
        },
        "components.1.variant_id"
      )
    ).not.toHaveLength(0)
  })

  // AC 3: a quantity of 0 or less blocks saving.
  it("rejects a quantity of 0", () => {
    expect(
      issuesFor(
        {
          ...validBundle,
          components: [
            { variant_id: "variant_camera", quantity: 0 },
            { variant_id: "variant_lens", quantity: 1 },
          ],
        },
        "components.0.quantity"
      )
    ).not.toHaveLength(0)
  })

  it("rejects a negative quantity", () => {
    expect(
      issuesFor(
        {
          ...validBundle,
          components: [
            { variant_id: "variant_camera", quantity: -1 },
            { variant_id: "variant_lens", quantity: 1 },
          ],
        },
        "components.0.quantity"
      )
    ).not.toHaveLength(0)
  })

  it("rejects a quantity that is not a whole number", () => {
    expect(
      issuesFor(
        {
          ...validBundle,
          components: [
            { variant_id: "variant_camera", quantity: 1.5 },
            { variant_id: "variant_lens", quantity: 1 },
          ],
        },
        "components.0.quantity"
      )
    ).not.toHaveLength(0)
  })

  it("rejects an empty quantity", () => {
    expect(
      issuesFor(
        {
          ...validBundle,
          components: [
            { variant_id: "variant_camera", quantity: "" },
            { variant_id: "variant_lens", quantity: 1 },
          ],
        },
        "components.0.quantity"
      )
    ).not.toHaveLength(0)
  })

  it("accepts a quantity typed into the input as a string", () => {
    expect(
      issuesFor(
        {
          ...validBundle,
          components: [
            { variant_id: "variant_camera", quantity: "3" },
            { variant_id: "variant_lens", quantity: 1 },
          ],
        },
        "components.0.quantity"
      )
    ).toHaveLength(0)
  })

  // AC 3: a missing price blocks saving. The bundle route needs at least one.
  it("rejects a bundle with no price in any currency", () => {
    expect(
      issuesFor({ ...validBundle, prices: {} }, "prices")
    ).not.toHaveLength(0)
  })

  it("rejects a bundle whose only price input is blank", () => {
    expect(
      issuesFor({ ...validBundle, prices: { usd: "" } }, "prices")
    ).not.toHaveLength(0)
  })

  it("accepts a bundle priced in one of several currencies", () => {
    expect(
      issuesFor({ ...validBundle, prices: { usd: "", eur: 849 } }, "prices")
    ).toHaveLength(0)
  })

  it("rejects a negative price", () => {
    expect(
      issuesFor({ ...validBundle, prices: { usd: -1 } }, "prices.usd")
    ).not.toHaveLength(0)
  })

  it("still requires a title and a handle", () => {
    expect(issuesFor({ ...validBundle, title: "" }, "title")).not.toHaveLength(
      0
    )
    expect(
      issuesFor({ ...validBundle, handle: "" }, "handle")
    ).not.toHaveLength(0)
  })
})
