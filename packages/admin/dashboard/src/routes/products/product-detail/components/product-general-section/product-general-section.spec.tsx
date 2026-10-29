// @vitest-environment jsdom
import { HttpTypes } from "@medusajs/types"
import { TooltipProvider } from "@medusajs/ui"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

// The section pulls in the SDK client through the product hooks, which reads
// these bare globals at module load time (see edit-product-form.spec.tsx).
vi.hoisted(() => {
  const g = global as any
  g.__BACKEND_URL__ = "http://localhost:9000"
  g.__AUTH_TYPE__ = "session"
  g.__JWT_TOKEN_STORAGE_KEY__ = ""
})

import { ProductGeneralSection } from "./product-general-section"

// Only the delete mutation is used by the section, and it is not exercised.
vi.mock("../../../../../hooks/api/products", () => ({
  useDeleteProduct: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock("../../../../../providers/extension-provider", () => ({
  useExtension: () => ({ getDisplays: () => [] }),
}))

vi.mock("../../../../../providers/feature-flag-provider", () => ({
  useFeatureFlag: () => false,
}))

// Icons rendered under Radix Slot/asChild triggers break in jsdom (see
// edit-product-form.spec.tsx), so the icons this render uses are stubbed with
// empty elements. (Do not use a catch-all Proxy here: answering `then` with a
// function makes the module look like a promise and the import never resolves.)
vi.mock("@medusajs/icons", () => {
  const Icon = () => <span />
  return {
    GlobeEurope: Icon,
    PencilSquare: Icon,
    SquareTwoStack: Icon,
    Trash: Icon,
    EllipsisHorizontal: Icon,
    InformationCircleSolid: Icon,
    TrianglesMini: Icon,
    Check: Icon,
    XMark: Icon,
    ExclamationCircleSolid: Icon,
  }
})

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

afterEach(() => {
  cleanup()
})

const product = {
  id: "prod_1",
  title: "Classic Tee",
  handle: "classic-tee",
  status: "published",
} as unknown as HttpTypes.AdminProduct

const renderSection = () => {
  const router = createMemoryRouter(
    [
      {
        path: "/products/:id",
        element: (
          <TooltipProvider delayDuration={0}>
            <ProductGeneralSection product={product} />
          </TooltipProvider>
        ),
      },
    ],
    { initialEntries: ["/products/prod_1"] }
  )

  render(<RouterProvider router={router} />)
}

describe("ProductGeneralSection actions menu", () => {
  it("has a Duplicate action that links to the duplicate route", async () => {
    const user = userEvent.setup()
    renderSection()

    // The actions menu trigger is the only button in the section.
    await user.click(screen.getByRole("button"))

    const duplicate = (await screen.findByText("Duplicate")).closest("a")

    expect(duplicate?.getAttribute("href")).toEqual(
      "/products/prod_1/duplicate"
    )
  })
})
