// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The promotion hooks module pulls in the SDK client, which reads these
// globals at module load. Vite's `define` supplies them in the app, but
// nothing does in the test environment.
vi.hoisted(() => {
  const g = global as any
  g.__BACKEND_URL__ = "http://localhost:9000"
  g.__AUTH_TYPE__ = "session"
  g.__JWT_TOKEN_STORAGE_KEY__ = ""
})

// vi.mock factories are hoisted above the rest of the file, so the mocks they
// use have to be hoisted too.
const {
  mockToastInfo,
  mockToastError,
  mockHandleSuccess,
  mockExportPromotions,
  mockSearchParams,
} = vi.hoisted(() => ({
  mockToastInfo: vi.fn(),
  mockToastError: vi.fn(),
  mockHandleSuccess: vi.fn(),
  mockExportPromotions: vi.fn(),
  mockSearchParams: { limit: 20, offset: 0, q: "SAVE" },
}))

vi.mock("@medusajs/ui", async () => {
  const actual = await vi.importActual<typeof import("@medusajs/ui")>(
    "@medusajs/ui"
  )
  return {
    ...actual,
    toast: { info: mockToastInfo, error: mockToastError },
  }
})

vi.mock("../../../hooks/api/promotions", () => ({
  useExportPromotions: () => ({ mutateAsync: mockExportPromotions }),
}))

vi.mock("../../../hooks/table/query/use-promotion-table-query", () => ({
  usePromotionTableQuery: () => ({ searchParams: mockSearchParams, raw: {} }),
}))

// The real RouteDrawer needs the router and modal providers. A plain stand-in
// keeps the test on what the drawer renders.
vi.mock("../../../components/modals", () => {
  const Part = ({ children }: { children?: ReactNode }) => <div>{children}</div>
  const RouteDrawer = Object.assign(Part, {
    Header: Part,
    Title: Part,
    Description: Part,
    Body: Part,
    Footer: Part,
    Close: Part,
  })
  return {
    RouteDrawer,
    useRouteModal: () => ({ handleSuccess: mockHandleSuccess }),
  }
})

vi.mock("react-i18next", async () => {
  const en = (await import("../../../i18n/translations/en.json")).default
  return {
    useTranslation: () => ({
      t: (key: string) => {
        const value = key
          .split(".")
          .reduce<any>((node, part) => node?.[part], en)
        return typeof value === "string" ? value : key
      },
    }),
  }
})

import { PromotionExport } from "./promotion-export"

const exportButton = () => screen.getByRole("button", { name: "Export" })

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe("PromotionExport", () => {
  it("sends the list's current filters with the export request", async () => {
    mockExportPromotions.mockImplementation(async (_query, { onSuccess }) =>
      onSuccess()
    )
    render(<PromotionExport />)

    await userEvent.click(exportButton())

    await waitFor(() => {
      expect(mockExportPromotions).toHaveBeenCalledWith(
        mockSearchParams,
        expect.anything()
      )
    })
  })

  it("tells the admin the export will arrive later and closes the drawer", async () => {
    mockExportPromotions.mockImplementation(async (_query, { onSuccess }) =>
      onSuccess()
    )
    render(<PromotionExport />)

    await userEvent.click(exportButton())

    await waitFor(() => {
      expect(mockToastInfo).toHaveBeenCalledWith("Export started", {
        description: "You will be notified when the export is ready.",
      })
    })
    expect(mockHandleSuccess).toHaveBeenCalled()
  })

  it("shows the error and keeps the drawer open when the request fails", async () => {
    mockExportPromotions.mockImplementation(async (_query, { onError }) =>
      onError(new Error("Export could not be started"))
    )
    render(<PromotionExport />)

    await userEvent.click(exportButton())

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Export could not be started")
    })
    expect(mockHandleSuccess).not.toHaveBeenCalled()
  })
})
