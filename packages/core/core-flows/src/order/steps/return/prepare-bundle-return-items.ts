import type { BigNumberInput, OrderWorkflow } from "@medusajs/framework/types"
import {
  ChangeActionType,
  ContainerRegistrationKeys,
  OrderChangeStatus,
  ReturnStatus,
} from "@medusajs/framework/utils"
import { StepResponse, createStep } from "@medusajs/framework/workflows-sdk"
import {
  BUNDLE_LINE_METADATA_KEY,
  ExistingBundleReturn,
  bundleReturnItemKey,
  getReturnedBundleComponent,
  prepareBundleReceiveItems,
  prepareBundleReturnItems,
  withoutBundleComponentMetadata,
} from "../../utils/bundle-refunds"

const getCurrencyPrecision = async (query, currencyCode: string) => {
  const { data } = await query.graph({
    entity: "currency",
    fields: ["code", "decimal_digits"],
    filters: { code: currencyCode },
  })
  return data[0]?.decimal_digits ?? 2
}

/**
 * The items of a return request to prepare.
 */
export type PrepareBundleReturnItemsStepInput = {
  /**
   * The ID of the order the items are returned from.
   */
  order_id: string
  /**
   * The items to return. An item with `component_variant_id` returns that
   * component of a bundle line item.
   */
  items: OrderWorkflow.CreateReturnItem[]
}

export const prepareBundleReturnItemsStepId = "prepare-bundle-return-items"
/**
 * This step prepares the items of a return request for bundles (issue #113).
 *
 * An item that names a bundle component (`component_variant_id`) gets the
 * component and its refund (from the share saved when the order was placed) in
 * its metadata. It validates that the component is part of the bundle and
 * that no more is returned than is left. Whole-bundle returns of a bundle line
 * are limited to bundles none of whose components were returned.
 *
 * Orders without bundles are returned unchanged after one query.
 */
export const prepareBundleReturnItemsStep = createStep(
  prepareBundleReturnItemsStepId,
  async (input: PrepareBundleReturnItemsStepInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const {
      data: [order],
    } = await query.graph({
      entity: "order",
      fields: ["id", "currency_code", "items.*", "items.detail.*"],
      filters: { id: input.order_id },
    })

    const requestedIds = new Set(input.items.map((item) => item.id))
    const touchesBundle =
      input.items.some((item) => item.component_variant_id) ||
      (order?.items ?? []).some(
        (item) =>
          requestedIds.has(item.id) && item.metadata?.[BUNDLE_LINE_METADATA_KEY]
      )

    if (!order || !touchesBundle) {
      return new StepResponse(input.items.map(withoutBundleComponentMetadata))
    }

    const [{ data: returns }, { data: changes }, precision] = await Promise.all(
      [
        query.graph({
          entity: "return",
          fields: [
            "id",
            "status",
            "items.item_id",
            "items.quantity",
            "items.metadata",
          ],
          filters: { order_id: input.order_id },
        }),
        query.graph({
          entity: "order_change",
          fields: ["id", "status", "actions.action", "actions.details"],
          filters: {
            order_id: input.order_id,
            status: [OrderChangeStatus.PENDING, OrderChangeStatus.REQUESTED],
          },
        }),
        getCurrencyPrecision(query, order.currency_code),
      ]
    )

    // Confirmed whole-bundle returns are already in the line's quantities, so
    // only component return items are counted from returns. Pending actions
    // aren't in the quantities yet, so all of them are counted.
    const existingReturns: ExistingBundleReturn[] = [
      ...returns
        .filter((ret) => ret.status !== ReturnStatus.CANCELED)
        .flatMap((ret) => ret.items ?? [])
        .filter((item) => getReturnedBundleComponent(item.metadata))
        .map((item) => ({
          item_id: item.item_id,
          quantity: item.quantity,
          metadata: item.metadata,
        })),
      ...changes
        .flatMap((change) => change.actions ?? [])
        .filter((action) => action.action === ChangeActionType.RETURN_ITEM)
        .map((action) => ({
          item_id: action.details?.reference_id as string,
          quantity: action.details?.quantity as BigNumberInput,
          metadata: action.details?.metadata as Record<string, unknown>,
        })),
    ]

    return new StepResponse(
      prepareBundleReturnItems({
        items: input.items,
        orderItems: order.items.map((item) => ({
          id: item.id,
          title: item.title,
          quantity: item.quantity,
          metadata: item.metadata,
          fulfilled_quantity:
            item.detail?.fulfilled_quantity ?? item.fulfilled_quantity,
          return_requested_quantity:
            item.detail?.return_requested_quantity ??
            item.return_requested_quantity,
          return_received_quantity:
            item.detail?.return_received_quantity ??
            item.return_received_quantity,
          return_dismissed_quantity:
            item.detail?.return_dismissed_quantity ??
            item.return_dismissed_quantity,
        })),
        existingReturns,
        precision,
      })
    )
  }
)

/**
 * The items of a return to receive (or dismiss as damaged).
 */
export type PrepareBundleReceiveItemsStepInput = {
  /**
   * The ID of the return the items are received for.
   */
  return_id: string
  /**
   * The items to receive. An item with `component_variant_id` receives that
   * component's return item.
   */
  items: OrderWorkflow.ReceiveOrderReturnItemsWorkflowInput["items"]
}

export const prepareBundleReceiveItemsStepId = "prepare-bundle-receive-items"
/**
 * This step prepares the items received for a return with bundle components
 * (issue #113): it names the component and the part of its refund that the
 * received quantity stands for, and validates that no more is received than
 * was returned. Returns without component items are returned unchanged.
 */
export const prepareBundleReceiveItemsStep = createStep(
  prepareBundleReceiveItemsStepId,
  async (input: PrepareBundleReceiveItemsStepInput, { container }) => {
    if (!input.items.some((item) => item.component_variant_id)) {
      return new StepResponse(
        input.items.map(({ component_variant_id, ...item }) => item)
      )
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [orderReturn],
    } = await query.graph({
      entity: "return",
      fields: [
        "id",
        "order_id",
        "items.item_id",
        "items.quantity",
        "items.received_quantity",
        "items.metadata",
        "order.currency_code",
      ],
      filters: { id: input.return_id },
    })

    const { data: changes } = await query.graph({
      entity: "order_change",
      fields: ["id", "actions.action", "actions.details"],
      filters: {
        return_id: input.return_id,
        status: [OrderChangeStatus.PENDING, OrderChangeStatus.REQUESTED],
      },
    })

    // Quantities received in the receive change that isn't confirmed yet.
    const pendingReceived: Record<string, number> = {}
    for (const action of changes.flatMap((change) => change.actions ?? [])) {
      if (
        action.action !== ChangeActionType.RECEIVE_RETURN_ITEM &&
        action.action !== ChangeActionType.RECEIVE_DAMAGED_RETURN_ITEM
      ) {
        continue
      }
      const key = bundleReturnItemKey(
        action.details?.reference_id as string,
        action.details?.metadata as Record<string, unknown>
      )
      pendingReceived[key] =
        (pendingReceived[key] ?? 0) + Number(action.details?.quantity ?? 0)
    }

    return new StepResponse(
      prepareBundleReceiveItems({
        items: input.items,
        returnItems: orderReturn?.items ?? [],
        pendingReceived,
        precision: await getCurrencyPrecision(
          query,
          orderReturn?.order?.currency_code
        ),
      })
    )
  }
)
