// @vitest-environment jsdom
import { HttpTypes } from "@medusajs/types"
import { TooltipProvider } from "@medusajs/ui"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RouterProvider, createMemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

// The SDK client reads these bare globals at module load time (see
// edit-product-form.spec.tsx); Vite injects them in the real app.
vi.hoisted(() => {
  const g = global as any
  g.__BACKEND_URL__ = "http://localhost:9000"
  g.__AUTH_TYPE__ = "session"
  g.__JWT_TOKEN_STORAGE_KEY__ = ""
})

import { RouteFocusModal } from "../../../../../components/modals"
import { BundleCreateForm } from "./bundle-create-form"

/*
 * These cases drive a long form through userEvent in jsdom (typing, two option
 * pickers, several inputs), which takes longer than vitest's 5s default when
 * the suite runs alongside the rest of the dashboard's tests.
 */
vi.setConfig({ testTimeout: 20000 })

const mutateAsync = vi.fn()

vi.mock("../../../../../hooks/api/bundles", () => ({
  useCreateBundle: () => ({ mutateAsync, isPending: false }),
}))

// The variant picker's options come from the API in the real app.
vi.mock("../../../../../hooks/use-combobox-data", () => ({
  useComboboxData: () => ({
    options: [
      { label: "Camera body", value: "variant_camera" },
      { label: "Lens", value: "variant_lens" },
    ],
    searchValue: "",
    onSearchValueChange: vi.fn(),
    fetchNextPage: vi.fn(),
    disabled: false,
    isPending: false,
  }),
}))

/*
 * The product form's media and organization sections are reused as they are,
 * and both pull in a lot of machinery (drag and drop, several comboboxes, a
 * sales channel data table) that has nothing to do with what this suite
 * checks. They are stubbed so the test stays about the bundle: its components,
 * its price, and what happens when the server refuses the save.
 */
vi.mock(
  "../../../product-create/components/product-create-details-form/components/product-create-details-media-section",
  () => ({ ProductCreateMediaSection: () => <div data-testid="media" /> })
)
vi.mock(
  "../../../product-create/components/product-create-organize-form/components/product-create-organize-section",
  () => ({
    ProductCreateOrganizationSection: () => <div data-testid="organize" />,
  })
)
vi.mock(
  "../../../product-create/components/product-create-organize-form/components/product-create-sales-channel-stacked-modal",
  () => ({ ProductCreateSalesChannelStackedModal: () => null })
)

const labels = vi.hoisted(
  () =>
    ({
      "fields.title": "Title",
      "fields.handle": "Handle",
      "fields.variant": "Variant",
      "fields.quantity": "Quantity",
      "fields.optional": "optional",
      "actions.cancel": "Cancel",
      "actions.saveAsDraft": "Save as draft",
      "actions.publish": "Publish",
      "actions.remove": "Remove",
      "products.fields.title.label": "Title",
      "products.fields.subtitle.label": "Subtitle",
      "products.fields.description.label": "Description",
      "products.bundles.createHeader": "Create bundle",
      "products.bundles.createHint":
        "A bundle is one product made of several variants",
      "products.bundles.createSuccessToast": "Created",
      "products.bundles.components.label": "Components",
      "products.bundles.components.hint": "Pick at least 2 variants",
      "products.bundles.components.add": "Add component",
      "products.bundles.components.variantPlaceholder": "Search for a variant",
      "products.bundles.components.quantityPlaceholder": "How many",
      "products.bundles.prices.label": "Price",
      "products.bundles.prices.hint": "The bundle is sold at this price",
      "products.bundles.errors.component": "Pick a variant.",
      "products.bundles.errors.minComponents":
        "A bundle needs at least 2 components.",
      "products.bundles.errors.minPrices":
        "Set a price in at least one currency.",
      "products.bundles.errors.quantity":
        "Quantity must be a whole number of at least 1.",
    } as Record<string, string>)
)

vi.mock("../../../../../components/utilities/i18n/i18n", () => ({
  i18n: { t: (key: string) => labels[key] ?? key },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => labels[key] ?? key,
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => (
    <>{labels[i18nKey] ?? i18nKey}</>
  ),
}))

vi.mock("@medusajs/icons", () => ({
  CheckMini: () => <div />,
  EllipseMiniSolid: () => <div />,
  PlusMini: () => <div />,
  TrianglesMini: () => <div />,
  XMarkMini: () => <div />,
  XMark: () => <div />,
  Check: () => <div />,
  InformationCircleSolid: () => <div />,
  ExclamationCircleSolid: () => <div />,
  CheckCircleSolid: () => <div />,
  XCircleSolid: () => <div />,
}))

class MockObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}

for (const name of ["IntersectionObserver", "ResizeObserver"]) {
  Object.defineProperty(window, name, {
    writable: true,
    configurable: true,
    value: MockObserver,
  })
}

afterEach(() => {
  cleanup()
  mutateAsync.mockReset()
})

const store = {
  id: "store_1",
  supported_currencies: [{ currency_code: "usd", is_default: true }],
} as unknown as HttpTypes.AdminStore

const renderForm = () => {
  const router = createMemoryRouter(
    [
      {
        path: "/products/create-bundle",
        element: (
          <TooltipProvider delayDuration={0}>
            <RouteFocusModal>
              <BundleCreateForm store={store} regions={[]} />
            </RouteFocusModal>
          </TooltipProvider>
        ),
      },
      { path: "/products/:id", element: <div>product page</div> },
    ],
    { initialEntries: ["/products/create-bundle"] }
  )

  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

/**
 * Fills in the smallest bundle the form accepts: a title, a handle, two
 * components with quantities, and a price.
 */
const fillValidBundle = async () => {
  const user = userEvent.setup({ delay: null })

  await user.type(screen.getByRole("textbox", { name: "Title" }), "Camera kit")
  await user.type(screen.getByRole("textbox", { name: "Handle" }), "camera-kit")

  // Every row renders its own option list, so each option is looked up inside
  // the row it belongs to.
  const pickers = screen.getAllByRole("combobox")
  await user.click(pickers[0])
  await user.click(
    within(pickers[0].closest("li")!).getByRole("option", {
      name: "Camera body",
    })
  )
  await user.click(pickers[1])
  await user.click(
    within(pickers[1].closest("li")!).getByRole("option", { name: "Lens" })
  )

  const quantities = screen.getAllByPlaceholderText("How many")
  await user.type(quantities[0], "1")
  await user.type(quantities[1], "2")

  await user.type(screen.getByRole("textbox", { name: "USD" }), "899")

  return user
}

describe("BundleCreateForm", () => {
  // AC 1: an admin can create a bundle from the product fields, the variants
  // they pick with quantities, and a price.
  it("sends the product fields, the components and the price", async () => {
    mutateAsync.mockResolvedValue({
      product: { id: "prod_kit", title: "Camera kit" },
    })

    renderForm()
    const user = await fillValidBundle()

    await user.click(screen.getByRole("button", { name: "Publish" }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Camera kit",
        handle: "camera-kit",
        status: "published",
        components: [
          { variant_id: "variant_camera", quantity: 1 },
          { variant_id: "variant_lens", quantity: 2 },
        ],
        prices: [{ currency_code: "usd", amount: 899 }],
      })
    )
  })

  it("saves a bundle as a draft from the same form", async () => {
    mutateAsync.mockResolvedValue({
      product: { id: "prod_kit", title: "Camera kit" },
    })

    renderForm()
    const user = await fillValidBundle()

    await user.click(screen.getByRole("button", { name: "Save as draft" }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync.mock.calls[0][0].status).toEqual("draft")
  })

  // AC 3: the form blocks saving and says what is wrong, without a request.
  it("does not send anything when the bundle is incomplete", async () => {
    const user = userEvent.setup({ delay: null })
    renderForm()

    await user.type(
      screen.getByRole("textbox", { name: "Title" }),
      "Camera kit"
    )
    await user.type(
      screen.getByRole("textbox", { name: "Handle" }),
      "camera-kit"
    )
    await user.click(screen.getByRole("button", { name: "Publish" }))

    // One message per row that has no variant picked, plus the price message.
    await waitFor(() =>
      expect(screen.getAllByText("Pick a variant.")).toHaveLength(2)
    )
    expect(
      screen.getByText("Set a price in at least one currency.")
    ).toBeTruthy()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  // AC 4: a server error is shown, and what the admin typed is still there.
  it("shows a rejected save and keeps what was entered", async () => {
    mutateAsync.mockRejectedValue(
      new Error(
        "Variant variant_lens can't be a bundle component because it belongs to a bundle."
      )
    )

    renderForm()
    const user = await fillValidBundle()

    await user.click(screen.getByRole("button", { name: "Publish" }))

    await waitFor(() =>
      expect(
        screen.getByText(
          "Variant variant_lens can't be a bundle component because it belongs to a bundle."
        )
      ).toBeTruthy()
    )

    expect(
      (screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement).value
    ).toEqual("Camera kit")
    expect(
      (screen.getByRole("textbox", { name: "Handle" }) as HTMLInputElement)
        .value
    ).toEqual("camera-kit")
    expect(screen.getAllByPlaceholderText("How many")[1]).toHaveProperty(
      "value",
      "2"
    )
  })
})
