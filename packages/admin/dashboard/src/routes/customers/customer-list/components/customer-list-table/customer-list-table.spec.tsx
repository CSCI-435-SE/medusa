// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The customers hooks module pulls in the SDK client (lib/client/client.ts),
// which reads __BACKEND_URL__/__AUTH_TYPE__/__JWT_TOKEN_STORAGE_KEY__ as bare
// globals at module load. Vite's `define` supplies those when the app runs,
// but nothing does in the test environment, so importing this file throws a
// ReferenceError without them. Same workaround as edit-product-form.spec.tsx
// and combobox.spec.tsx.
vi.hoisted(() => {
  const g = global as any
  g.__BACKEND_URL__ = "http://localhost:9000"
  g.__AUTH_TYPE__ = "session"
  g.__JWT_TOKEN_STORAGE_KEY__ = ""
})

// The action menu renders icons from @medusajs/icons through Radix's dropdown
// trigger, which does not render reliably in jsdom. combobox.spec.tsx stubs
// icons the same way for the same reason. The full table also renders icons
// for search, filters and sorting, so every icon is stubbed.
vi.mock("@medusajs/icons", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return Object.fromEntries(
    Object.keys(actual).map((name) => [
      name,
      () => <div data-testid={`icon-${name}`} />,
    ])
  )
})

const mockPrompt = vi.fn()
const mockMutateAsync = vi.fn()
const mockCan = vi.fn()

vi.mock("@medusajs/ui", async () => {
  const actual = await vi.importActual<typeof import("@medusajs/ui")>(
    "@medusajs/ui"
  )
  return {
    ...actual,
    usePrompt: () => mockPrompt,
    toast: { success: vi.fn(), error: vi.fn() },
  }
})

vi.mock("../../../../../hooks/api/customers", () => ({
  useCustomers: vi.fn(),
  useDeleteCustomer: () => ({ mutateAsync: mockMutateAsync }),
}))

// The group filter loads the list of customer groups to offer as options.
vi.mock("../../../../../hooks/api/customer-groups", () => ({
  useCustomerGroups: () => ({ customer_groups: [] }),
}))

// The create button's PermissionGuard also registers and checks permissions.
vi.mock("../../../../../providers/permissions-provider", () => ({
  usePermissions: () => ({
    can: mockCan,
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    isLoading: false,
  }),
  useRegisterPermissions: vi.fn(),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        "actions.edit": "Edit",
        "actions.delete": "Delete",
        "actions.import": "Import",
        "customers.fields.groups": "Groups",
      }
      return labels[key] ?? key
    },
    // The date cell reads the language to pick a date locale.
    i18n: { language: "en" },
  }),
}))

import { TooltipProvider } from "@medusajs/ui"
import { useCustomers } from "../../../../../hooks/api/customers"
import { CustomerActions, CustomerListTable } from "./customer-list-table"

const customer = {
  id: "cus_1",
  email: "someone@example.com",
} as any

// The edit action renders a react-router Link, so the menu needs a router
// context even though this suite is only exercising delete.
const renderActions = () =>
  render(
    <MemoryRouter>
      <CustomerActions customer={customer} />
    </MemoryRouter>
  )

const openMenu = async () => {
  const user = userEvent.setup()
  await user.click(screen.getByRole("button"))
  return user
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCan.mockReturnValue(true)
  mockPrompt.mockResolvedValue(true)
  mockMutateAsync.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
})

describe("CustomerActions", () => {
  it("offers a delete action when the user may delete customers", async () => {
    renderActions()
    await openMenu()

    expect(await screen.findByText("Delete")).toBeTruthy()
  })

  it("hides the delete action when the user may not delete customers", async () => {
    // Only "update" is permitted, so the menu should still open for Edit but
    // must not offer Delete.
    mockCan.mockImplementation((_resource, action) => action === "update")

    renderActions()
    await openMenu()

    expect(await screen.findByText("Edit")).toBeTruthy()
    expect(screen.queryByText("Delete")).toBeNull()
  })

  it("deletes the customer once the prompt is confirmed", async () => {
    renderActions()
    const user = await openMenu()

    await user.click(await screen.findByText("Delete"))

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled())
    expect(mockPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ verificationText: customer.email })
    )
  })

  it("does not delete the customer when the prompt is cancelled", async () => {
    mockPrompt.mockResolvedValue(false)

    renderActions()
    const user = await openMenu()

    await user.click(await screen.findByText("Delete"))

    await waitFor(() => expect(mockPrompt).toHaveBeenCalled())
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })
})

describe("CustomerListTable", () => {
  const customerInTwoGroups = {
    id: "cus_2",
    email: "jo@example.com",
    first_name: "Jo",
    last_name: "Doe",
    has_account: false,
    created_at: "2026-01-01T00:00:00.000Z",
    groups: [
      { id: "cusgroup_1", name: "VIP" },
      { id: "cusgroup_2", name: "Wholesale" },
    ],
  }

  const renderTable = (url = "/customers") =>
    render(
      <MemoryRouter initialEntries={[url]}>
        <TooltipProvider>
          <CustomerListTable />
        </TooltipProvider>
      </MemoryRouter>
    )

  beforeEach(() => {
    // The table scrolls back to the top when its data changes, and jsdom does
    // not implement Element.scroll.
    Element.prototype.scroll = vi.fn()

    vi.mocked(useCustomers).mockReturnValue({
      customers: [customerInTwoGroups],
      count: 1,
      isLoading: false,
      isError: false,
      error: null,
    } as any)
  })

  it("links to the customer import from the list header", () => {
    renderTable()

    const link = screen.getByRole("link", { name: "Import" })
    expect(link.getAttribute("href")).toBe("/customers/import")
  })

  it("shows a Groups column with each customer's groups", () => {
    renderTable()

    expect(screen.getByText("Groups")).toBeTruthy()
    expect(screen.getByText("VIP, Wholesale")).toBeTruthy()
  })

  it("adds groups to the request without changing search, filters, sorting or paging", () => {
    renderTable("/customers?q=jo&groups=cusgroup_1&offset=20&order=-email")

    const [params] = vi.mocked(useCustomers).mock.calls.at(-1)!

    expect(params).toMatchObject({
      q: "jo",
      groups: ["cusgroup_1"],
      offset: 20,
      limit: 20,
      order: "-email",
    })

    // Every field must start with "+" so it is added to the default customer
    // fields instead of replacing them, which would drop email, name, etc.
    const fields = (params?.fields ?? "").split(",")
    expect(fields).toContain("+groups.name")
    expect(fields.every((field) => field.startsWith("+"))).toBe(true)
  })
})
