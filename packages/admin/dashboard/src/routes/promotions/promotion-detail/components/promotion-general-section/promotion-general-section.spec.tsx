// @vitest-environment jsdom
import { HttpTypes } from "@medusajs/types"
import { TooltipProvider } from "@medusajs/ui"
import { cleanup, render, screen } from "@testing-library/react"
import { ReactNode } from "react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

// The promotion hooks module pulls in the SDK client, which reads these
// globals at module load. Vite's `define` supplies them in the app, but
// nothing does in the test environment.
vi.hoisted(() => {
  const g = global as any
  g.__BACKEND_URL__ = "http://localhost:9000"
  g.__AUTH_TYPE__ = "session"
  g.__JWT_TOKEN_STORAGE_KEY__ = ""
})

vi.mock("../../../../../hooks/api/promotions", () => ({
  useDeletePromotion: () => ({ mutateAsync: vi.fn() }),
}))

// The status map translates its labels when the module loads, before i18n is
// set up, so the status is stubbed.
vi.mock("../../../../../lib/promotions", () => ({
  getPromotionStatus: () => ["green", "Active"],
}))

// This suite only covers the menu, so it renders its actions as plain links
// and buttons.
vi.mock("../../../../../components/common/action-menu", () => ({
  ActionMenu: ({ groups }: { groups: { actions: any[] }[] }) => (
    <div>
      {groups
        .flatMap((group) => group.actions)
        .map(
          (action): ReactNode =>
            action.to ? (
              <a key={action.label} href={action.to}>
                {action.label}
              </a>
            ) : (
              <button key={action.label}>{action.label}</button>
            )
        )}
    </div>
  ),
}))

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

import { PromotionGeneralSection } from "./promotion-general-section"

const promotion = {
  id: "promo_summer",
  code: "SUMMER20",
  type: "standard",
  status: "active",
  is_automatic: false,
  application_method: {
    type: "percentage",
    value: 20,
    target_type: "order",
    allocation: "across",
  },
} as unknown as HttpTypes.AdminPromotion

afterEach(() => {
  cleanup()
})

describe("PromotionGeneralSection", () => {
  it("has a Duplicate action that opens the duplicate dialog", () => {
    render(
      <TooltipProvider>
        <MemoryRouter>
          <PromotionGeneralSection promotion={promotion} />
        </MemoryRouter>
      </TooltipProvider>
    )

    const link = screen.getByRole("link", { name: "Duplicate" })
    expect(link.getAttribute("href")).toBe("/promotions/promo_summer/duplicate")
  })
})
