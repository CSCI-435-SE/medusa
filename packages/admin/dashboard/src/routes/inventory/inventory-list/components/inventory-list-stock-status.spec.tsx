// @vitest-environment jsdom
import { cleanup, render, renderHook, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

// The API hooks pull in the SDK client, which reads these globals at load.
vi.hoisted(() => {
  const g = global as any
  g.__BACKEND_URL__ = "http://localhost:9000"
  g.__AUTH_TYPE__ = "session"
  g.__JWT_TOKEN_STORAGE_KEY__ = ""
})

const { useInventoryItems } = vi.hoisted(() => ({
  useInventoryItems: vi.fn(),
}))

vi.mock("../../../../hooks/api/inventory", () => ({ useInventoryItems }))

vi.mock("../../../../hooks/api/stock-locations", () => ({
  useStockLocations: () => ({ stock_locations: [] }),
}))

// The full table renders icons, which don't render in jsdom; stubbed the same
// way as customer-list-table.spec.tsx.
vi.mock("@medusajs/icons", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return Object.fromEntries(
    Object.keys(actual).map((name) => [name, () => <svg />])
  )
})

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("./inventory-actions", () => ({
  InventoryActions: () => null,
}))

import { InventoryListTable } from "./inventory-list-table"
import { useInventoryTableFilters } from "./use-inventory-table-filters"

// The table scrolls to the top when its data changes; jsdom has no scroll.
Element.prototype.scroll = vi.fn()

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <InventoryListTable />
    </MemoryRouter>
  )

const respondWith = (inventory_items: any[]) =>
  useInventoryItems.mockReturnValue({
    inventory_items,
    count: inventory_items.length,
    isPending: false,
    isError: false,
  })

afterEach(() => {
  cleanup()
  useInventoryItems.mockReset()
})

describe("inventory list stock status filter", () => {
  it("offers low stock and out of stock as filter options", () => {
    const { result } = renderHook(() => useInventoryTableFilters())
    const filter = result.current.find((f) => f.key === "stock_status") as any

    expect(filter.options.map((o: any) => o.value)).toEqual([
      "low_stock",
      "out_of_stock",
    ])
  })

  it.each([
    ["out_of_stock", ["out_of_stock"]],
    ["low_stock%2Cout_of_stock", ["low_stock", "out_of_stock"]],
  ])("sends stock_status=%s to the API as a list", (param, expected) => {
    respondWith([])
    renderAt(`/?stock_status=${param}`)

    expect(useInventoryItems).toHaveBeenCalledWith(
      expect.objectContaining({ stock_status: expected })
    )
  })

  it("does not send stock_status when the filter is not set", () => {
    respondWith([])
    renderAt("/")

    expect(useInventoryItems.mock.calls[0][0].stock_status).toBeUndefined()
  })

  it("shows the no results state when no items match the filter", () => {
    respondWith([])
    renderAt("/?stock_status=out_of_stock")

    expect(screen.getByText("general.noResultsTitle")).toBeTruthy()
  })

  it("shows available quantity, threshold and status for each item", () => {
    respondWith([
      {
        id: "iitem_1",
        title: "Shirt",
        sku: "shirt",
        stocked_quantity: 12,
        reserved_quantity: 5,
        low_stock_threshold: 10,
      },
    ])
    renderAt("/?stock_status=low_stock")

    const row = screen.getByText("Shirt").closest("tr")!
    const cells = Array.from(row.querySelectorAll("td")).map(
      (td) => td.textContent
    )

    // title, sku, reserved, in stock + badge, available, threshold
    expect(cells).toEqual(
      expect.arrayContaining(["Shirt", "5", "12inventory.lowStock", "7", "10"])
    )
  })
})
