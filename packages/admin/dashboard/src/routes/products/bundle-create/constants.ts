import { z } from "zod"

import { i18n } from "../../../components/utilities/i18n/i18n"
import { castNumber } from "../../../lib/cast-number"
import { MIN_BUNDLE_COMPONENTS } from "../common/bundles"
import { MediaSchema } from "../product-create/constants"

/**
 * One component of a bundle as the form holds it. The quantity is a union
 * because a number input hands back a string while the admin is typing.
 */
const BundleComponentSchema = z.object({
  variant_id: z.string().min(1, i18n.t("products.bundles.errors.component")),
  quantity: z.union([z.string(), z.number()]).refine(
    (value) => {
      const quantity = castNumber(value)
      return Number.isInteger(quantity) && quantity >= 1
    },
    { message: i18n.t("products.bundles.errors.quantity") }
  ),
})

export type BundleComponentSchemaType = z.infer<typeof BundleComponentSchema>

/**
 * The bundle create and edit form.
 *
 * The product fields are the same ones `ProductCreateSchema` declares, so the
 * product form's own sections render them unchanged. What a bundle adds is
 * `components` and `prices`; what it leaves out is `options`, `variants` and
 * `enable_variants`, because the bundle workflow creates the single variant
 * itself and `POST /admin/bundles` rejects them.
 *
 * The three rules of AC 3 (fewer than 2 components, a quantity of 0 or less, a
 * missing price) are all checked here, so the form blocks saving and
 * `<Form.ErrorMessage />` shows which field is wrong.
 */
export const BundleSchema = z
  .object({
    title: z.string().min(1),
    subtitle: z.string().optional(),
    handle: z.string().min(1),
    description: z.string().optional(),
    discountable: z.boolean(),
    type_id: z.string().optional(),
    collection_id: z.string().optional(),
    shipping_profile_id: z.string().optional(),
    categories: z.array(z.string()),
    tags: z.array(z.string()).optional(),
    sales_channels: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
        })
      )
      .optional(),
    origin_country: z.string().optional(),
    material: z.string().optional(),
    width: z.string().optional(),
    length: z.string().optional(),
    height: z.string().optional(),
    weight: z.string().optional(),
    mid_code: z.string().optional(),
    hs_code: z.string().optional(),
    media: z.array(MediaSchema).optional(),
    components: z
      .array(BundleComponentSchema)
      .min(
        MIN_BUNDLE_COMPONENTS,
        i18n.t("products.bundles.errors.minComponents")
      ),
    // Keyed by currency code, or by region ID for a region-scoped price.
    prices: z.record(z.string(), z.union([z.string(), z.number()]).optional()),
  })
  .superRefine((data, ctx) => {
    // The same variant twice is rejected by the API too; saying so here points
    // at the row that has to change.
    const seen = new Set<string>()
    data.components.forEach((component, index) => {
      if (!component.variant_id) {
        return
      }

      if (seen.has(component.variant_id)) {
        ctx.addIssue({
          code: "custom",
          path: ["components", index, "variant_id"],
          message: i18n.t("products.bundles.errors.duplicateComponent"),
        })
      }

      seen.add(component.variant_id)
    })

    const prices = Object.entries(data.prices ?? {})

    prices.forEach(([key, value]) => {
      if (value === "" || value === undefined || value === null) {
        return
      }

      const amount = castNumber(value)

      if (Number.isNaN(amount) || amount < 0) {
        ctx.addIssue({
          code: "custom",
          path: ["prices", key],
          message: i18n.t("products.bundles.errors.price"),
        })
      }
    })

    // A bundle with no price can't be bought, and the route requires one.
    const hasPrice = prices.some(
      ([, value]) => value !== "" && value !== undefined && value !== null
    )

    if (!hasPrice) {
      ctx.addIssue({
        code: "custom",
        path: ["prices"],
        message: i18n.t("products.bundles.errors.minPrices"),
      })
    }
  })

export type BundleSchemaType = z.infer<typeof BundleSchema>

/**
 * An empty component row. Two of them are shown from the start, because a
 * bundle needs at least two.
 */
export const emptyBundleComponent = (): BundleComponentSchemaType => ({
  variant_id: "",
  quantity: "",
})

export const BUNDLE_CREATE_FORM_DEFAULTS: Partial<BundleSchemaType> = {
  discountable: true,
  tags: [],
  sales_channels: [],
  media: [],
  categories: [],
  collection_id: "",
  shipping_profile_id: "",
  description: "",
  handle: "",
  height: "",
  hs_code: "",
  length: "",
  material: "",
  mid_code: "",
  origin_country: "",
  subtitle: "",
  title: "",
  type_id: "",
  weight: "",
  width: "",
  components: [emptyBundleComponent(), emptyBundleComponent()],
  prices: {},
}
