// @vitest-environment jsdom
import { AdminOrderLineItem, AdminReturn } from "@medusajs/types"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BundleComponentBreakdown } from "./bundle-component-breakdown"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === "orders.summary.bundleComponents") {
        return `Bundle of ${options?.count}x items`
      }

      if (key === "orders.summary.bundleComponentReturned") {
        return `${options?.count} returned`
      }

      return key
    },
  }),
}))

vi.mock("@medusajs/icons", () => ({
  TriangleDownMini: () => <div data-testid="triangle" />,
}))

afterEach(() => {
  cleanup()
})

const cameraKitLine = {
  id: "ordli_kit",
  title: "Camera kit",
  metadata: {
    bundle: {
      components: [
        {
          variant_id: "variant_camera",
          title: "Camera · Body",
          quantity: 1,
          units: 1,
          refund_share: 666.67,
        },
        {
          variant_id: "variant_bag",
          title: "Bag",
          quantity: 2,
          units: 2,
          refund_share: 83.33,
        },
      ],
    },
  },
} as unknown as AdminOrderLineItem

const expand = async () => {
  const user = userEvent.setup({ delay: null })
  await user.click(screen.getByText("Bundle of 2x items"))
}

describe("BundleComponentBreakdown (AC 6)", () => {
  it("names the components of the bundle line and how many of each", async () => {
    render(<BundleComponentBreakdown item={cameraKitLine} returns={[]} />)

    await expand()

    expect(screen.getByText("Camera · Body")).toBeTruthy()
    expect(screen.getByText("Bag")).toBeTruthy()
    expect(screen.getByText("1x")).toBeTruthy()
    expect(screen.getByText("2x")).toBeTruthy()
  })

  it("marks the components that have been returned", async () => {
    const returns = [
      {
        id: "ret_1",
        status: "received",
        items: [
          {
            item_id: "ordli_kit",
            quantity: 1,
            received_quantity: 1,
            metadata: { bundle_component: { variant_id: "variant_bag" } },
          },
        ],
      },
    ] as unknown as AdminReturn[]

    render(<BundleComponentBreakdown item={cameraKitLine} returns={returns} />)

    await expand()

    expect(screen.getByText("1 returned")).toBeTruthy()
  })

  it("does not mark a component whose return has only been requested", async () => {
    // The customer said they would send the bag back but it has not arrived,
    // so AC 6 should not call it returned yet.
    const returns = [
      {
        id: "ret_1",
        status: "requested",
        items: [
          {
            item_id: "ordli_kit",
            quantity: 1,
            received_quantity: 0,
            metadata: { bundle_component: { variant_id: "variant_bag" } },
          },
        ],
      },
    ] as unknown as AdminReturn[]

    render(<BundleComponentBreakdown item={cameraKitLine} returns={returns} />)

    await expand()

    expect(screen.queryByText("1 returned")).toBeNull()
  })

  it("does not mark a component returned from another line", async () => {
    const returns = [
      {
        id: "ret_1",
        items: [
          {
            item_id: "ordli_other",
            quantity: 1,
            received_quantity: 1,
            metadata: { bundle_component: { variant_id: "variant_bag" } },
          },
        ],
      },
    ] as unknown as AdminReturn[]

    render(<BundleComponentBreakdown item={cameraKitLine} returns={returns} />)

    await expand()

    expect(screen.queryByText("1 returned")).toBeNull()
  })

  it("renders nothing for a line that is not a bundle", () => {
    const { container } = render(
      <BundleComponentBreakdown
        item={
          { id: "ordli_shirt", metadata: null } as unknown as AdminOrderLineItem
        }
        returns={[]}
      />
    )

    expect(container.firstChild).toBeNull()
  })
})
