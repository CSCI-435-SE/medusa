// @vitest-environment jsdom
import { HttpTypes } from "@medusajs/types"
import { TooltipProvider } from "@medusajs/ui"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

// The SDK client reads these globals at module load. Vite's `define` supplies
// them in the app, but nothing does in the test environment.
vi.hoisted(() => {
  const g = global as any
  g.__BACKEND_URL__ = "http://localhost:9000"
  g.__AUTH_TYPE__ = "session"
  g.__JWT_TOKEN_STORAGE_KEY__ = ""
})

// vi.mock factories are hoisted above the rest of the file, so the mocks they
// use have to be hoisted too.
const { mockDuplicatePromotion, mockToastSuccess } = vi.hoisted(() => ({
  mockDuplicatePromotion: vi.fn(),
  mockToastSuccess: vi.fn(),
}))

// The mutation itself is covered by the integration tests, so it's stubbed
// here to check what the form does with its result.
vi.mock("../../../../../hooks/api/promotions", () => ({
  useDuplicatePromotion: () => ({
    mutateAsync: mockDuplicatePromotion,
    isPending: false,
  }),
}))

vi.mock("@medusajs/icons", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return Object.fromEntries(
    Object.keys(actual).map((name) => [
      name,
      () => <div data-testid={`icon-${name}`} />,
    ])
  )
})

vi.mock("@medusajs/ui", async () => {
  const actual = await vi.importActual<typeof import("@medusajs/ui")>(
    "@medusajs/ui"
  )
  return {
    ...actual,
    toast: { success: mockToastSuccess, error: vi.fn() },
  }
})

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const labels: Record<string, string> = {
        "fields.code": "Code",
        "actions.cancel": "Cancel",
        "actions.duplicate": "Duplicate",
        "promotions.duplicate.successToast": `Promotion ${options?.code} was created as a draft`,
      }
      return labels[key] ?? key
    },
  }),
}))

import { RouteDrawer } from "../../../../../components/modals"
import { DuplicatePromotionForm } from "./duplicate-promotion-form"

const promotion = {
  id: "promo_summer",
  code: "SUMMER20",
} as unknown as HttpTypes.AdminPromotion

const renderForm = () => {
  const router = createMemoryRouter(
    [
      {
        path: "/promotions/:id/duplicate",
        element: (
          <TooltipProvider delayDuration={0}>
            <RouteDrawer>
              <DuplicatePromotionForm promotion={promotion} />
            </RouteDrawer>
          </TooltipProvider>
        ),
      },
      {
        path: "/promotions/:id",
        element: <div>Promotion page</div>,
      },
    ],
    { initialEntries: ["/promotions/promo_summer/duplicate"] }
  )

  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )

  return router
}

const codeInput = () =>
  screen.getByRole("textbox", { name: "Code" }) as HTMLInputElement

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("DuplicatePromotionForm", () => {
  it("pre-fills the code with the original code and -COPY", () => {
    renderForm()

    expect(codeInput().value).toEqual("SUMMER20-COPY")
  })

  it("duplicates with the entered code, then shows a toast and opens the new promotion", async () => {
    mockDuplicatePromotion.mockImplementation(async (_body, options) => {
      options.onSuccess({ promotion: { id: "promo_fall", code: "FALL20" } })
    })
    const user = userEvent.setup()
    const router = renderForm()

    await user.clear(codeInput())
    await user.type(codeInput(), "FALL20")
    await user.click(screen.getByRole("button", { name: "Duplicate" }))

    await waitFor(() =>
      expect(router.state.location.pathname).toEqual("/promotions/promo_fall")
    )
    expect(mockDuplicatePromotion).toHaveBeenCalledWith(
      { code: "FALL20" },
      expect.any(Object)
    )
    expect(mockToastSuccess).toHaveBeenCalledWith(
      "Promotion FALL20 was created as a draft"
    )
  })

  it("shows the error on the code field and stays open when the code is taken", async () => {
    mockDuplicatePromotion.mockImplementation(async (_body, options) => {
      options.onError(
        new Error("Promotion with code: BUY2GET1, already exists.")
      )
    })
    const user = userEvent.setup()
    const router = renderForm()

    await user.clear(codeInput())
    await user.type(codeInput(), "BUY2GET1")
    await user.click(screen.getByRole("button", { name: "Duplicate" }))

    expect(
      await screen.findByText("Promotion with code: BUY2GET1, already exists.")
    ).toBeTruthy()
    expect(router.state.location.pathname).toEqual(
      "/promotions/promo_summer/duplicate"
    )
    expect(mockToastSuccess).not.toHaveBeenCalled()
  })

  it("does not submit an empty code", async () => {
    const user = userEvent.setup()
    renderForm()

    await user.clear(codeInput())
    await user.click(screen.getByRole("button", { name: "Duplicate" }))

    // Give the form a chance to (incorrectly) submit before asserting.
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(mockDuplicatePromotion).not.toHaveBeenCalled()
  })
})
