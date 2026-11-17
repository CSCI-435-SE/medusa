import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { StepResponse, createStep } from "@medusajs/framework/workflows-sdk"
import { assertNoBundleUsesVariants } from "../utils/bundle"

/**
 * The variants that are about to be deleted.
 */
export type ValidateNoBundleUsageStepInput = {
  /**
   * Variants about to be deleted (directly, or because their product is).
   */
  variant_ids: string[]
  /**
   * Bundle products that are deleted in the same request. They are allowed to
   * go away together with their components.
   */
  ignore_product_ids?: string[]
}

// Products are read in pages so a large catalog doesn't load in one query.
const PAGE_SIZE = 500

export const validateNoBundleUsageStepId = "validate-no-bundle-usage"
/**
 * This step blocks the deletion of a product or variant that is a component of
 * a bundle. It throws a `NOT_ALLOWED` error naming every bundle that uses it.
 * Run it BEFORE anything is deleted. It makes no changes, so it has no
 * compensation.
 */
export const validateNoBundleUsageStep = createStep(
  validateNoBundleUsageStepId,
  async (input: ValidateNoBundleUsageStepInput, { container }) => {
    if (!input.variant_ids?.length) {
      return new StepResponse(void 0)
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    // Bundles keep their components in product.metadata, which can't be
    // searched by variant id in the database, so we read the products' metadata
    // page by page and check it in memory.
    // This is fine at current catalog sizes; if it becomes slow, a dedicated
    // link between bundle and component variant would allow a direct lookup.
    let skip = 0
    for (;;) {
      const { data: products } = await query.graph({
        entity: "product",
        fields: ["id", "title", "metadata"],
        pagination: { skip, take: PAGE_SIZE, order: { id: "ASC" } },
      })

      // Throws NOT_ALLOWED listing the bundles when any uses the variants.
      assertNoBundleUsesVariants(
        products as any,
        input.variant_ids,
        input.ignore_product_ids
      )

      if (products.length < PAGE_SIZE) {
        break
      }
      skip += PAGE_SIZE
    }

    return new StepResponse(void 0)
  }
)
