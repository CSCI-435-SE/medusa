// @vitest-environment jsdom
import { TooltipProvider } from "@medusajs/ui"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useForm } from "react-hook-form"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Form } from "../../../../../../../components/common/form"
import { PRODUCT_CREATE_FORM_DEFAULTS } from "../../../../constants"
import { ProductCreateSchemaType } from "../../../../types"
import { ProductCreateGeneralSection } from "./product-create-general-section"

// The handle field's label renders an info-tooltip icon from @medusajs/icons.
// That icon breaks when rendered through Radix's Tooltip trigger in jsdom -
// unrelated to the character count this suite is testing - so it's stubbed
// out here the same way combobox.spec.tsx already does for icons.
vi.mock("@medusajs/icons", () => ({
  InformationCircleSolid: () => <div data-testid="information-circle-solid" />,
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => {
      if (key === "general.characters") {
        const count = options?.count ?? 0
        return count === 1 ? "1 character" : `${count} characters`
      }

      const labels: Record<string, string> = {
        "products.fields.title.label": "Title",
        "products.fields.title.placeholder": "Winter jacket",
        "products.fields.subtitle.label": "Subtitle",
        "products.fields.subtitle.placeholder": "Warm and cosy",
        "fields.handle": "Handle",
        "products.fields.handle.tooltip": "Used to reference the product.",
        "products.fields.handle.placeholder": "winter-jacket",
        "products.fields.description.label": "Description",
        "products.fields.description.placeholder": "A warm and cozy jacket",
      }
      return labels[key] ?? key
    },
  }),
}))

afterEach(() => {
  cleanup()
})

// Renders the section the same way its real parent (ProductCreateDetailsForm,
// via RouteModalForm) does: a react-hook-form instance passed down as a prop,
// with the local `Form` (react-hook-form's FormProvider under the hood)
// wrapping it so Form.Label/Form.Control/Form.Hint can read field state.
const renderSection = () => {
  const Wrapper = () => {
    const form = useForm<ProductCreateSchemaType>({
      defaultValues: PRODUCT_CREATE_FORM_DEFAULTS,
    })

    return (
      <TooltipProvider delayDuration={0}>
        <Form {...form}>
          <ProductCreateGeneralSection form={form} />
        </Form>
      </TooltipProvider>
    )
  }

  render(<Wrapper />)
}

describe("ProductCreateGeneralSection", () => {
  it("shows a character count of 0 for an empty description", () => {
    renderSection()

    expect(screen.getByText("0 characters")).toBeTruthy()
  })

  it("updates the character count live as the user types", async () => {
    const user = userEvent.setup()
    renderSection()

    const textarea = screen.getByPlaceholderText("A warm and cozy jacket")
    await user.type(textarea, "Hello world")

    expect(screen.getByText("11 characters")).toBeTruthy()
    expect(screen.queryByText("0 characters")).toBeNull()
  })

  it("uses the singular form when there is exactly 1 character", async () => {
    const user = userEvent.setup()
    renderSection()

    const textarea = screen.getByPlaceholderText("A warm and cozy jacket")
    await user.type(textarea, "H")

    expect(screen.getByText("1 character")).toBeTruthy()
    expect(screen.queryByText("1 characters")).toBeNull()
  })

  it("counts back down as text is removed", async () => {
    const user = userEvent.setup()
    renderSection()

    const textarea = screen.getByPlaceholderText("A warm and cozy jacket")
    await user.type(textarea, "Hello")
    expect(screen.getByText("5 characters")).toBeTruthy()

    await user.clear(textarea)
    expect(screen.getByText("0 characters")).toBeTruthy()
  })
})
