import { AdminOrderLineItem, AdminReturn } from "@medusajs/types"
import { useTranslation } from "react-i18next"

import {
  getOrderLineBundleComponents,
  getReturnedBundleComponentUnits,
} from "../../../../products/common/bundles"
import { BreakdownRow, CollapsibleBreakdown } from "./collapsible-breakdown"

type BundleComponentBreakdownProps = {
  item: AdminOrderLineItem
  returns: AdminReturn[]
}

/**
 * Lists the components of a bundle line item, and how many of each have come
 * back (issue #114, AC 6).
 *
 * The components and their quantities are read from what was saved on the line
 * when the order was placed (issue #113), not from the bundle product, so
 * editing or deleting the bundle later does not change what the order shows.
 */
export const BundleComponentBreakdown = ({
  item,
  returns,
}: BundleComponentBreakdownProps) => {
  const { t } = useTranslation()

  const components = getOrderLineBundleComponents(item)

  if (!components?.length) {
    return null
  }

  const returned = getReturnedBundleComponentUnits(returns, item.id)

  return (
    <CollapsibleBreakdown
      label={t("orders.summary.bundleComponents", {
        count: components.length,
      })}
    >
      {components.map((component) => {
        const returnedUnits = returned[component.variant_id]

        return (
          <BreakdownRow
            key={component.variant_id}
            name={component.title || component.variant_id}
            value={
              <span className="flex items-center gap-x-2">
                {!!returnedUnits && (
                  <span className="text-ui-fg-subtle">
                    {t("orders.summary.bundleComponentReturned", {
                      count: returnedUnits,
                    })}
                  </span>
                )}
                <span className="tabular-nums">{component.quantity}x</span>
              </span>
            }
          />
        )
      })}
    </CollapsibleBreakdown>
  )
}
