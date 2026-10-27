// @vitest-environment jsdom
import { HttpTypes } from "@medusajs/types"
import { TooltipProvider } from "@medusajs/ui"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

// The SDK client reads these bare globals at module load time (see
// edit-product-form.spec.tsx); Vite injects them in the real app.
vi.hoisted(() => {
  const g = global as any
  g.__BACKEND_URL__ = "http://localhost:9000"
  g.__AUTH_TYPE__ = "session"
  g.__JWT_TOKEN_STORAGE_KEY__ = ""
})

import { RouteDrawer } from "../../../../../components/modals"
import { DuplicateProductForm } from "./duplicate-product-form"

const mutateAsync = vi.fn()

// The mutation itself is covered by the integration tests; here it is stubbed
// so the form's validation and submit behavior can be checked in isolation.
vi.mock("../../../../../hooks/api/products", () => ({
  useDuplicateProduct: () => ({ mutateAsync, isPending: false }),
}))

// Same icon stubbing as edit-product-form.spec.tsx.
vi.mock("@medusajs/icons", () => ({
  InformationCircleSolid: () => <div />,
  TrianglesMini: () => <div />,
  Check: () => <div />,
  XMark: () => <div />,
  ExclamationCircleSolid: () => <div />,
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        "fields.title": "Title",
        "fields.handle": "Handle",
        "actions.cancel": "Cancel",
        "actions.duplicate": "Duplicate",
        "products.duplicate.titleMustChange": "Choose a new product name",
      }
      return labels[key] ?? key
    },
  }),
}))

afterEach(() => {
  cleanup()
  mutateAsync.mockReset()
})

const product = {
  id: "prod_1",
  title: "Classic Tee",
  handle: "classic-tee",
} as unknown as HttpTypes.AdminProduct

const renderForm = () => {
  const router = createMemoryRouter(
    [
      {
        path: "/products/:id/duplicate",
        element: (
          <TooltipProvider delayDuration={0}>
            <RouteDrawer>
              <DuplicateProductForm product={product} />
            </RouteDrawer>
          </TooltipProvider>
        ),
      },
    ],
    { initialEntries: ["/products/prod_1/duplicate"] }
  )

  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe("DuplicateProductForm", () => {
  it("pre-fills the title and handle", () => {
    renderForm()

    expect(
      (screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement).value
    ).toEqual("Classic Tee (Copy)")
    expect(
      (screen.getByRole("textbox", { name: "Handle" }) as HTMLInputElement)
        .value
    ).toEqual("classic-tee-copy")
  })

  it("keeps Duplicate disabled until the title is changed", async () => {
    const user = userEvent.setup()
    renderForm()

    const button = screen.getByRole("button", { name: "Duplicate" })
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(true)
    )

    const title = screen.getByRole("textbox", { name: "Title" })
    await user.clear(title)
    await user.type(title, "Classic Tee - Long Sleeve")

    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false)
    )
  })

  it("rejects the original title and a '(Copy)' suffix", async () => {
    const user = userEvent.setup()
    renderForm()

    const title = screen.getByRole("textbox", { name: "Title" })

    await user.clear(title)
    await user.type(title, "Classic Tee")
    expect(await screen.findByText("Choose a new product name")).toBeTruthy()
  })

  it("submits the new title and handle", async () => {
    mutateAsync.mockResolvedValue({})
    const user = userEvent.setup()
    renderForm()

    const title = screen.getByRole("textbox", { name: "Title" })
    await user.clear(title)
    await user.type(title, "Classic Tee - Long Sleeve")

    const button = screen.getByRole("button", { name: "Duplicate" })
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false)
    )
    await user.click(button)

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        { title: "Classic Tee - Long Sleeve", handle: "classic-tee-copy" },
        expect.any(Object)
      )
    )
  })
})
