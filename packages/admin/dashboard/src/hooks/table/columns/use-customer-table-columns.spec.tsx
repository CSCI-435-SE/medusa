// @vitest-environment jsdom
import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useCustomerTableColumns } from "./use-customer-table-columns"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe("useCustomerTableColumns", () => {
  // The groups column is added only by the customers list itself. This hook is
  // shared with the customer group detail table and the add customers form,
  // which should not get it, so guard against it moving in here.
  it("does not include a groups column", () => {
    const { result } = renderHook(() => useCustomerTableColumns())

    const keys = result.current.map(
      (column: any) => column.id ?? column.accessorKey
    )

    expect(keys).toEqual(["email", "name", "has_account", "created_at"])
    expect(keys).not.toContain("groups")
  })
})
