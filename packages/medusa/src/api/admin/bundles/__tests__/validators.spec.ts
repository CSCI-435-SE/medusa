import { AdminCreateBundle, AdminUpdateBundle } from "../validators"

/*
 * The admin dashboard's bundle form builds its request with
 * `normalizeBundleFormValues`
 * (packages/admin/dashboard/src/routes/products/common/bundles.ts). The
 * payloads below are what it produces, copied from the assertions in
 * `bundle-create-form.spec.tsx` and `bundle-edit-form.spec.tsx`.
 *
 * The dashboard cannot import this validator and this package cannot import
 * the dashboard, so the shape is pinned on both sides: there it is the object
 * the form sends, here it is the object the route accepts. A change to one that
 * is not made in the other fails on one side or the other, instead of only
 * showing up as a 400 in a running admin (issue #114).
 */

const createPayload = {
  status: "published",
  is_giftcard: false,
  title: "Camera kit",
  subtitle: undefined,
  description: "Everything you need",
  handle: "camera-kit",
  discountable: true,
  thumbnail: "https://example.com/thumb.jpg",
  images: [{ url: "https://example.com/other.jpg" }],
  categories: [{ id: "pcat_cameras" }],
  tags: [{ id: "ptag_new" }],
  sales_channels: [{ id: "sc_1" }],
  collection_id: "pcol_1",
  shipping_profile_id: undefined,
  type_id: undefined,
  origin_country: undefined,
  material: undefined,
  mid_code: undefined,
  hs_code: undefined,
  width: undefined,
  length: undefined,
  height: undefined,
  weight: undefined,
  components: [
    { variant_id: "variant_camera", quantity: 1 },
    { variant_id: "variant_lens", quantity: 2 },
  ],
  prices: [
    { currency_code: "usd", amount: 899 },
    { currency_code: "eur", amount: 849, rules: { region_id: "reg_europe" } },
  ],
}

describe("the bundle routes' validators", () => {
  it("accepts the body the admin bundle create form sends", () => {
    const result = AdminCreateBundle.safeParse(createPayload)

    if (!result.success) {
      throw new Error(JSON.stringify(result.error.issues, null, 2))
    }

    expect(result.success).toBe(true)
  })

  it("accepts the body the admin bundle edit form sends", () => {
    const result = AdminUpdateBundle.safeParse(createPayload)

    if (!result.success) {
      throw new Error(JSON.stringify(result.error.issues, null, 2))
    }

    expect(result.success).toBe(true)
  })

  /*
   * The form checks these three before it sends anything (issue #114, AC 3).
   * They are here too so that the one place the rules can't be bypassed keeps
   * them: a client that skips the form still gets a 400.
   */
  it("rejects a bundle with fewer than 2 components", () => {
    const result = AdminCreateBundle.safeParse({
      ...createPayload,
      components: [createPayload.components[0]],
    })

    expect(result.success).toBe(false)
  })

  it("rejects a component quantity of 0", () => {
    const result = AdminCreateBundle.safeParse({
      ...createPayload,
      components: [
        { variant_id: "variant_camera", quantity: 0 },
        createPayload.components[1],
      ],
    })

    expect(result.success).toBe(false)
  })

  it("rejects a bundle with no prices", () => {
    const result = AdminCreateBundle.safeParse({
      ...createPayload,
      prices: [],
    })

    expect(result.success).toBe(false)
  })

  it("rejects variants and options, which the workflow builds itself", () => {
    const withVariants = AdminCreateBundle.safeParse({
      ...createPayload,
      variants: [{ title: "Camera kit" }],
    })

    expect(withVariants.success).toBe(false)
  })
})
