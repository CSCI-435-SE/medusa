// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import en from "../../../../../i18n/translations/en.json"
import { ProductTitleCell } from "./product-title-cell"

// Look keys up in the real English translations so the test checks the text a
// user actually sees.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const value = key.split(".").reduce<any>((node, part) => node?.[part], en)
      return typeof value === "string" ? value : key
    },
  }),
}))

// shortcut: @medusajs/icons has its own React 19 in node_modules, so the Photo
// icon inside Thumbnail can't render under the dashboard's React 18 in tests.
// Remove this stub once the icons package shares the dashboard's React.
vi.mock("../../../../../components/common/thumbnail", () => ({
  Thumbnail: () => null,
}))

afterEach(() => {
  cleanup()
})

const product = (metadata: Record<string, unknown> | null) => ({
  title: "Camera kit",
  thumbnail: null,
  metadata,
})

describe("ProductTitleCell", () => {
  it("AC1: shows a Bundle badge next to the title of a bundle product", () => {
    render(
      <ProductTitleCell
        product={product({
          bundle: { components: [{ variant_id: "variant_1", quantity: 2 }] },
        })}
      />
    )

    expect(screen.getByText("Camera kit")).toBeTruthy()
    expect(screen.getByText("Bundle")).toBeTruthy()
  })

  it("AC2: shows no badge for a regular product", () => {
    const { rerender } = render(<ProductTitleCell product={product(null)} />)
    expect(screen.getByText("Camera kit")).toBeTruthy()
    expect(screen.queryByText("Bundle")).toBeNull()

    // Other metadata, or a non-object bundle value, isn't a bundle either.
    rerender(
      <ProductTitleCell product={product({ color: "red", bundle: null })} />
    )
    expect(screen.queryByText("Bundle")).toBeNull()
  })
})
