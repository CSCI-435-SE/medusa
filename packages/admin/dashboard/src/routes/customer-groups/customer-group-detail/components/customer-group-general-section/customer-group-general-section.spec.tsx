// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

// The action menu renders icons through Radix's dropdown trigger, which does
// not render reliably in jsdom, so they are stubbed.
vi.mock("@medusajs/icons", () => ({
  PencilSquare: () => <div data-testid="pencil-icon" />,
  Trash: () => <div data-testid="trash-icon" />,
  EllipsisHorizontal: () => <div data-testid="ellipsis-icon" />,
}))

vi.mock("@medusajs/ui", async () => {
  const actual = await vi.importActual<typeof import("@medusajs/ui")>(
    "@medusajs/ui"
  )
  return {
    ...actual,
    usePrompt: () => vi.fn(),
  }
})

// Mocking the hooks module keeps the SDK client (and the globals it reads at
// module load) out of this test.
vi.mock("../../../../../hooks/api/customer-groups", () => ({
  useDeleteCustomerGroup: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

import { CustomerGroupGeneralSection } from "./customer-group-general-section"

afterEach(() => {
  cleanup()
})

const renderSection = (customers: { id: string }[]) =>
  render(
    <MemoryRouter>
      <CustomerGroupGeneralSection
        group={{ id: "cusgroup_1", name: "VIP", customers } as any}
      />
    </MemoryRouter>
  )

describe("CustomerGroupGeneralSection", () => {
  it("shows 0 customers for an empty group, matching the groups list", () => {
    renderSection([])

    expect(screen.getByText("0")).toBeTruthy()
    expect(screen.queryByText("-")).toBeNull()
  })

  it("shows the number of customers in the group", () => {
    renderSection([{ id: "cus_1" }, { id: "cus_2" }, { id: "cus_3" }])

    expect(screen.getByText("3")).toBeTruthy()
  })
})
