// @vitest-environment jsdom
import { TooltipProvider } from "@medusajs/ui"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useForm } from "react-hook-form"
import { afterEach, describe, expect, it, vi } from "vitest"

// The SDK client reads these bare globals at module load time (see
// edit-product-form.spec.tsx); Vite injects them in the real app.
vi.hoisted(() => {
  const g = global as any
  g.__BACKEND_URL__ = "http://localhost:9000"
  g.__AUTH_TYPE__ = "session"
  g.__JWT_TOKEN_STORAGE_KEY__ = ""
})

import { Form } from "../../../../../components/common/form"
import { zodFormResolver } from "../../../../../lib/zod-form-resolver"
import {
  BUNDLE_CREATE_FORM_DEFAULTS,
  BundleSchema,
  BundleSchemaType,
} from "../../../bundle-create/constants"
import { BundlePricesForm } from "../bundle-prices-form"
import { BundleComponentsForm } from "./bundle-components-form"

// The variant picker's options come from the API in the real app. Here the
// hook is stubbed so the list is fixed and no request is made; what this suite
// checks is which messages the form shows, not how options are loaded.
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

vi.mock("@medusajs/icons", () => ({
  CheckMini: () => <div />,
  EllipseMiniSolid: () => <div />,
  PlusMini: () => <div />,
  TrianglesMini: () => <div />,
  XMarkMini: () => <div data-testid="remove-icon" />,
  InformationCircleSolid: () => <div />,
  ExclamationCircleSolid: () => <div />,
}))

/*
 * The schema's messages are built with `i18n.t(...)` when the module loads,
 * the same way `ProductCreateSchema` builds its own. The dashboard's i18next
 * instance is only initialised by the running app, so in a test it hands back
 * the key. Both translators are stubbed from one map so the assertions below
 * read as the admin would see them, and so a renamed key fails the test.
 */
const labels = vi.hoisted(
  () =>
    ({
      "fields.variant": "Variant",
      "fields.quantity": "Quantity",
      "actions.remove": "Remove",
      "products.bundles.components.label": "Components",
      "products.bundles.components.hint": "Pick at least 2 variants",
      "products.bundles.components.add": "Add component",
      "products.bundles.components.variantPlaceholder": "Search for a variant",
      "products.bundles.components.quantityPlaceholder": "How many",
      "products.bundles.prices.label": "Price",
      "products.bundles.prices.hint": "The bundle is sold at this price",
      "products.bundles.errors.component": "Pick a variant.",
      "products.bundles.errors.duplicateComponent":
        "This variant is already a component. Raise its quantity instead.",
      "products.bundles.errors.quantity":
        "Quantity must be a whole number of at least 1.",
      "products.bundles.errors.minComponents":
        "A bundle needs at least 2 components.",
      "products.bundles.errors.price": "Price must be 0 or more.",
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
}))

class MockIntersectionObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}

Object.defineProperty(window, "IntersectionObserver", {
  writable: true,
  configurable: true,
  value: MockIntersectionObserver,
})

afterEach(() => {
  cleanup()
})

/*
 * These cases drive a long form through userEvent in jsdom (typing, two option
 * pickers, several inputs), which takes longer than vitest's 5s default when
 * the suite runs alongside the rest of the dashboard's tests.
 */
vi.setConfig({ testTimeout: 20000 })

const onValid = vi.fn()

/**
 * The components and price sections of the bundle form, wired to the same
 * schema and resolver the real form uses, so a submit runs the real
 * validation and the messages come from the real schema.
 */
const Harness = ({ values }: { values?: Partial<BundleSchemaType> }) => {
  const form = useForm<BundleSchemaType>({
    defaultValues: {
      ...BUNDLE_CREATE_FORM_DEFAULTS,
      title: "Camera kit",
      handle: "camera-kit",
      ...values,
    } as BundleSchemaType,
    resolver: zodFormResolver(BundleSchema),
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => onValid(data))}>
        <BundleComponentsForm form={form} />
        <BundlePricesForm
          form={form}
          currencies={[{ currency_code: "usd" } as any]}
        />
        <button type="submit">Save</button>
      </form>
    </Form>
  )
}

const renderHarness = (values?: Partial<BundleSchemaType>) => {
  onValid.mockReset()

  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider delayDuration={0}>
        <Harness values={values} />
      </TooltipProvider>
    </QueryClientProvider>
  )
}

const save = async () => {
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { name: "Save" }))
}

const twoComponents = [
  { variant_id: "variant_camera", quantity: 1 },
  { variant_id: "variant_lens", quantity: 2 },
]

describe("bundle form validation (AC 3)", () => {
  it("lets a bundle with two components and a price through", async () => {
    renderHarness({ components: twoComponents, prices: { usd: 899 } })

    await save()

    await waitFor(() => expect(onValid).toHaveBeenCalledTimes(1))
    expect(onValid.mock.calls[0][0].components).toEqual(twoComponents)
  })

  it("shows the minimum-components message and blocks saving", async () => {
    renderHarness({
      components: [twoComponents[0]],
      prices: { usd: 899 },
    })

    await save()

    await waitFor(() =>
      expect(
        screen.getByText("A bundle needs at least 2 components.")
      ).toBeTruthy()
    )
    expect(onValid).not.toHaveBeenCalled()
  })

  it("shows a message on the row whose variant is not picked", async () => {
    renderHarness({
      components: [{ variant_id: "", quantity: 1 }, twoComponents[1]],
      prices: { usd: 899 },
    })

    await save()

    await waitFor(() =>
      expect(screen.getByText("Pick a variant.")).toBeTruthy()
    )
    expect(onValid).not.toHaveBeenCalled()
  })

  it("shows a message on the row whose quantity is 0 and blocks saving", async () => {
    renderHarness({
      components: [
        { variant_id: "variant_camera", quantity: 0 },
        twoComponents[1],
      ],
      prices: { usd: 899 },
    })

    await save()

    await waitFor(() =>
      expect(
        screen.getByText("Quantity must be a whole number of at least 1.")
      ).toBeTruthy()
    )
    expect(onValid).not.toHaveBeenCalled()
  })

  it("shows a message when a quantity is left empty", async () => {
    renderHarness({
      components: [
        { variant_id: "variant_camera", quantity: "" },
        twoComponents[1],
      ],
      prices: { usd: 899 },
    })

    await save()

    await waitFor(() =>
      expect(
        screen.getByText("Quantity must be a whole number of at least 1.")
      ).toBeTruthy()
    )
    expect(onValid).not.toHaveBeenCalled()
  })

  it("shows the missing-price message and blocks saving", async () => {
    renderHarness({ components: twoComponents, prices: {} })

    await save()

    await waitFor(() =>
      expect(
        screen.getByText("Set a price in at least one currency.")
      ).toBeTruthy()
    )
    expect(onValid).not.toHaveBeenCalled()
  })

  it("shows a message when the same variant is a component twice", async () => {
    renderHarness({
      components: [
        { variant_id: "variant_lens", quantity: 1 },
        { variant_id: "variant_lens", quantity: 1 },
      ],
      prices: { usd: 899 },
    })

    await save()

    await waitFor(() =>
      expect(
        screen.getByText(
          "This variant is already a component. Raise its quantity instead."
        )
      ).toBeTruthy()
    )
    expect(onValid).not.toHaveBeenCalled()
  })

  it("clears the message once the quantity is corrected", async () => {
    const user = userEvent.setup()
    renderHarness({
      components: [
        { variant_id: "variant_camera", quantity: 0 },
        twoComponents[1],
      ],
      prices: { usd: 899 },
    })

    await save()

    await waitFor(() =>
      expect(
        screen.getByText("Quantity must be a whole number of at least 1.")
      ).toBeTruthy()
    )

    const quantities = screen.getAllByPlaceholderText("How many")
    await user.clear(quantities[0])
    await user.type(quantities[0], "2")
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(onValid).toHaveBeenCalledTimes(1))
    expect(
      screen.queryByText("Quantity must be a whole number of at least 1.")
    ).toBeNull()
  })

  it("adds and removes component rows", async () => {
    const user = userEvent.setup()
    renderHarness({ components: twoComponents, prices: { usd: 899 } })

    expect(screen.getAllByPlaceholderText("How many")).toHaveLength(2)

    await user.click(screen.getByRole("button", { name: "Add component" }))
    expect(screen.getAllByPlaceholderText("How many")).toHaveLength(3)

    await user.click(screen.getAllByRole("button", { name: "Remove" })[2])
    expect(screen.getAllByPlaceholderText("How many")).toHaveLength(2)
  })
})
