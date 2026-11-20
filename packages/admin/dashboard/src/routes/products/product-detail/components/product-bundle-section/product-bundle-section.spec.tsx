// @vitest-environment jsdom
import { HttpTypes } from "@medusajs/types"
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

// The SDK client reads these bare globals at module load time (see
// edit-product-form.spec.tsx); Vite injects them in the real app.
vi.hoisted(() => {
  const g = global as any
  g.__BACKEND_URL__ = "http://localhost:9000"
  g.__AUTH_TYPE__ = "session"
  g.__JWT_TOKEN_STORAGE_KEY__ = ""
})

import { ProductBundleSection } from "./product-bundle-section"

const variants = vi.hoisted(() => ({
  value: [] as any[],
}))

vi.mock("../../../../../hooks/api/product-variants", () => ({
  useVariants: () => ({ variants: variants.value, isPending: false }),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const labels: Record<string, string> = {
        "products.bundles.section.header": "Bundle components",
        "products.bundles.section.hint": "The variants this bundle is made of.",
      }

      if (key === "products.bundles.section.quantity") {
        return `${options?.count}x`
      }

      if (key === "products.bundles.section.unknownVariant") {
        return `Variant ${options?.id}`
      }

      return labels[key] ?? key
    },
  }),
}))

vi.mock("@medusajs/icons", () => ({
  InformationCircleSolid: () => <div />,
  PencilSquare: () => <div />,
  EllipsisHorizontal: () => <div />,
}))

afterEach(() => {
  cleanup()
  variants.value = []
})

const cameraKit = {
  id: "prod_kit",
  title: "Camera kit",
  metadata: {
    bundle: {
      components: [
        { variant_id: "variant_camera", quantity: 1 },
        { variant_id: "variant_lens", quantity: 2 },
      ],
    },
  },
} as unknown as HttpTypes.AdminProduct

const renderSection = (product: HttpTypes.AdminProduct) =>
  render(
    <MemoryRouter>
      <ProductBundleSection product={product} />
    </MemoryRouter>
  )

describe("ProductBundleSection (AC 5)", () => {
  it("lists each component with its quantity", () => {
    variants.value = [
      {
        id: "variant_camera",
        title: "Body",
        product_id: "prod_camera",
        product: { id: "prod_camera", title: "Camera" },
      },
      {
        id: "variant_lens",
        title: "50mm",
        product_id: "prod_lens",
        product: { id: "prod_lens", title: "Lens" },
      },
    ]

    renderSection(cameraKit)

    expect(screen.getByText("Camera · Body")).toBeTruthy()
    expect(screen.getByText("Lens · 50mm")).toBeTruthy()
    expect(screen.getByText("1x")).toBeTruthy()
    expect(screen.getByText("2x")).toBeTruthy()
  })

  it("links each component to its own product page", () => {
    variants.value = [
      {
        id: "variant_camera",
        title: "Body",
        product_id: "prod_camera",
        product: { id: "prod_camera", title: "Camera" },
      },
      {
        id: "variant_lens",
        title: "50mm",
        product_id: "prod_lens",
        product: { id: "prod_lens", title: "Lens" },
      },
    ]

    renderSection(cameraKit)

    expect(
      screen.getByRole("link", { name: "Camera · Body" }).getAttribute("href")
    ).toEqual("/products/prod_camera")
    expect(
      screen.getByRole("link", { name: "Lens · 50mm" }).getAttribute("href")
    ).toEqual("/products/prod_lens")
  })

  it("keeps the component listed when its variant cannot be read", () => {
    // A component whose product was removed from the admin's view still has to
    // be visible, otherwise the bundle looks like it has fewer parts than it
    // does.
    variants.value = [
      {
        id: "variant_camera",
        title: "Body",
        product_id: "prod_camera",
        product: { id: "prod_camera", title: "Camera" },
      },
    ]

    renderSection(cameraKit)

    expect(screen.getByText("Camera · Body")).toBeTruthy()
    expect(screen.getByText("Variant variant_lens")).toBeTruthy()
    expect(
      screen.queryByRole("link", { name: "Variant variant_lens" })
    ).toBeNull()
  })

  it("renders nothing for a product that is not a bundle", () => {
    const { container } = renderSection({
      id: "prod_shirt",
      title: "Shirt",
      metadata: null,
    } as unknown as HttpTypes.AdminProduct)

    expect(container.firstChild).toBeNull()
  })
})
