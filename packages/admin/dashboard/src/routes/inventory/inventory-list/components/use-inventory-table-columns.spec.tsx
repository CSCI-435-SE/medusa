// @vitest-environment jsdom
import { cleanup, render, renderHook, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
  const g = global as any
  g.__BACKEND_URL__ = "http://localhost:9000"
  g.__AUTH_TYPE__ = "session"
  g.__JWT_TOKEN_STORAGE_KEY__ = ""
})

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock("./inventory-actions", () => ({
  InventoryActions: () => <div />,
}))

import {
  getStockStatus,
  useInventoryTableColumns,
} from "./use-inventory-table-columns"

afterEach(() => {
  cleanup()
})

const item = (
  stocked_quantity: number | null,
  reserved_quantity: number | null,
  low_stock_threshold = 10
) => ({ stocked_quantity, reserved_quantity, low_stock_threshold } as any)

describe("getStockStatus", () => {
  it("is out of stock when available quantity is 0", () => {
    expect(getStockStatus(item(5, 5))).toBe("out_of_stock")
  })

  it("is out of stock when available quantity is negative", () => {
    expect(getStockStatus(item(2, 3))).toBe("out_of_stock")
  })

  it("is out of stock when the item has no location levels", () => {
    expect(getStockStatus(item(null, null))).toBe("out_of_stock")
  })

  it("is out of stock at 0 even when the threshold is 0", () => {
    expect(getStockStatus(item(0, 0, 0))).toBe("out_of_stock")
  })

  it("is low stock when available quantity equals the threshold", () => {
    expect(getStockStatus(item(12, 2, 10))).toBe("low_stock")
  })

  it("is low stock at 1 available", () => {
    expect(getStockStatus(item(1, 0, 10))).toBe("low_stock")
  })

  it("has no status when available quantity is above the threshold", () => {
    expect(getStockStatus(item(13, 2, 10))).toBeNull()
  })

  it("uses available, not stocked, quantity", () => {
    // 20 stocked is above 10, but 20 - 15 reserved = 5 is not
    expect(getStockStatus(item(20, 15, 10))).toBe("low_stock")
  })

  it("never shows low stock when the threshold is 0", () => {
    expect(getStockStatus(item(1, 0, 0))).toBeNull()
  })

  it("respects a custom threshold", () => {
    expect(getStockStatus(item(50, 0, 50))).toBe("low_stock")
    expect(getStockStatus(item(51, 0, 50))).toBeNull()
  })
})

describe("In stock column", () => {
  const renderCell = (row: any) => {
    const { result } = renderHook(() => useInventoryTableColumns())
    const column = result.current.find(
      (c: any) => c.accessorKey === "stocked_quantity"
    ) as any
    render(
      column.cell({
        getValue: () => row.stocked_quantity,
        row: { original: row },
      })
    )
  }

  it("shows the low stock badge", () => {
    renderCell(item(8, 0, 10))
    expect(screen.getByText("inventory.lowStock")).toBeTruthy()
    expect(screen.queryByText("inventory.outOfStock")).toBeNull()
  })

  it("shows the out of stock badge", () => {
    renderCell(item(0, 0, 10))
    expect(screen.getByText("inventory.outOfStock")).toBeTruthy()
    expect(screen.queryByText("inventory.lowStock")).toBeNull()
  })

  it("shows no badge above the threshold", () => {
    renderCell(item(11, 0, 10))
    expect(screen.queryByText("inventory.lowStock")).toBeNull()
    expect(screen.queryByText("inventory.outOfStock")).toBeNull()
  })
})
