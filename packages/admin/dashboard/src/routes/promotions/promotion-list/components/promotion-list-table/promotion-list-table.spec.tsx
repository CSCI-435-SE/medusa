// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

// The promotion hooks module pulls in the SDK client, which reads these
// globals at module load. Vite's `define` supplies them in the app, but
// nothing does in the test environment.
vi.hoisted(() => {
  const g = global as any
  g.__BACKEND_URL__ = "http://localhost:9000"
  g.__AUTH_TYPE__ = "session"
  g.__JWT_TOKEN_STORAGE_KEY__ = ""
})

vi.mock("../../../../../hooks/api/promotions", () => ({
  usePromotions: () => ({
    promotions: [],
    count: 0,
    isLoading: false,
    isError: false,
  }),
  useDeletePromotion: () => ({ mutateAsync: vi.fn() }),
}))

// This suite only covers the header, so the table and the hooks that feed it
// are stubbed out.
vi.mock("../../../../../components/table/data-table", () => ({
  _DataTable: () => null,
}))

vi.mock("../../../../../hooks/use-data-table", () => ({
  useDataTable: () => ({ table: {} }),
}))

vi.mock(
  "../../../../../hooks/table/columns/use-promotion-table-columns",
  () => ({
    usePromotionTableColumns: () => [],
  })
)

vi.mock(
  "../../../../../hooks/table/filters/use-promotion-table-filters",
  () => ({
    usePromotionTableFilters: () => [],
  })
)

vi.mock("../../../../../hooks/table/query/use-promotion-table-query", () => ({
  usePromotionTableQuery: () => ({ searchParams: {}, raw: {} }),
}))

vi.mock("../../loader", () => ({
  promotionsLoader: () => async () => undefined,
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

import { PromotionListTable } from "./promotion-list-table"

// The table reads the route's loader data, so it needs a data router.
const renderTable = () =>
  render(
    <RouterProvider
      router={createMemoryRouter(
        [
          {
            path: "/promotions",
            element: <PromotionListTable />,
            loader: () => null,
          },
        ],
        { initialEntries: ["/promotions"] }
      )}
    />
  )

afterEach(() => {
  cleanup()
})

describe("PromotionListTable", () => {
  it("links to the promotion import from the list header", async () => {
    renderTable()

    const link = await screen.findByRole("link", { name: "Import" })
    expect(link.getAttribute("href")).toBe("/promotions/import")
  })

  it("keeps the create link next to it", async () => {
    renderTable()

    const link = await screen.findByRole("link", { name: "Create" })
    expect(link.getAttribute("href")).toBe("/promotions/create")
  })
})
