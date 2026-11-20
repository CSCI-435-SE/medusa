// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import { resolveBundleUsage } from "./bundle-usage"
import { BundleUsageList } from "./bundle-usage-list"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      return key === "products.bundles.usage.description"
        ? "Remove it from these bundles first:"
        : key
    },
  }),
}))

afterEach(() => {
  cleanup()
})

const components = [
  { variant_id: "variant_camera", quantity: 1 },
  { variant_id: "variant_lens", quantity: 1 },
]

const products = [
  {
    id: "prod_kit",
    title: "Camera kit",
    metadata: { bundle: { components } },
  },
  {
    id: "prod_deal",
    title: "Lens deal",
    metadata: {
      bundle: {
        components: [{ variant_id: "variant_lens", quantity: 2 }],
      },
    },
  },
  { id: "prod_lens", title: "Lens", metadata: null },
]

const makeClient = () => ({
  listProducts: vi.fn().mockResolvedValue({ products }),
  listVariants: vi.fn().mockResolvedValue({
    variants: [{ id: "variant_lens" }],
  }),
})

const blocked = { code: "bundle_in_use" }

describe("resolveBundleUsage (AC 7)", () => {
  it("names the bundles that use a variant being deleted", async () => {
    const client = makeClient()

    const usage = await resolveBundleUsage({
      error: blocked,
      variantIds: ["variant_lens"],
      client,
    })

    expect(usage).toEqual([
      { id: "prod_kit", title: "Camera kit" },
      { id: "prod_deal", title: "Lens deal" },
    ])
    expect(client.listVariants).not.toHaveBeenCalled()
  })

  it("looks up the variants of a product being deleted", async () => {
    const client = makeClient()

    const usage = await resolveBundleUsage({
      error: blocked,
      productId: "prod_lens",
      client,
    })

    expect(client.listVariants).toHaveBeenCalledWith("prod_lens")
    expect(usage).toEqual([
      { id: "prod_kit", title: "Camera kit" },
      { id: "prod_deal", title: "Lens deal" },
    ])
  })

  it("does not list the bundle being deleted itself", async () => {
    const client = makeClient()
    client.listVariants.mockResolvedValue({ variants: [{ id: "variant_kit" }] })
    client.listProducts.mockResolvedValue({
      products: [
        {
          id: "prod_kit",
          title: "Camera kit",
          metadata: { bundle: { components: [{ variant_id: "variant_kit" }] } },
        },
      ],
    })

    const usage = await resolveBundleUsage({
      error: blocked,
      productId: "prod_kit",
      client,
    })

    expect(usage).toEqual([])
  })

  // Only the tagged error means "a bundle uses this". Anything else keeps the
  // plain message it came with, and costs no extra requests.
  it("ignores a failure that is not about a bundle", async () => {
    const client = makeClient()

    expect(
      await resolveBundleUsage({
        error: { code: "insufficient_inventory" },
        variantIds: ["variant_lens"],
        client,
      })
    ).toBeNull()
    expect(client.listProducts).not.toHaveBeenCalled()
  })

  it("gives up rather than throwing when the lookup fails", async () => {
    const client = makeClient()
    client.listProducts.mockRejectedValue(new Error("network"))

    expect(
      await resolveBundleUsage({
        error: blocked,
        variantIds: ["variant_lens"],
        client,
      })
    ).toBeNull()
  })
})

describe("BundleUsageList (AC 7)", () => {
  it("lists every bundle with a link to it", () => {
    render(
      <MemoryRouter>
        <BundleUsageList
          bundles={[
            { id: "prod_kit", title: "Camera kit" },
            { id: "prod_deal", title: "Lens deal" },
          ]}
        />
      </MemoryRouter>
    )

    expect(screen.getByText("Remove it from these bundles first:")).toBeTruthy()
    expect(
      screen.getByRole("link", { name: "Camera kit" }).getAttribute("href")
    ).toEqual("/products/prod_kit")
    expect(
      screen.getByRole("link", { name: "Lens deal" }).getAttribute("href")
    ).toEqual("/products/prod_deal")
  })

  it("falls back to the bundle's id when it has no title", () => {
    render(
      <MemoryRouter>
        <BundleUsageList bundles={[{ id: "prod_kit", title: null }]} />
      </MemoryRouter>
    )

    expect(
      screen.getByRole("link", { name: "prod_kit" }).getAttribute("href")
    ).toEqual("/products/prod_kit")
  })
})
