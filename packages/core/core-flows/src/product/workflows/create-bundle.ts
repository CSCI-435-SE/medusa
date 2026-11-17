import { CreateProductWorkflowInputDTO } from "@medusajs/framework/types"
import {
  WorkflowData,
  WorkflowResponse,
  createHook,
  createWorkflow,
  transform,
} from "@medusajs/framework/workflows-sdk"
import { prepareBundleStep } from "../steps/prepare-bundle"
import { BUNDLE_METADATA_KEY, BundleComponentInput } from "../utils/bundle"
import { createProductsWorkflow } from "./create-products"

/**
 * The data to create a bundle: the normal product fields, the components and
 * the bundle's own prices.
 */
export type CreateBundleWorkflowInput = {
  bundle: Omit<CreateProductWorkflowInputDTO, "variants" | "options"> & {
    /**
     * The variants (and quantities) the bundle is made of. At least 2.
     */
    components: BundleComponentInput[]
    /**
     * The bundle's own prices, one per currency (and optional rules).
     */
    prices: {
      currency_code: string
      amount: number
      min_quantity?: number | null
      max_quantity?: number | null
      rules?: Record<string, string>
    }[]
  }
}

// A bundle is sold as a single variant. Products need an option, so we give it
// a fixed "Default" option with a single value.
const BUNDLE_OPTION_TITLE = "Default"
const BUNDLE_OPTION_VALUE = "Default"

export const createBundleWorkflowId = "create-bundle"
/**
 * This workflow creates a product bundle: a product with its own price that is
 * made of several component variants. Buying it reduces stock of every
 * component.
 *
 * How it works:
 * 1. The components are validated and converted to inventory links.
 * 2. A product with one variant is created through `createProductsWorkflow`.
 *    The variant is linked to the component inventory items (inventory kit), and
 *    the component list is stored in `product.metadata.bundle`.
 *
 * If any step fails, the compensation of `createProductsWorkflow` removes the
 * product, variant, prices and links, so no partial bundle is left behind.
 *
 * @example
 * const { result } = await createBundleWorkflow(container).run({
 *   input: {
 *     bundle: {
 *       title: "Camera kit",
 *       components: [
 *         { variant_id: "variant_camera", quantity: 1 },
 *         { variant_id: "variant_lens", quantity: 1 },
 *       ],
 *       prices: [{ currency_code: "usd", amount: 899 }],
 *     },
 *   },
 * })
 *
 * @summary
 *
 * Create a product bundle.
 *
 * @property hooks.bundleCreated - Executed after the bundle is created.
 */
export const createBundleWorkflow = createWorkflow(
  createBundleWorkflowId,
  (input: WorkflowData<CreateBundleWorkflowInput>) => {
    // Validates the components (throws a 4xx on bad input, before anything is
    // created) and computes the inventory links for the bundle variant.
    const prepared = prepareBundleStep({
      components: input.bundle.components,
    })

    const productsInput = transform({ input, prepared }, (data) => {
      const { components, prices, ...productFields } = data.input.bundle

      return {
        products: [
          {
            ...productFields,
            options: [
              {
                title: BUNDLE_OPTION_TITLE,
                values: [BUNDLE_OPTION_VALUE],
              },
            ],
            // Keep any metadata the caller sent, and add the bundle marker.
            metadata: {
              ...(productFields.metadata ?? {}),
              [BUNDLE_METADATA_KEY]: { components },
            },
            variants: [
              {
                title: productFields.title,
                options: { [BUNDLE_OPTION_TITLE]: BUNDLE_OPTION_VALUE },
                // Stock comes from the components through the inventory links.
                manage_inventory: true,
                prices,
                inventory_items: data.prepared.links ?? [],
              },
            ],
          },
        ],
      }
    })

    const createdProducts = createProductsWorkflow.runAsStep({
      input: productsInput as any,
    })

    const bundle = transform({ createdProducts }, (data) => {
      return data.createdProducts[0]
    })

    const bundleCreated = createHook("bundleCreated", { bundle })

    return new WorkflowResponse(bundle, { hooks: [bundleCreated] })
  }
)
