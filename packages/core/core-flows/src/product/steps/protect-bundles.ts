import type { IProductModuleService } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { StepResponse, createStep } from "@medusajs/framework/workflows-sdk"
import {
  assertBundleKeepsSingleVariant,
  assertNoBundleVariants,
  isBundleMetadata,
  isEmptyMetadataUpdate,
  protectBundleUpdate,
} from "../utils/bundle"
import type { UpdateProductsStepInput } from "./update-products"

/*
 * Steps that protect EXISTING bundles from the plain product and variant
 * workflows (issue #112 review follow-up). A bundle relies on two things:
 * `product.metadata.bundle` is never lost, and the product has exactly one
 * variant. All three steps only read data, so none needs a compensation.
 */

export const protectBundleProductsStepId = "protect-bundle-products"
/**
 * This step runs before a product update is applied. For every product in the
 * update that is a bundle it:
 *
 * - drops a `null` or `{}` metadata value, which the base service would use to
 *   erase the bundle marker (other metadata keys are still merged), and
 * - rejects variants without an ID, which would add a second variant.
 *
 * It returns the input to use for the update. Products that are not bundles
 * are passed through unchanged, so existing behavior is not affected.
 */
export const protectBundleProductsStep = createStep(
  protectBundleProductsStepId,
  async (data: UpdateProductsStepInput, { container }) => {
    const service = container.resolve<IProductModuleService>(Modules.PRODUCT)

    // The input has two shapes (products list, or selector + update). Typing
    // every return as the full union keeps the step's output type consistent.
    const respond = (value: UpdateProductsStepInput) =>
      new StepResponse(value as UpdateProductsStepInput)

    if ("products" in data) {
      const ids = data.products.map((p) => p.id).filter(Boolean) as string[]
      if (!ids.length) {
        return respond(data)
      }

      const found = await service.listProducts(
        { id: ids },
        { select: ["id", "title", "metadata"], take: null }
      )
      const bundles = new Map(
        found
          .filter((product) => isBundleMetadata(product.metadata))
          .map((product) => [product.id, product])
      )

      if (!bundles.size) {
        return respond(data)
      }

      return respond({
        products: data.products.map((product) =>
          product.id && bundles.has(product.id)
            ? protectBundleUpdate(product, bundles.get(product.id)!)
            : product
        ),
      })
    }

    // Selector form: ONE update is applied to every matching product.
    const found = await service.listProducts(data.selector, {
      select: ["id", "title", "metadata"],
      take: null,
    })
    const bundles = found.filter((product) => isBundleMetadata(product.metadata))

    if (!bundles.length) {
      return respond(data)
    }

    // Every match is a bundle (the normal case: the admin route selects one
    // product by id). Make the shared update safe: this rejects variants
    // without an ID and drops a null/{} metadata value.
    if (bundles.length === found.length) {
      return respond({
        selector: data.selector,
        update: protectBundleUpdate(data.update, bundles[0]),
      })
    }

    // Mixed match. Rejects variants without an ID, and the marker key.
    protectBundleUpdate(data.update, bundles[0])

    // The same update also goes to the non-bundle products that match, so we
    // can't silently drop it for the bundles only. Reject it instead.
    if (
      data.update.metadata !== undefined &&
      isEmptyMetadataUpdate(data.update.metadata)
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Metadata can't be cleared on products that include the bundle "${bundles[0].title}" (${bundles[0].id}).`
      )
    }

    return respond(data)
  }
)

/**
 * The variants about to be created.
 */
export type ValidateBundleVariantsStepInput = {
  /**
   * How many variants the request adds, per product ID.
   */
  new_variants_by_product: Record<string, number>
}

export const validateBundleVariantsStepId = "validate-bundle-variants"
/**
 * This step blocks creating a variant for a bundle that already has one. It
 * lets the bundle's own first variant through, so creating a bundle works.
 */
export const validateBundleVariantsStep = createStep(
  validateBundleVariantsStepId,
  async (input: ValidateBundleVariantsStepInput, { container }) => {
    const productIds = Object.keys(input.new_variants_by_product)
    if (!productIds.length) {
      return new StepResponse(void 0)
    }

    const service = container.resolve<IProductModuleService>(Modules.PRODUCT)
    const products = await service.listProducts(
      { id: productIds },
      {
        select: ["id", "title", "metadata"],
        relations: ["variants"],
        take: null,
      }
    )

    assertBundleKeepsSingleVariant(
      products.map((product) => ({
        id: product.id,
        title: product.title,
        metadata: product.metadata,
        variantCount: product.variants?.length ?? 0,
      })),
      input.new_variants_by_product
    )

    return new StepResponse(void 0)
  }
)

/**
 * The variants about to be deleted.
 */
export type ValidateNoBundleVariantDeletionStepInput = {
  /**
   * The IDs of the variants to delete.
   */
  variant_ids: string[]
}

export const validateNoBundleVariantDeletionStepId =
  "validate-no-bundle-variant-deletion"
/**
 * This step blocks deleting a variant that belongs to a bundle, which would
 * leave the bundle without its variant. Delete the bundle instead. Run it
 * before anything is deleted.
 */
export const validateNoBundleVariantDeletionStep = createStep(
  validateNoBundleVariantDeletionStepId,
  async (
    input: ValidateNoBundleVariantDeletionStepInput,
    { container }
  ) => {
    if (!input.variant_ids?.length) {
      return new StepResponse(void 0)
    }

    const service = container.resolve<IProductModuleService>(Modules.PRODUCT)
    const variants = await service.listProductVariants(
      { id: input.variant_ids },
      { select: ["id", "product.id", "product.title", "product.metadata"], relations: ["product"], take: null }
    )

    assertNoBundleVariants(variants as any)

    return new StepResponse(void 0)
  }
)
