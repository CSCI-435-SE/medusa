import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { StepResponse, createStep } from "@medusajs/framework/workflows-sdk"
import {
  BundleComponentInput,
  BundleInventoryLink,
  getBundleComponents,
  getBundleVariantId,
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
    if (!components) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Product with id: ${input.id} is not a bundle`
      )
    }

    // A bundle must have exactly one variant. Fail loudly instead of assuming
    // the first one is the right one (older data or direct module calls could
    // have given it more).
    const variantId = getBundleVariantId(product as any)
    const variant = product.variants!.find((v: any) => v.id === variantId)!

    return new StepResponse({
      product_id: product.id as string,
      variant_id: variantId,
      components: components as BundleComponentInput[],
      links: (variant.inventory_items ?? []).map((link: any) => ({
        inventory_item_id: link.inventory_item_id,
        required_quantity: link.required_quantity,
      })) as BundleInventoryLink[],
    })
  }
)
