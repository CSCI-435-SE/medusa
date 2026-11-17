import type { BigNumberInput } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MathBN,
  QueryContext,
} from "@medusajs/framework/utils"
import { StepResponse, createStep } from "@medusajs/framework/workflows-sdk"
import {
  OrderBundleComponent,
  computeBundleRefundShares,
} from "../../order/utils/bundle-refunds"
import { getVariantDisplayName } from "../utils/insufficient-inventory-error"

/**
 * The cart whose bundle lines get refund shares.
 */
export type PrepareBundleRefundSharesStepInput = {
  cart: {
    currency_code: string
    region_id?: string | null
    region?: { id?: string | null } | null
    items?: {
      id: string
      quantity: BigNumberInput
      total?: BigNumberInput | null
      variant?: {
        product?: { metadata?: Record<string, unknown> | null } | null
      } | null
    }[]
  }
}

export const prepareBundleRefundSharesStepId = "prepare-bundle-refund-shares"
/**
 * This step works out, for every bundle line in the cart, each component's
 * share of what was paid for the line (issue #113). The result maps a line
 * item ID to the components to save in the order line item's
 * `metadata.bundle`, which single-item returns later refund from.
 *
 * Normal prices are the components' prices in the cart's currency and region
 * (without sale price lists). Carts without bundles need no queries.
 */
export const prepareBundleRefundSharesStep = createStep(
  prepareBundleRefundSharesStepId,
  async (input: PrepareBundleRefundSharesStepInput, { container }) => {
    const bundleLines = (input.cart.items ?? [])
      .map((item) => ({
        item,
        components: (
          item.variant?.product?.metadata?.bundle as
            | { components?: { variant_id: string; quantity: number }[] }
            | undefined
        )?.components,
      }))
      .filter((line) => Array.isArray(line.components))

    const shares: Record<string, { components: OrderBundleComponent[] }> = {}
    if (!bundleLines.length) {
      return new StepResponse(shares)
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const regionId = input.cart.region_id ?? input.cart.region?.id

    const [{ data: variants }, { data: currencies }] = await Promise.all([
      query.graph({
        entity: "variant",
        fields: [
          "id",
          "title",
          "product.title",
          "product.variants.id",
          "inventory_items.inventory_item_id",
          "inventory_items.required_quantity",
          "calculated_price.original_amount",
        ],
        filters: {
          id: [
            ...new Set(
              bundleLines.flatMap((line) =>
                line.components!.map((component) => component.variant_id)
              )
            ),
          ],
        },
        context: {
          calculated_price: QueryContext({
            currency_code: input.cart.currency_code,
            ...(regionId ? { region_id: regionId } : {}),
          }),
        },
      }),
      query.graph({
        entity: "currency",
        fields: ["code", "decimal_digits"],
        filters: { code: input.cart.currency_code },
      }),
    ])

    const variantsById = new Map(
      (variants as any[]).map((variant) => [variant.id, variant])
    )
    const precision = currencies[0]?.decimal_digits ?? 2

    for (const { item, components } of bundleLines) {
      shares[item.id] = {
        components: computeBundleRefundShares({
          components: components!.map((component) => {
            const variant = variantsById.get(component.variant_id)
            return {
              variant_id: component.variant_id,
              title: variant
                ? getVariantDisplayName(variant)
                : component.variant_id,
              quantity: component.quantity,
              unit_price: variant?.calculated_price?.original_amount ?? null,
              inventory_items: (variant?.inventory_items ?? []).map((link) => ({
                inventory_item_id: link.inventory_item_id,
                required_quantity: link.required_quantity,
              })),
            }
          }),
          lineQuantity: MathBN.convert(item.quantity).toNumber(),
          amountPaid: item.total ?? 0,
          precision,
        }),
      }
    }

    return new StepResponse(shares)
  }
)
