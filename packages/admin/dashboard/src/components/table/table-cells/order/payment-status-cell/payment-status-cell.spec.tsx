// @vitest-environment jsdom
import { TooltipProvider } from "@medusajs/ui"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ReactElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PaymentStatusCell } from "./payment-status-cell"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        "orders.payment.status.captured": "Captured",
        "orders.payment.status.partiallyAuthorized": "Partially authorized",
      }
      return labels[key] ?? key
    },
  }),
}))

afterEach(() => {
  cleanup()
})

const renderWithTooltipProvider = (ui: ReactElement) => {
  return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>)
}

describe("PaymentStatusCell", () => {
  it("shows the full status text on hover for a short payment status", async () => {
    const user = userEvent.setup()
    renderWithTooltipProvider(<PaymentStatusCell status="captured" />)

    expect(screen.queryByRole("tooltip")).toBeNull()

    const label = screen.getByText("Captured")

    await user.hover(label)

    const tooltip = await screen.findByRole("tooltip")
    expect(tooltip.textContent).toBe("Captured")
  })

  it("shows the full status text on hover for a long, truncated payment status", async () => {
    const user = userEvent.setup()
    renderWithTooltipProvider(
      <PaymentStatusCell status="partially_authorized" />
    )

    const label = screen.getByText("Partially authorized")

    await user.hover(label)

    const tooltip = await screen.findByRole("tooltip")
    expect(tooltip.textContent).toBe("Partially authorized")
  })
})
