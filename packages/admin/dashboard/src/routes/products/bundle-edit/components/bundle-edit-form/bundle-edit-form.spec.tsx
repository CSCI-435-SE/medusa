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
import { BundleEditForm } from "./bundle-edit-form"

/*
 * These cases drive a long form through userEvent in jsdom (typing, two option
 * pickers, several inputs), which takes longer than vitest's 5s default when
 * the suite runs alongside the rest of the dashboard's tests.
 */
vi.setConfig({ testTimeout: 20000 })

const mutateAsync = vi.fn()

vi.mock("../../../../../hooks/api/bundles", () => ({
  useUpdateBundle: () => ({ mutateAsync, isPending: false }),
}))

vi.mock("../../../../../hooks/use-combobox-data", () => ({
  useComboboxData: () => ({
    options: [
      { label: "Camera body", value: "variant_camera" },
      { label: "Lens", value: "variant_lens" },
      { label: "Bag", value: "variant_bag" },
    ],
    searchValue: "",
    onSearchValueChange: vi.fn(),
    fetchNextPage: vi.fn(),
    disabled: false,
    isPending: false,
  }),
}))

// Stubbed for the same reason as in bundle-create-form.spec.tsx: they are the
// product form's own sections and pull in machinery this suite does not check.
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
      "actions.save": "Save",
      "actions.remove": "Remove",
      "products.fields.title.label": "Title",
      "products.fields.subtitle.label": "Subtitle",
      "products.fields.description.label": "Description",
      "products.bundles.editHeader": "Edit bundle",
      "products.bundles.editHint": "Change the bundle's details",
      "products.bundles.editSuccessToast": "Updated",
      "products.bundles.components.label": "Components",
      "products.bundles.components.hint": "Pick at least 2 variants",
      "products.bundles.components.add": "Add component",
      "products.bundles.components.variantPlaceholder": "Search for a variant",
      "products.bundles.components.quantityPlaceholder": "How many",
      "products.bundles.prices.label": "Price",
      "products.bundles.prices.hint": "The bundle is sold at this price",
      "products.bundles.errors.minComponents":
        "A bundle needs at least 2 components.",
      "products.bundles.errors.component": "Pick a variant.",
      "products.bundles.errors.quantity":
        "Quantity must be a whole number of at least 1.",
      "products.bundles.errors.minPrices":
        "Set a price in at least one currency.",
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

const bundle = {
  id: "prod_kit",
  title: "Camera kit",
  subtitle: null,
  handle: "camera-kit",
  description: "Everything you need",
  status: "published",
  discountable: true,
  type_id: null,
  collection_id: null,
  categories: [],
  tags: [],
  sales_channels: [],
  images: [],
  options: [],
  metadata: {
    bundle: {
      components: [
        { variant_id: "variant_camera", quantity: 1 },
        { variant_id: "variant_lens", quantity: 1 },
      ],
    },
  },
  variants: [
    {
      id: "variant_kit",
      title: "Camera kit",
      variant_rank: 0,
      manage_inventory: true,
      prices: [{ id: "price_1", currency_code: "usd", amount: 899 }],
    },
  ],
} as unknown as HttpTypes.AdminProduct

/**
 * Picks a variant in one component row. Every row renders its own option list,
 * so the option is looked up inside that row rather than on the whole page.
 */
const pickVariant = async (
  user: ReturnType<typeof userEvent.setup>,
  index: number,
  name: string
) => {
  const picker = screen.getAllByRole("combobox")[index]
  const row = picker.closest("li")!

  await user.click(picker)
  await user.click(within(row).getByRole("option", { name }))
}

const renderForm = () => {
  const router = createMemoryRouter(
    [
      {
        path: "/products/:id/edit-bundle",
        element: (
          <TooltipProvider delayDuration={0}>
            <RouteFocusModal>
              <BundleEditForm product={bundle} store={store} regions={[]} />
            </RouteFocusModal>
          </TooltipProvider>
        ),
      },
      { path: "/products/:id", element: <div>product page</div> },
    ],
    { initialEntries: ["/products/prod_kit/edit-bundle"] }
  )

  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe("BundleEditForm (AC 2)", () => {
  it("starts from the bundle's own fields, components and price", () => {
    renderForm()

    expect(
      (screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement).value
    ).toEqual("Camera kit")
    expect(
      (screen.getByRole("textbox", { name: "Handle" }) as HTMLInputElement)
        .value
    ).toEqual("camera-kit")

    const quantities = screen.getAllByPlaceholderText(
      "How many"
    ) as HTMLInputElement[]
    expect(quantities).toHaveLength(2)
    expect(quantities[0].value).toEqual("1")
    expect(quantities[1].value).toEqual("1")

    expect(
      (screen.getByRole("textbox", { name: "USD" }) as HTMLInputElement).value
    ).toEqual("899")
  })

  it("saves a changed title, quantity and price", async () => {
    mutateAsync.mockResolvedValue({ product: bundle })
    const user = userEvent.setup({ delay: null })
    renderForm()

    const title = screen.getByRole("textbox", { name: "Title" })
    await user.clear(title)
    await user.type(title, "Camera kit v2")

    const quantities = screen.getAllByPlaceholderText("How many")
    await user.clear(quantities[1])
    await user.type(quantities[1], "3")

    const price = screen.getByRole("textbox", { name: "USD" })
    await user.clear(price)
    await user.type(price, "799")

    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Camera kit v2",
        status: "published",
        components: [
          { variant_id: "variant_camera", quantity: 1 },
          { variant_id: "variant_lens", quantity: 3 },
        ],
        prices: [{ currency_code: "usd", amount: 799 }],
      })
    )
  })

  it("saves a component added to the bundle", async () => {
    mutateAsync.mockResolvedValue({ product: bundle })
    const user = userEvent.setup({ delay: null })
    renderForm()

    await user.click(screen.getByRole("button", { name: "Add component" }))

    await pickVariant(user, 2, "Bag")

    const quantities = screen.getAllByPlaceholderText("How many")
    await user.type(quantities[2], "2")

    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync.mock.calls[0][0].components).toEqual([
      { variant_id: "variant_camera", quantity: 1 },
      { variant_id: "variant_lens", quantity: 1 },
      { variant_id: "variant_bag", quantity: 2 },
    ])
  })

  it("will not save a bundle cut down to one component", async () => {
    const user = userEvent.setup({ delay: null })
    renderForm()

    await user.click(screen.getAllByRole("button", { name: "Remove" })[1])
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() =>
      expect(
        screen.getByText("A bundle needs at least 2 components.")
      ).toBeTruthy()
    )
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  // AC 4, on the edit form as well as on create.
  it("shows a rejected save and keeps the edited values", async () => {
    mutateAsync.mockRejectedValue(
      new Error("Bundle components must be unique.")
    )
    const user = userEvent.setup({ delay: null })
    renderForm()

    const title = screen.getByRole("textbox", { name: "Title" })
    await user.clear(title)
    await user.type(title, "Camera kit v2")

    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() =>
      expect(screen.getByText("Bundle components must be unique.")).toBeTruthy()
    )

    expect((title as HTMLInputElement).value).toEqual("Camera kit v2")
  })
})
