import { z } from "zod"
import {
  AdminGetProductParams,
  CreateProduct,
  UpdateProduct,
} from "../products/validators"

/**
 * Query params for the bundle routes. A bundle is a product, so we accept the
 * same `fields` selection as the product routes.
 */
export const AdminGetBundleParams = AdminGetProductParams

/**
 * One component of a bundle: a variant and how many of it are in one bundle.
 * Quantity must be a whole number of at least 1 (AC 7: "quantity is 0 or less").
 * The remaining rules (existence, inventory tracking, duplicates, no nested
 * bundles) need the database and are checked in the workflow.
 */
const BundleComponent = z
  .object({
    variant_id: z.string(),
    quantity: z.number().int().min(1),
  })
  .strict()

// Bundles have at least 2 components (AC 7).
const BundleComponents = z.array(BundleComponent).min(2)

/**
 * The bundle's own price for a currency. Negative or missing amounts are
 * rejected (AC 7: "a price is missing or negative").
 */
const BundlePrice = z.object({
  currency_code: z.string(),
  amount: z.number().min(0),
  min_quantity: z.number().nullish(),
  max_quantity: z.number().nullish(),
  rules: z.record(z.string(), z.string()).optional(),
})

// At least one price is required, otherwise the bundle can't be bought.
const BundlePrices = z.array(BundlePrice).min(1)

export type AdminCreateBundleType = z.infer<typeof AdminCreateBundle>
/**
 * Create body: the normal product fields (title, description, images,
 * categories, ...) plus `components` and `prices`. `variants` and `options` are
 * not accepted because the workflow creates the single bundle variant itself.
 */
export const AdminCreateBundle = CreateProduct.omit({
  variants: true,
  options: true,
}).extend({
  components: BundleComponents,
  prices: BundlePrices,
})

export type AdminUpdateBundleType = z.infer<typeof AdminUpdateBundle>
/**
 * Update body: any product field, and optionally new `components` / `prices`.
 */
export const AdminUpdateBundle = UpdateProduct.omit({
  variants: true,
  options: true,
}).extend({
  components: BundleComponents.optional(),
  prices: BundlePrices.optional(),
})
