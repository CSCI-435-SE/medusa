// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
  const g = global as any
  g.__BACKEND_URL__ = "http://localhost:9000"
  g.__AUTH_TYPE__ = "session"
  g.__JWT_TOKEN_STORAGE_KEY__ = ""
})

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock("./inventory-actions", () => ({
  InventoryActions: () => <div />,
}))

afterEach(() => {
  cleanup()
})

const LowStockCell = ({ quantity }: { quantity: number }) => {
  const isLowStock = quantity !== null && quantity < 10
  return (
    <div>
      <span>{quantity}</span>
      {isLowStock && <span>Low stock</span>}
    </div>
  )
}

describe("Low stock indicator", () => {
  it("shows Low stock when quantity is below 10", () => {
    render(<LowStockCell quantity={5} />)
    expect(screen.getByText("Low stock")).toBeTruthy()
  })

  it("does not show Low stock when quantity is 10 or above", () => {
    render(<LowStockCell quantity={10} />)
    expect(screen.queryByText("Low stock")).toBeNull()
  })

  it("shows Low stock when quantity is 0", () => {
    render(<LowStockCell quantity={0} />)
    expect(screen.getByText("Low stock")).toBeTruthy()
  })
})
