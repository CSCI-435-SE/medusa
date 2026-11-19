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

  // The Radix checkbox measures itself, and jsdom has no ResizeObserver.
  // Only the constructor is needed: nothing in these tests resizes.
  g.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

import { RouteDrawer } from "../../../../../components/modals"
import { DuplicateProductForm } from "./duplicate-product-form"

const mutateAsync = vi.fn()
// Declared through `vi.hoisted` because the `vi.mock` factories below are
// hoisted above plain `const` declarations and reference these at module load.
const { navigate, toastSuccess, toastError } = vi.hoisted(() => ({
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

// Only `useNavigate` is replaced: the tests still render through a real
// router so RouteDrawer behaves normally.
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}))

vi.mock("@medusajs/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@medusajs/ui")>()),
  toast: { success: toastSuccess, error: toastError },
}))

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
  CheckMini: () => <div />,
  MinusMini: () => <div />,
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
        "products.duplicate.include.label": "Copy",
        "products.duplicate.include.images": "Images",
        "products.duplicate.include.variants": "Variants",
        "products.duplicate.include.prices": "Prices",
        "products.duplicate.include.inventorySettings": "Inventory settings",
        "products.duplicate.include.hint":
          "Basic product information and options are always copied.",
      }
      return labels[key] ?? key
    },
  }),
}))

afterEach(() => {
  cleanup()
  mutateAsync.mockReset()
  navigate.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
})

const product = {
  id: "prod_1",
  title: "Classic Tee",
  handle: "classic-tee",
} as unknown as HttpTypes.AdminProduct

// AC3: everything starts selected, so an untouched form copies the whole
// product. Stock quantities are not a checkbox: they are never copied.
const ALL_SELECTED = {
  images: true,
  variants: true,
  prices: true,
  inventory_settings: true,
}

const checkbox = (name: string) =>
  screen.getByRole("checkbox", { name }) as HTMLButtonElement

const isChecked = (name: string) =>
  checkbox(name).getAttribute("aria-checked") === "true"

const submittedInclude = () => mutateAsync.mock.calls[0][0].include

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

  it("submits the pre-filled title and handle without changes", async () => {
    mutateAsync.mockResolvedValue({})
    const user = userEvent.setup()
    renderForm()

    // The pre-filled values are valid as they are: no rename is required.
    const button = screen.getByRole("button", { name: "Duplicate" })
    expect((button as HTMLButtonElement).disabled).toBe(false)
    await user.click(button)

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        {
          title: "Classic Tee (Copy)",
          handle: "classic-tee-copy",
          include: ALL_SELECTED,
        },
        expect.any(Object)
      )
    )
  })

  it("submits an edited title and handle", async () => {
    mutateAsync.mockResolvedValue({})
    const user = userEvent.setup()
    renderForm()

    const title = screen.getByRole("textbox", { name: "Title" })
    await user.clear(title)
    await user.type(title, "Classic Tee - Long Sleeve")

    const handle = screen.getByRole("textbox", { name: "Handle" })
    await user.clear(handle)
    await user.type(handle, "classic-tee-long-sleeve")

    await user.click(screen.getByRole("button", { name: "Duplicate" }))

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        {
          title: "Classic Tee - Long Sleeve",
          handle: "classic-tee-long-sleeve",
          include: ALL_SELECTED,
        },
        expect.any(Object)
      )
    )
  })

  it("does not submit when the title is emptied", async () => {
    const user = userEvent.setup()
    renderForm()

    await user.clear(screen.getByRole("textbox", { name: "Title" }))
    await user.click(screen.getByRole("button", { name: "Duplicate" }))

    // Give the form a chance to (incorrectly) submit before asserting.
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  describe("duplication options", () => {
    // AC2: four groups, and nothing for basic product information, which is
    // always copied.
    it("offers a checkbox for each optional group", () => {
      renderForm()

      expect(screen.getAllByRole("checkbox")).toHaveLength(4)
      for (const name of [
        "Images",
        "Variants",
        "Prices",
        "Inventory settings",
      ]) {
        expect(checkbox(name)).toBeTruthy()
      }
    })

    // AC3
    it("starts with every group selected", () => {
      renderForm()

      for (const name of [
        "Images",
        "Variants",
        "Prices",
        "Inventory settings",
      ]) {
        expect(isChecked(name)).toBe(true)
      }
    })

    it("sends only the groups left selected", async () => {
      mutateAsync.mockResolvedValue({})
      const user = userEvent.setup()
      renderForm()

      await user.click(checkbox("Images"))
      await user.click(checkbox("Prices"))
      await user.click(screen.getByRole("button", { name: "Duplicate" }))

      await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
      expect(submittedInclude()).toEqual({
        images: false,
        variants: true,
        prices: false,
        inventory_settings: true,
      })
    })

    // AC8: prices and inventory settings live on the variants.
    it("disables prices and inventory settings when variants are unselected", async () => {
      const user = userEvent.setup()
      renderForm()

      await user.click(checkbox("Variants"))

      expect(checkbox("Prices").disabled).toBe(true)
      expect(checkbox("Inventory settings").disabled).toBe(true)
      expect(checkbox("Images").disabled).toBe(false)
    })

    it("unselects prices and inventory settings when variants are unselected", async () => {
      mutateAsync.mockResolvedValue({})
      const user = userEvent.setup()
      renderForm()

      await user.click(checkbox("Variants"))

      expect(isChecked("Prices")).toBe(false)
      expect(isChecked("Inventory settings")).toBe(false)

      await user.click(screen.getByRole("button", { name: "Duplicate" }))

      await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
      expect(submittedInclude()).toEqual({
        images: true,
        variants: false,
        prices: false,
        inventory_settings: false,
      })
    })

    it("leaves prices and inventory settings unselected when variants come back", async () => {
      const user = userEvent.setup()
      renderForm()

      await user.click(checkbox("Variants"))
      await user.click(checkbox("Variants"))

      // Re-enabled, but the owner chooses again rather than silently getting
      // the groups back.
      expect(checkbox("Prices").disabled).toBe(false)
      expect(isChecked("Prices")).toBe(false)
      expect(isChecked("Variants")).toBe(true)
    })

    it("submits the narrowest selection", async () => {
      mutateAsync.mockResolvedValue({})
      const user = userEvent.setup()
      renderForm()

      await user.click(checkbox("Images"))
      await user.click(checkbox("Variants"))
      await user.click(screen.getByRole("button", { name: "Duplicate" }))

      await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
      expect(submittedInclude()).toEqual({
        images: false,
        variants: false,
        prices: false,
        inventory_settings: false,
      })
    })
  })

  // AC9. `mutateAsync` is the real react-query mutation in the app, so the
  // callbacks it is given here are invoked the way react-query invokes them.
  describe("after duplicating", () => {
    const submit = async () => {
      const user = userEvent.setup()
      renderForm()
      await user.click(screen.getByRole("button", { name: "Duplicate" }))
    }

    it("goes to the new product and replaces the drawer in history", async () => {
      mutateAsync.mockImplementation(async (_payload, { onSuccess }) =>
        onSuccess({ product: { id: "prod_2", title: "Classic Tee (Copy)" } })
      )

      await submit()

      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith("/products/prod_2", {
          replace: true,
        })
      )
      expect(toastSuccess).toHaveBeenCalled()
      expect(toastError).not.toHaveBeenCalled()
    })

    it("shows the error and stays put when duplication fails", async () => {
      mutateAsync.mockImplementation(async (_payload, { onError }) =>
        onError(
          new Error('Product with handle "classic-tee-copy" already exists.')
        )
      )

      await submit()

      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith(
          'Product with handle "classic-tee-copy" already exists.'
        )
      )
      expect(navigate).not.toHaveBeenCalled()
    })
  })
})
