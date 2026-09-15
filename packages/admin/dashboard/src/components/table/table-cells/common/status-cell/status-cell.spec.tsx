// @vitest-environment jsdom
import { TooltipProvider } from "@medusajs/ui"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ReactElement } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { StatusCell } from "./status-cell"

afterEach(() => {
  cleanup()
})

const renderWithTooltipProvider = (ui: ReactElement) => {
  return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>)
}

describe("StatusCell", () => {
  it("reveals the full label in a tooltip on hover when the label is long", async () => {
    const user = userEvent.setup()
    renderWithTooltipProvider(
      <StatusCell color="orange">Partially authorized</StatusCell>
    )

    expect(screen.queryByRole("tooltip")).toBeNull()

    const label = screen.getByText("Partially authorized")
    expect(label.getAttribute("data-state")).toBe("closed")

    await user.hover(label)

    const tooltip = await screen.findByRole("tooltip")
    expect(tooltip.textContent).toBe("Partially authorized")
  })

  it("also shows a tooltip on hover for a short label", async () => {
    const user = userEvent.setup()
    renderWithTooltipProvider(<StatusCell color="green">Captured</StatusCell>)

    expect(screen.queryByRole("tooltip")).toBeNull()

    const label = screen.getByText("Captured")
    expect(label.getAttribute("data-state")).toBe("closed")

    await user.hover(label)

    const tooltip = await screen.findByRole("tooltip")
    expect(tooltip.textContent).toBe("Captured")
  })
})
