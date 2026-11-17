import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { StepResponse, createStep } from "@medusajs/framework/workflows-sdk"
import {
  BundleComponentInput,
  BundleInventoryLink,
  getBundleComponents,
} from "../utils/bundle"

export type LoadBundleStepInput = {
  /**
   * The ID of the bundle product.
   */
  id: string
}

export const loadBundleStepId = "load-bundle"
/**
 * This step loads an existing bundle: its single variant, its current
 * components and its current inventory links. It throws when the product
 * doesn't exist or isn't a bundle. It makes no changes.
 */
export const loadBundleStep = createStep(
  loadBundleStepId,
  async (input: LoadBundleStepInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const { data } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "metadata",
        "variants.id",
        "variants.inventory_items.inventory_item_id",
        "variants.inventory_items.required_quantity",
      ],
      filters: { id: input.id },
    })

    const product = data[0]
    if (!product) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Bundle with id: ${input.id} was not found`
      )
    }

    const components = getBundleComponents(product.metadata)
    const variant = product.variants?.[0]
    if (!components || !variant) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Product with id: ${input.id} is not a bundle`
      )
    }

    return new StepResponse({
      product_id: product.id as string,
      variant_id: variant.id as string,
      components: components as BundleComponentInput[],
      links: (variant.inventory_items ?? []).map((link: any) => ({
        inventory_item_id: link.inventory_item_id,
        required_quantity: link.required_quantity,
      })) as BundleInventoryLink[],
    })
  }
)
