// @vitest-environment jsdom
import { TooltipProvider } from "@medusajs/ui"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ReactElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import en from "../../../../../i18n/translations/en.json"
import { GroupsCell } from "./groups-cell"

// Look keys up in the real English translations so the assertions check the
// text a user actually sees, e.g. "+ 2 more" from general.plusCountMore.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const value = key.split(".").reduce<any>((node, part) => node?.[part], en)

      if (typeof value !== "string") {
        return key
      }

      return value.replace(/{{(\w+)}}/g, (_, name) =>
        String(options?.[name] ?? "")
      )
    },
  }),
}))

afterEach(() => {
  cleanup()
})

const renderWithTooltipProvider = (ui: ReactElement) => {
  return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>)
}

const group = (id: string, name: string) => ({ id, name } as any)

describe("GroupsCell", () => {
  it("shows a placeholder when the customer is in no groups", () => {
    const { rerender } = renderWithTooltipProvider(<GroupsCell groups={[]} />)
    expect(screen.getByText("-")).toBeTruthy()

    rerender(
      <TooltipProvider delayDuration={0}>
        <GroupsCell groups={undefined} />
      </TooltipProvider>
    )
    expect(screen.getByText("-")).toBeTruthy()

    rerender(
      <TooltipProvider delayDuration={0}>
        <GroupsCell groups={null} />
      </TooltipProvider>
    )
    expect(screen.getByText("-")).toBeTruthy()
  })

  it("lists one or two groups separated by a comma", () => {
    renderWithTooltipProvider(
      <GroupsCell
        groups={[group("cusgroup_1", "VIP"), group("cusgroup_2", "Wholesale")]}
      />
    )

    expect(screen.getByText("VIP, Wholesale")).toBeTruthy()
    expect(screen.queryByText(/more/)).toBeNull()
  })

  it("shows the first two groups and a +N more tooltip for the rest", async () => {
    const user = userEvent.setup()
    renderWithTooltipProvider(
      <GroupsCell
        groups={[
          group("cusgroup_1", "VIP"),
          group("cusgroup_2", "Wholesale"),
          group("cusgroup_3", "Newsletter"),
          group("cusgroup_4", "Staff"),
        ]}
      />
    )

    expect(screen.getByText("VIP, Wholesale")).toBeTruthy()
    expect(screen.queryByText(/Newsletter/)).toBeNull()

    const more = screen.getByText("+ 2 more")
    await user.hover(more)

    const tooltip = await screen.findByRole("tooltip")
    expect(tooltip.textContent).toContain("Newsletter")
    expect(tooltip.textContent).toContain("Staff")
    expect(tooltip.textContent).not.toContain("VIP")
  })
})
