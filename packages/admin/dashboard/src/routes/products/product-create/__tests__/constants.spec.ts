import { describe, expect, it } from "vitest"

import { ProductCreateSchema } from "../constants"

// The schema has several other required fields, so parsing a bare object will
// always produce errors. These tests only care about whether "handle" is one
// of them, so they look at the issues for that path rather than at whether the
// whole parse succeeded.
const handleIssues = (input: Record<string, unknown>) => {
  const result = ProductCreateSchema.safeParse(input)

  if (result.success) {
    return []
  }

  return result.error.issues.filter((issue) => issue.path[0] === "handle")
}

describe("ProductCreateSchema", () => {
  it("rejects a product with no handle", () => {
    expect(handleIssues({ title: "Winter jacket" })).not.toHaveLength(0)
  })

  it("rejects a product with an empty handle", () => {
    expect(
      handleIssues({ title: "Winter jacket", handle: "" })
    ).not.toHaveLength(0)
  })

  it("accepts a product with a handle", () => {
    expect(
      handleIssues({ title: "Winter jacket", handle: "winter-jacket" })
    ).toHaveLength(0)
  })

  it("still requires a title", () => {
    const result = ProductCreateSchema.safeParse({ handle: "winter-jacket" })

    expect(result.success).toBe(false)

    if (!result.success) {
      const titleIssues = result.error.issues.filter(
        (issue) => issue.path[0] === "title"
      )
      expect(titleIssues).not.toHaveLength(0)
    }
  })
})
