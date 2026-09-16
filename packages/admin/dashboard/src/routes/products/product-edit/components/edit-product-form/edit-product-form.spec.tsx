// @vitest-environment jsdom
import { HttpTypes } from "@medusajs/types"
import { TooltipProvider } from "@medusajs/ui"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

// EditProductForm pulls in the SDK client (lib/client/client.ts) via
// useUpdateProduct, which reads __BACKEND_URL__/__AUTH_TYPE__/
// __JWT_TOKEN_STORAGE_KEY__ as bare globals at module load time. Those are
// normally injected by Vite's `define` config when the app actually runs,
// but nothing provides them in the test environment, so referencing them
// throws a ReferenceError as soon as this file is imported. Setting them
// here mirrors the same fix already used in combobox.spec.tsx for the same
// underlying issue.
vi.hoisted(() => {
  const g = global as any
  g.__BACKEND_URL__ = "http://localhost:9000"
  g.__AUTH_TYPE__ = "session"
  g.__JWT_TOKEN_STORAGE_KEY__ = ""
})

import { RouteDrawer } from "../../../../../components/modals"
import { ExtensionApi } from "../../../../../dashboard-app/types"
import { ExtensionContext } from "../../../../../providers/extension-provider/extension-context"
import { EditProductForm } from "./edit-product-form"

// jsdom doesn't implement ResizeObserver, which Radix's Select uses
// internally to size its value display - unrelated to what this suite is
// testing, so it's polyfilled with a no-op the same way combobox.spec.tsx
// polyfills IntersectionObserver for the same kind of reason.
class MockResizeObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}

Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  configurable: true,
  value: MockResizeObserver,
})

// Every @medusajs/icons icon rendered as the direct child of a Radix
// Slot/asChild-based trigger (the status Select's chevron, the handle
// field's info-tooltip) breaks under jsdom in this test environment -
// unrelated to the character count this suite is testing - so, the same way
// combobox.spec.tsx already does for a simpler tree, the icons this render
// actually uses (per Select and Drawer's own imports) are stubbed wholesale.
vi.mock("@medusajs/icons", () => ({
  InformationCircleSolid: () => (
    <div data-testid="information-circle-solid" />
  ),
  TrianglesMini: () => <div data-testid="triangles-mini" />,
  Check: () => <div data-testid="check" />,
  XMark: () => <div data-testid="x-mark" />,
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => {
      if (key === "general.characters") {
        const count = options?.count ?? 0
        return count === 1 ? "1 character" : `${count} characters`
      }

      const labels: Record<string, string> = {
        "fields.status": "Status",
        "fields.title": "Title",
        "fields.subtitle": "Subtitle",
        "fields.handle": "Handle",
        "fields.material": "Material",
        "fields.description": "Description",
        "fields.discountable": "Discountable",
        "fields.optional": "optional",
        "products.discountableHint":
          "When unchecked, discounts will not be applied to this product",
        "actions.cancel": "Cancel",
        "actions.save": "Save",
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
  status: "draft",
  title: "Winter jacket",
  subtitle: "",
  handle: "winter-jacket",
  material: "",
  description: "",
  discountable: true,
} as unknown as HttpTypes.AdminProduct

// EditProductForm only calls getFormFields/getFormConfigs (for the
// FormExtensionZone), so the rest of the real ExtensionApi surface is
// irrelevant here and stubbed out as no-ops.
const extensionApi: ExtensionApi = {
  getMenu: () => [],
  getWidgets: () => [],
  getLayout: () => undefined,
  getWidgetsForSections: () => ({}),
  getFormFields: () => [],
  getFormConfigs: () => [],
  getDisplays: () => [],
  getI18nResources: () => ({ resources: {} }) as any,
}

// EditProductForm is a route-level component: it reads from useExtension(),
// useRouteModal() and useUpdateProduct() (react-query), and renders through
// RouteDrawer.Form, whose RouteModalForm calls react-router's useBlocker -
// which requires a real "data router" (createMemoryRouter), not the plain
// <MemoryRouter> component. Rather than reaching into each of those
// dependencies individually, this wraps EditProductForm in the real
// RouteDrawer (which itself sets up RouteModalProvider) plus the same
// minimal provider stack the real app mounts it under, so the component
// under test is exercised exactly as it runs in production.
const renderEditForm = () => {
  const queryClient = new QueryClient()

  const router = createMemoryRouter(
    [
      {
        path: "/products/:id/edit",
        element: (
          <TooltipProvider delayDuration={0}>
            <RouteDrawer>
              <EditProductForm product={product} />
            </RouteDrawer>
          </TooltipProvider>
        ),
      },
    ],
    { initialEntries: ["/products/prod_1/edit"] }
  )

  render(
    <QueryClientProvider client={queryClient}>
      <ExtensionContext.Provider value={extensionApi}>
        <RouterProvider router={router} />
      </ExtensionContext.Provider>
    </QueryClientProvider>
  )
}

describe("EditProductForm", () => {
  it("shows the current description's character count", () => {
    renderEditForm()

    expect(screen.getByText("0 characters")).toBeTruthy()
  })

  it("updates the character count live as the user types", async () => {
    const user = userEvent.setup()
    renderEditForm()

    const textarea = screen.getByRole("textbox", { name: "Description" })
    await user.type(textarea, "Hello world")

    expect(screen.getByText("11 characters")).toBeTruthy()
  })

  it("uses the singular form when there is exactly 1 character", async () => {
    const user = userEvent.setup()
    renderEditForm()

    const textarea = screen.getByRole("textbox", { name: "Description" })
    await user.type(textarea, "H")

    expect(screen.getByText("1 character")).toBeTruthy()
  })
})
