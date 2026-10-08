// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

// The inventory hooks module pulls in the SDK client, which reads these
// globals at module load. Vite's `define` supplies them in the app, but
// nothing does in the test environment.
vi.hoisted(() => {
  const g = global as any
  g.__BACKEND_URL__ = "http://localhost:9000"
  g.__AUTH_TYPE__ = "session"
  g.__JWT_TOKEN_STORAGE_KEY__ = ""
})

vi.mock("../../../../hooks/api/inventory", () => ({
  useInventoryItems: () => ({
    inventory_items: [],
    count: 0,
    isPending: false,
    isError: false,
  }),
}))

// This suite only covers the header, so the table and the hooks that feed it
// are stubbed out.
vi.mock("../../../../components/table/data-table", () => ({
  _DataTable: () => null,
}))

vi.mock("../../../../hooks/use-data-table", () => ({
  useDataTable: () => ({ table: {} }),
}))

vi.mock("./use-inventory-table-columns", () => ({
  useInventoryTableColumns: () => [],
}))

vi.mock("./use-inventory-table-filters", () => ({
  useInventoryTableFilters: () => [],
}))

vi.mock("./use-inventory-table-query", () => ({
  useInventoryTableQuery: () => ({ searchParams: {}, raw: {} }),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        "actions.create": "Create",
        "actions.import": "Import",
      }
      return labels[key] ?? key
    },
  }),
}))

import { InventoryListTable } from "./inventory-list-table"

const renderTable = () =>
  render(
    <MemoryRouter initialEntries={["/inventory"]}>
      <Routes>
        <Route path="/inventory" element={<InventoryListTable />} />
      </Routes>
    </MemoryRouter>
  )

afterEach(() => {
  cleanup()
})

describe("InventoryListTable", () => {
  it("links to the inventory import from the list header", () => {
    renderTable()

    const link = screen.getByRole("link", { name: "Import" })
    expect(link.getAttribute("href")).toBe("/inventory/import")
  })

  it("keeps the create link next to it", () => {
    renderTable()

    const link = screen.getByRole("link", { name: "Create" })
    expect(link.getAttribute("href")).toBe("/inventory/create")
  })
})
