// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { ReactNode } from "react"
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
    promotions: [{ id: "promo_summer", code: "SUMMER20" }],
    count: 1,
    isLoading: false,
    isError: false,
  }),
  useDeletePromotion: () => ({ mutateAsync: vi.fn() }),
}))

// This suite only covers the row menu, so the table renders each row's cells
// directly and the menu renders its actions as plain links and buttons.
vi.mock("../../../../../hooks/use-data-table", () => ({
  useDataTable: (options: any) => ({ table: options }),
}))

vi.mock("../../../../../components/table/data-table", () => ({
  _DataTable: ({ table }: any) => (
    <div>
      {table.data.map((row: any) =>
        table.columns.map((column: any) => (
          <div key={`${row.id}-${column.id}`}>
            {column.cell?.({ row: { original: row } })}
          </div>
        ))
      )}
    </div>
  ),
}))

vi.mock("../../../../../components/common/action-menu", () => ({
  ActionMenu: ({ groups }: { groups: { actions: any[] }[] }) => (
    <div>
      {groups
        .flatMap((group) => group.actions)
        .map(
          (action): ReactNode =>
            action.to ? (
              <a key={action.label} href={action.to}>
                {action.label}
              </a>
            ) : (
              <button key={action.label}>{action.label}</button>
            )
        )}
    </div>
  ),
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
        "actions.edit": "Edit",
        "actions.duplicate": "Duplicate",
        "actions.delete": "Delete",
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

describe("PromotionListTable row menu", () => {
  it("has a Duplicate action that opens the duplicate dialog for that promotion", async () => {
    renderTable()

    const link = await screen.findByRole("link", { name: "Duplicate" })
    expect(link.getAttribute("href")).toBe("/promotions/promo_summer/duplicate")
  })

  it("keeps the edit and delete actions", async () => {
    renderTable()

    expect(
      (await screen.findByRole("link", { name: "Edit" })).getAttribute("href")
    ).toBe("/promotions/promo_summer/edit")
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy()
  })
})
