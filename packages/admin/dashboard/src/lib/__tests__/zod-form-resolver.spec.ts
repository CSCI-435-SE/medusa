import { zodResolver } from "@hookform/resolvers/zod"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { zodFormResolver } from "../zod-form-resolver"

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  components: z
    .array(
      z.object({
        variant_id: z.string().min(1, "Pick a variant"),
        quantity: z.number().int().min(1, "Quantity must be at least 1"),
      })
    )
    .min(2, "A bundle needs at least 2 components"),
})

type Values = z.infer<typeof schema>

const resolver = zodFormResolver<Values>(schema)

const context = {
  fields: {},
  shouldUseNativeValidation: false,
} as any

const valid = {
  title: "Camera kit",
  components: [
    { variant_id: "variant_camera", quantity: 1 },
    { variant_id: "variant_lens", quantity: 2 },
  ],
}

describe("zodFormResolver", () => {
  it("returns the parsed values and no errors when the input is valid", async () => {
    const result = await resolver(valid, undefined, context)

    expect(result.errors).toEqual({})
    expect(result.values).toEqual(valid)
  })

  it("puts a field's message where react-hook-form reads it", async () => {
    const result = await resolver({ ...valid, title: "" }, undefined, context)

    expect(result.values).toEqual({})
    expect((result.errors as any).title).toEqual({
      type: "too_small",
      message: "Title is required",
    })
  })

  it("puts an array item's message under its index and field name", async () => {
    const result = await resolver(
      {
        ...valid,
        components: [
          { variant_id: "variant_camera", quantity: 0 },
          { variant_id: "variant_lens", quantity: 2 },
        ],
      },
      undefined,
      context
    )

    expect((result.errors as any).components[0].quantity).toEqual({
      type: "too_small",
      message: "Quantity must be at least 1",
    })
  })

  it("puts an array-level message on the array itself", async () => {
    const result = await resolver(
      { ...valid, components: [valid.components[0]] },
      undefined,
      context
    )

    expect((result.errors as any).components.message).toEqual(
      "A bundle needs at least 2 components"
    )
  })

  it("keeps an array-level message and an item message side by side", async () => {
    const result = await resolver(
      { ...valid, components: [{ variant_id: "", quantity: 1 }] },
      undefined,
      context
    )

    const components = (result.errors as any).components

    expect(components.message).toEqual("A bundle needs at least 2 components")
    expect(components[0].variant_id.message).toEqual("Pick a variant")
  })

  it("keeps the first message when a field has more than one", async () => {
    const twoRules = z.object({
      handle: z
        .string()
        .min(2, "Too short")
        .regex(/^[a-z]+$/, "Letters only"),
    })

    const result = await zodFormResolver<z.infer<typeof twoRules>>(twoRules)(
      { handle: "1" },
      undefined,
      context
    )

    expect((result.errors as any).handle.message).toEqual("Too short")
  })

  /*
   * Why this resolver exists at all. @hookform/resolvers 3.4.2 predates zod 4
   * and reads `error.errors`, which zod 4 renamed to `issues`, so it rethrows
   * the ZodError instead of handing react-hook-form any errors. A form that
   * uses it can never display a validation message (issue #114, AC 3). This
   * test fails the day the dependency is upgraded, which is the signal to drop
   * the resolver and use the upstream one again.
   */
  it("documents why the stock zodResolver cannot be used here", async () => {
    await expect(
      (async () =>
        zodResolver(schema as any)(
          { ...valid, title: "" },
          undefined,
          context
        ))()
    ).rejects.toThrow(z.ZodError)
  })
})
