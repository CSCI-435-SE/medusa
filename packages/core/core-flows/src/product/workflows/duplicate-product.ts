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
import { isBundleMetadata } from "../utils/bundle"
import { createProductsWorkflow } from "./create-products"

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
 * The attribute groups a duplicate can copy. Basic product information and
 * options are always copied and are not listed here. Any group left out
 * defaults to being copied, so a request that selects nothing duplicates the
 * whole product.
 */
export type DuplicateProductInclude = {
  /**
   * Whether to copy the product's images.
   */
  images?: boolean
  /**
   * Whether to copy the product's variants.
   */
  variants?: boolean
  /**
   * Whether to copy the variants' prices. Requires `variants`.
   */
  prices?: boolean
  /**
   * Whether to copy the variants' `manage_inventory` and `allow_backorder`
   * settings. Stock quantities are never copied. Requires `variants`.
   */
  inventory_settings?: boolean
}

/**
 * Fills in the groups a request left out and applies the dependencies between
 * them: prices and inventory settings are stored on variants, so neither can
 * be copied when variants are not.
 *
 * Everything defaults to copied, which is what duplication did before the
 * groups existed, so an unchanged request behaves as it always has.
 */
export const resolveDuplicateProductInclude = (
  include?: DuplicateProductInclude
): Required<DuplicateProductInclude> => {
  const variants = include?.variants ?? true

  return {
    images: include?.images ?? true,
    variants,
    prices: variants && (include?.prices ?? true),
    inventory_settings: variants && (include?.inventory_settings ?? true),
  }
}

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
   * The title of the new product.
   */
  title: string
  /**
   * The handle of the new product. It must not be used by another product.
   */
  handle: string
  /**
   * Which attribute groups to copy. Defaults to all of them.
   */
  include?: DuplicateProductInclude
} & AdditionalData

/**
 * The data to validate before duplicating a product.
 */
export interface ValidateDuplicateProductStepInput {
  /**
   * The products matching the requested ID (empty if it does not exist).
   */
  source: { id: string; metadata?: Record<string, unknown> | null }[]
  /**
   * The products already using the requested handle.
   */
  handleConflicts: { id: string }[]
  /**
   * The requested handle for the copy.
   */
  handle: string
}

const validateDuplicateProductStepId = "validate-duplicate-product"
/**
 * This step validates a duplicate request. It throws if the source product is
 * missing or if the handle is already used by another product. Running it
 * before anything is created means a failed validation leaves no data behind.
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

    // Issue #112: a copy would keep the bundle marker in its metadata but not
    // the component inventory links, which would produce a broken bundle.
    // Create a new bundle with the bundle API instead.
    if (isBundleMetadata(source.metadata)) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "A bundle can't be duplicated. Create a new bundle instead."
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
  /**
   * The resolved attribute groups to copy, from
   * `resolveDuplicateProductInclude`.
   */
  include: Required<DuplicateProductInclude>
}

/**
 * Maps a loaded product to the input of `createProductsWorkflow`, copying only
 * the groups `data.include` selects.
 *
 * This is a plain function (used inside `transform`) so it stays easy to
 * unit test. Unique variant fields (sku, barcode, ean, upc) are deliberately
 * never copied, and the copy always starts as a draft.
 */
export const buildDuplicateProductInput = (
  data: BuildDuplicateProductInputStepInput
): CreateProductWorkflowInputDTO => {
  const { source, include } = data

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
    images: include.images
      ? (source.images ?? []).map((image: any) => ({
          url: image.url,
          metadata: image.metadata,
        }))
      : [],
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
    // Options are always copied: `createProductsWorkflow` rejects a product
    // that has none, so a copy without variants still needs them.
    options: (source.options ?? []).map((option: any) => ({
      title: option.title,
      values: (option.values ?? []).map((value: any) => value.value),
    })),
    variants: include.variants
      ? (source.variants ?? []).map((variant: any) =>
          buildVariant(variant, include)
        )
      : [],
  } as CreateProductWorkflowInputDTO
}

/**
 * Maps one loaded variant to the create input. Stock quantities are never part
 * of the result: variants that manage inventory get new, empty inventory items
 * from `createProductsWorkflow`.
 */
const buildVariant = (
  variant: Record<string, any>,
  include: Required<DuplicateProductInclude>
) => {
  return {
    title: variant.title,
    // sku, barcode, ean and upc are intentionally omitted: they must be
    // unique, so they are left empty on the copy.
    //
    // When the inventory settings are not copied, both fields are omitted
    // rather than set, so the variant falls back to the product module's
    // defaults (manage_inventory true, allow_backorder false).
    ...(include.inventory_settings
      ? {
          manage_inventory: variant.manage_inventory,
          allow_backorder: variant.allow_backorder,
        }
      : {}),
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
    prices: include.prices
      ? (variant.prices ?? []).map((price: any) => ({
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
        }))
      : [],
  }
}

export const duplicateProductWorkflowId = "duplicate-product"
/**
 * This workflow duplicates a product, including its options, variants, prices
 * and relations. It's used by the Duplicate Product Admin API Route.
 *
 * `include` chooses which attribute groups are copied. Anything it leaves out
 * is copied, so a request without it duplicates the whole product. Basic
 * product information and options are always copied, and prices and inventory
 * settings are skipped when variants are not copied, because they are stored
 * on the variants.
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
 *     include: { images: true, variants: true, prices: false },
 *   }
 * })
 *
 * @summary
 *
 * Duplicate a product with the selected options, variants and prices.
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
      handle: input.handle,
    })

    const products = transform({ source, input }, (data) => [
      buildDuplicateProductInput({
        source: data.source[0],
        title: data.input.title,
        handle: data.input.handle,
        include: resolveDuplicateProductInclude(data.input.include),
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
