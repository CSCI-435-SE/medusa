import {
  AdditionalData,
  CreateProductWorkflowInputDTO,
} from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import {
  WorkflowData,
  WorkflowResponse,
  createStep,
  createWorkflow,
  transform,
} from "@medusajs/framework/workflows-sdk"
import { useQueryGraphStep } from "../../common"
import { createProductsWorkflow } from "./create-products"

/**
 * The suffix the dashboard pre-fills in the duplicate dialog. A copy must never
 * be saved with it, because store owners should give the copy a real name.
 */
const COPY_SUFFIX_REGEX = /\(copy\)\s*$/i

/**
 * The fields read from the source product. Everything the duplicate needs is
 * fetched in one query, including nested options, variants and prices.
 */
const DUPLICATE_PRODUCT_FIELDS = [
  "id",
  "title",
  "handle",
  "subtitle",
  "description",
  "is_giftcard",
  "discountable",
  "thumbnail",
  "weight",
  "length",
  "height",
  "width",
  "hs_code",
  "origin_country",
  "mid_code",
  "material",
  "metadata",
  "type_id",
  "collection_id",
  "images.url",
  "images.metadata",
  "options.title",
  "options.values.value",
  "tags.id",
  "categories.id",
  "sales_channels.id",
  "shipping_profile.id",
  "variants.title",
  "variants.manage_inventory",
  "variants.allow_backorder",
  "variants.variant_rank",
  "variants.weight",
  "variants.length",
  "variants.height",
  "variants.width",
  "variants.hs_code",
  "variants.origin_country",
  "variants.mid_code",
  "variants.material",
  "variants.metadata",
  "variants.options.value",
  "variants.options.option.title",
  "variants.prices.amount",
  "variants.prices.currency_code",
  "variants.prices.min_quantity",
  "variants.prices.max_quantity",
  "variants.prices.price_rules.attribute",
  "variants.prices.price_rules.value",
]

/**
 * The data to duplicate a product, along with custom data that's passed to the
 * hooks of the underlying create workflow.
 */
export type DuplicateProductWorkflowInput = {
  /**
   * The ID of the product to duplicate.
   */
  id: string
  /**
   * The title of the new product. It must differ from the original title.
   */
  title: string
  /**
   * The handle of the new product. It must not be used by another product.
   */
  handle: string
} & AdditionalData

/**
 * The data to validate before duplicating a product.
 */
export interface ValidateDuplicateProductStepInput {
  /**
   * The products matching the requested ID (empty if it does not exist).
   */
  source: { id: string; title: string; handle: string }[]
  /**
   * The products already using the requested handle.
   */
  handleConflicts: { id: string }[]
  /**
   * The requested title for the copy.
   */
  title: string
  /**
   * The requested handle for the copy.
   */
  handle: string
}

const validateDuplicateProductStepId = "validate-duplicate-product"
/**
 * This step validates a duplicate request. It throws if the source product is
 * missing, if the title was not changed (or still ends with "(Copy)"), or if
 * the handle is already used by another product. Running it before anything is
 * created means a failed validation leaves no data behind.
 */
export const validateDuplicateProductStep = createStep(
  validateDuplicateProductStepId,
  async (data: ValidateDuplicateProductStepInput) => {
    const [source] = data.source

    if (!source) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Product to duplicate was not found"
      )
    }

    const title = data.title.trim()

    // Owner requirement: the copy needs a real name of its own.
    if (
      !title ||
      title.toLowerCase() === source.title.trim().toLowerCase() ||
      COPY_SUFFIX_REGEX.test(title)
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `The duplicated product needs a new title. It cannot be empty, match the original title, or end with "(Copy)".`
      )
    }

    if (data.handleConflicts.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Product with handle "${data.handle}" already exists.`
      )
    }
  }
)

/**
 * The data to build the create payload for the copy.
 */
export interface BuildDuplicateProductInputStepInput {
  /**
   * The fully loaded source product.
   */
  source: Record<string, any>
  /**
   * The title of the copy.
   */
  title: string
  /**
   * The handle of the copy.
   */
  handle: string
}

/**
 * Maps a loaded product to the input of `createProductsWorkflow`.
 *
 * This is a plain function (used inside `transform`) so it stays easy to
 * unit test. Unique variant fields (sku, barcode, ean, upc) are deliberately
 * never copied, and the copy always starts as a draft.
 */
export const buildDuplicateProductInput = (
  data: BuildDuplicateProductInputStepInput
): CreateProductWorkflowInputDTO => {
  const { source } = data

  return {
    title: data.title.trim(),
    handle: data.handle,
    // A copy is never published automatically, whatever the original is.
    status: "draft",
    subtitle: source.subtitle,
    description: source.description,
    is_giftcard: source.is_giftcard,
    discountable: source.discountable,
    thumbnail: source.thumbnail,
    // Images point at the same file URLs as the original.
    images: (source.images ?? []).map((image: any) => ({
      url: image.url,
      metadata: image.metadata,
    })),
    weight: source.weight,
    length: source.length,
    height: source.height,
    width: source.width,
    hs_code: source.hs_code,
    origin_country: source.origin_country,
    mid_code: source.mid_code,
    material: source.material,
    metadata: source.metadata,
    type_id: source.type_id,
    collection_id: source.collection_id,
    tag_ids: (source.tags ?? []).map((tag: any) => tag.id),
    category_ids: (source.categories ?? []).map((category: any) => category.id),
    sales_channels: (source.sales_channels ?? []).map((channel: any) => ({
      id: channel.id,
    })),
    shipping_profile_id: source.shipping_profile?.id,
    options: (source.options ?? []).map((option: any) => ({
      title: option.title,
      values: (option.values ?? []).map((value: any) => value.value),
    })),
    variants: (source.variants ?? []).map((variant: any) => ({
      title: variant.title,
      // sku, barcode, ean and upc are intentionally omitted: they must be
      // unique, so they are left empty on the copy.
      manage_inventory: variant.manage_inventory,
      allow_backorder: variant.allow_backorder,
      variant_rank: variant.variant_rank,
      weight: variant.weight,
      length: variant.length,
      height: variant.height,
      width: variant.width,
      hs_code: variant.hs_code,
      origin_country: variant.origin_country,
      mid_code: variant.mid_code,
      material: variant.material,
      metadata: variant.metadata,
      // { [option title]: option value }
      options: Object.fromEntries(
        (variant.options ?? []).map((value: any) => [
          value.option?.title,
          value.value,
        ])
      ),
      // Every currency and region price is copied, including its rules.
      prices: (variant.prices ?? []).map((price: any) => ({
        amount: price.amount,
        currency_code: price.currency_code,
        min_quantity: price.min_quantity,
        max_quantity: price.max_quantity,
        rules: Object.fromEntries(
          (price.price_rules ?? []).map((rule: any) => [
            rule.attribute,
            rule.value,
          ])
        ),
      })),
    })),
  } as CreateProductWorkflowInputDTO
}

export const duplicateProductWorkflowId = "duplicate-product"
/**
 * This workflow duplicates a product, including its options, variants, prices
 * and relations. It's used by the Duplicate Product Admin API Route.
 *
 * Unique variant fields (SKU, barcode, EAN, UPC) are left empty on the copy,
 * the copy always starts as a draft, and stock levels are not copied: variants
 * that manage inventory get new inventory items without stock, created by
 * `createProductsWorkflow`.
 *
 * @example
 * const { result } = await duplicateProductWorkflow(container)
 * .run({
 *   input: {
 *     id: "prod_123",
 *     title: "Classic Tee - Long Sleeve",
 *     handle: "classic-tee-long-sleeve",
 *   }
 * })
 *
 * @summary
 *
 * Duplicate a product with its options, variants and prices.
 */
export const duplicateProductWorkflow = createWorkflow(
  duplicateProductWorkflowId,
  (input: WorkflowData<DuplicateProductWorkflowInput>) => {
    const { data: source } = useQueryGraphStep({
      entity: "product",
      fields: DUPLICATE_PRODUCT_FIELDS,
      filters: { id: input.id },
    }).config({ name: "get-product-to-duplicate" })

    const { data: handleConflicts } = useQueryGraphStep({
      entity: "product",
      fields: ["id"],
      filters: { handle: input.handle },
    }).config({ name: "get-products-with-handle" })

    validateDuplicateProductStep({
      source,
      handleConflicts,
      title: input.title,
      handle: input.handle,
    })

    const products = transform({ source, input }, (data) => [
      buildDuplicateProductInput({
        source: data.source[0],
        title: data.input.title,
        handle: data.input.handle,
      }),
    ])

    const created = createProductsWorkflow.runAsStep({
      input: {
        products,
        additional_data: input.additional_data,
      },
    })

    return new WorkflowResponse(created)
  }
)
