import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { StepResponse, createStep } from "@medusajs/framework/workflows-sdk"
import {
  BundleComponentInput,
  BundleInventoryLink,
  buildBundleInventoryLinks,
  validateBundleComponents,
} from "../utils/bundle"

/**
 * The components of a bundle to validate and turn into inventory links.
 */
export type PrepareBundleStepInput = {
  /**
   * The bundle components. When omitted (for example when an update only
   * changes the title), nothing is validated and `links` is `null`.
   */
  components?: BundleComponentInput[]
}

export const prepareBundleStepId = "prepare-bundle"
/**
 * This step loads the component variants of a bundle, validates them (see
 * `validateBundleComponents`) and returns the inventory links the bundle
 * variant needs. It makes no changes, so it has no compensation.
 */
export const prepareBundleStep = createStep(
  prepareBundleStepId,
  async (input: PrepareBundleStepInput, { container }) => {
    if (!input.components) {
      return new StepResponse({
        links: null as BundleInventoryLink[] | null,
      })
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    // Load every requested variant with the data the validation needs: stock
    // tracking flag, the owning product's metadata (to detect nested bundles)
    // and the inventory links.
    const { data: variants } = await query.graph({
      entity: "variants",
      fields: [
        "id",
        "manage_inventory",
        "product.id",
        "product.metadata",
        "inventory_items.inventory_item_id",
        "inventory_items.required_quantity",
      ],
      filters: { id: input.components.map((c) => c.variant_id) },
    })

    // Throws a MedusaError (4xx) on the first problem found.
    validateBundleComponents(input.components, variants as any)

    return new StepResponse({
      links: buildBundleInventoryLinks(
        input.components,
        variants as any
      ) as BundleInventoryLink[] | null,
    })
  }
)
