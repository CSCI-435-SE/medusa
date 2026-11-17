import { ProductTypes } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  WorkflowData,
  WorkflowResponse,
  createHook,
  createWorkflow,
  transform,
} from "@medusajs/framework/workflows-sdk"
import { batchLinksWorkflow } from "../../common/workflows/batch-links"
import { loadBundleStep } from "../steps/load-bundle"
import { prepareBundleStep } from "../steps/prepare-bundle"
import {
  BUNDLE_METADATA_KEY,
  BundleComponentInput,
  BundleInventoryLink,
} from "../utils/bundle"
import { updateProductsWorkflow } from "./update-products"

/**
 * The data to update a bundle. Every field is optional.
 */
export type UpdateBundleWorkflowInput = {
  /**
   * The ID of the bundle product.
   */
  id: string
  update: Omit<ProductTypes.UpdateProductDTO, "variants" | "options"> & {
    /**
     * Replaces the full list of components (and quantities).
     */
    components?: BundleComponentInput[]
    /**
     * Replaces the bundle's prices.
     */
    prices?: {
      currency_code: string
      amount: number
      min_quantity?: number | null
      max_quantity?: number | null
      rules?: Record<string, string>
    }[]
  }
}

export const updateBundleWorkflowId = "update-bundle"
/**
 * This workflow updates a bundle's product fields, components, quantities and
 * prices.
 *
 * When components change, the bundle variant's inventory links are re-built:
 * links that are no longer needed are removed, new ones are added and links
 * whose required quantity changed are updated. Because the bundle has its own
 * prices, a component's price changing never changes the bundle's price.
 *
 * @example
 * const { result } = await updateBundleWorkflow(container).run({
 *   input: {
 *     id: "prod_bundle",
 *     update: {
 *       title: "Camera kit v2",
 *       prices: [{ currency_code: "usd", amount: 849 }],
 *     },
 *   },
 * })
 *
 * @summary
 *
 * Update a product bundle.
 *
 * @property hooks.bundleUpdated - Executed after the bundle is updated.
 */
export const updateBundleWorkflow = createWorkflow(
  updateBundleWorkflowId,
  (input: WorkflowData<UpdateBundleWorkflowInput>) => {
    // The current bundle (throws NOT_FOUND if it doesn't exist or isn't one).
    const current = loadBundleStep({ id: input.id })

    // Validates new components (if any) before anything is changed.
    const componentsToValidate = transform(
      { input },
      (data) => data.input.update.components
    )
    const prepared = prepareBundleStep({ components: componentsToValidate })

    // Product fields + the bundle's marker metadata + prices on its variant.
    const productUpdate = transform({ input, current }, (data) => {
      const { components, prices, metadata, ...productFields } =
        data.input.update

      return {
        selector: { id: data.input.id },
        update: {
          ...productFields,
          // Always write the marker back: new components if sent, otherwise
          // the existing ones. Caller metadata can never remove the marker.
          metadata: {
            ...(metadata ?? {}),
            [BUNDLE_METADATA_KEY]: {
              components: components ?? data.current.components,
            },
          },
          ...(prices
            ? { variants: [{ id: data.current.variant_id, prices }] }
            : {}),
        },
      }
    })

    const updatedProducts = updateProductsWorkflow.runAsStep({
      input: productUpdate as any,
    })

    // Compare the links the bundle variant has now with the links it needs.
    const linkChanges = transform({ current, prepared }, (data) => {
      if (!data.prepared.links) {
        return { create: [], update: [], delete: [] }
      }

      const variantRef = { variant_id: data.current.variant_id }
      const existing = new Map<string, BundleInventoryLink>(
        data.current.links.map((link) => [link.inventory_item_id, link])
      )
      const wanted = new Map<string, BundleInventoryLink>(
        data.prepared.links.map((link) => [link.inventory_item_id, link])
      )

      return {
        // needed but not linked yet
        create: [...wanted.values()]
          .filter((link) => !existing.has(link.inventory_item_id))
          .map((link) => ({
            [Modules.PRODUCT]: variantRef,
            [Modules.INVENTORY]: { inventory_item_id: link.inventory_item_id },
            data: { required_quantity: link.required_quantity },
          })),
        // linked and still needed, but with a different quantity
        update: [...wanted.values()]
          .filter(
            (link) =>
              existing.has(link.inventory_item_id) &&
              existing.get(link.inventory_item_id)!.required_quantity !==
                link.required_quantity
          )
          .map((link) => ({
            [Modules.PRODUCT]: variantRef,
            [Modules.INVENTORY]: { inventory_item_id: link.inventory_item_id },
            data: { required_quantity: link.required_quantity },
          })),
        // linked but no longer needed
        delete: [...existing.values()]
          .filter((link) => !wanted.has(link.inventory_item_id))
          .map((link) => ({
            [Modules.PRODUCT]: variantRef,
            [Modules.INVENTORY]: { inventory_item_id: link.inventory_item_id },
          })),
      }
    })

    batchLinksWorkflow.runAsStep({ input: linkChanges as any })

    const bundle = transform({ updatedProducts }, (data) => {
      return data.updatedProducts[0]
    })

    const bundleUpdated = createHook("bundleUpdated", { bundle })

    return new WorkflowResponse(bundle, { hooks: [bundleUpdated] })
  }
)
