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
// icons the same way for the same reason.
vi.mock("@medusajs/icons", () => ({
  PencilSquare: () => <div data-testid="pencil-icon" />,
  Trash: () => <div data-testid="trash-icon" />,
  EllipsisHorizontal: () => <div data-testid="ellipsis-icon" />,
}))

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

vi.mock("../../../../../providers/permissions-provider", () => ({
  usePermissions: () => ({ can: mockCan }),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        "actions.edit": "Edit",
        "actions.delete": "Delete",
      }
      return labels[key] ?? key
    },
  }),
}))

import { CustomerActions } from "./customer-list-table"

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
