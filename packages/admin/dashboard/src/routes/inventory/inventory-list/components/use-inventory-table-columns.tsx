import { AdminInventoryItem } from "@medusajs/types"

import { Checkbox, StatusBadge } from "@medusajs/ui"
import { createColumnHelper } from "@tanstack/react-table"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { PlaceholderCell } from "../../../../components/table/table-cells/common/placeholder-cell"
import { InventoryActions } from "./inventory-actions"

const columnHelper = createColumnHelper<AdminInventoryItem>()

export const getStockStatus = (
  item: Pick<
    AdminInventoryItem,
    "stocked_quantity" | "reserved_quantity" | "low_stock_threshold"
  >
): "out_of_stock" | "low_stock" | null => {
  // Quantities are null when the item has no location levels
  const available = (item.stocked_quantity ?? 0) - (item.reserved_quantity ?? 0)

  if (available <= 0) {
    return "out_of_stock"
  }

  if (available <= item.low_stock_threshold) {
    return "low_stock"
  }

  return null
}

export const useInventoryTableColumns = () => {
  const { t } = useTranslation()

  return useMemo(
    () => [
      columnHelper.display({
        id: "select",
        header: ({ table }) => {
          return (
            <Checkbox
              checked={
                table.getIsSomePageRowsSelected()
                  ? "indeterminate"
                  : table.getIsAllPageRowsSelected()
              }
              onCheckedChange={(value) =>
                table.toggleAllPageRowsSelected(!!value)
              }
            />
          )
        },
        cell: ({ row }) => {
          return (
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              onClick={(e) => {
                e.stopPropagation()
              }}
            />
          )
        },
      }),
      columnHelper.accessor("title", {
        header: t("fields.title"),
        cell: ({ getValue }) => {
          const title = getValue()

          if (!title) {
            return <PlaceholderCell />
          }

          return (
            <div className="flex size-full items-center overflow-hidden">
              <span className="truncate">{title}</span>
            </div>
          )
        },
      }),
      columnHelper.accessor("sku", {
        header: t("fields.sku"),
        cell: ({ getValue }) => {
          const sku = getValue() as string

          if (!sku) {
            return <PlaceholderCell />
          }

          return (
            <div className="flex size-full items-center overflow-hidden">
              <span className="truncate">{sku}</span>
            </div>
          )
        },
      }),
      columnHelper.accessor("reserved_quantity", {
        header: t("inventory.reserved"),
        cell: ({ getValue }) => {
          const quantity = getValue()

          if (Number.isNaN(quantity)) {
            return <PlaceholderCell />
          }

          return (
            <div className="flex size-full items-center overflow-hidden">
              <span className="truncate">{quantity}</span>
            </div>
          )
        },
      }),
      columnHelper.accessor("stocked_quantity", {
        header: t("fields.inStock"),
        cell: ({ getValue, row }) => {
          const quantity = getValue()

          if (Number.isNaN(quantity)) {
            return <PlaceholderCell />
          }

          const status = getStockStatus(row.original)

          return (
            <div className="flex size-full items-center gap-x-2 overflow-hidden">
              <span className="truncate">{quantity}</span>
              {status === "out_of_stock" && (
                <StatusBadge color="red">
                  {t("inventory.outOfStock")}
                </StatusBadge>
              )}
              {status === "low_stock" && (
                <StatusBadge color="orange">
                  {t("inventory.lowStock")}
                </StatusBadge>
              )}
            </div>
          )
        },
      }),
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => <InventoryActions item={row.original} />,
      }),
    ],
    [t]
  )
}
