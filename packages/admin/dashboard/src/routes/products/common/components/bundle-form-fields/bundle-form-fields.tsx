import { HttpTypes } from "@medusajs/types"
import { Alert, Divider, Heading, Text } from "@medusajs/ui"
import { UseFormReturn } from "react-hook-form"

import { StackedFocusModal } from "../../../../../components/modals"
import { ProductCreateSchemaType } from "../../../product-create/types"
import { ProductCreateMediaSection } from "../../../product-create/components/product-create-details-form/components/product-create-details-media-section"
import { ProductCreateGeneralSection } from "../../../product-create/components/product-create-details-form/components/product-create-details-general-section"
import { ProductCreateOrganizationSection } from "../../../product-create/components/product-create-organize-form/components/product-create-organize-section"
import { ProductCreateSalesChannelStackedModal } from "../../../product-create/components/product-create-organize-form/components/product-create-sales-channel-stacked-modal"
import { SC_STACKED_MODAL_ID } from "../../../product-create/components/product-create-organize-form/constants"
import { BundleSchemaType } from "../../../bundle-create/constants"
import { BundleComponentsForm } from "../bundle-components-form"
import { BundlePricesForm } from "../bundle-prices-form"

/*
 * The bundle's product fields are the product form's own fields, under the same
 * names, so its sections render them with no changes: the general section
 * (title, subtitle, handle, description), the media section (images and the
 * thumbnail) and the organization section (categories, collection, type, tags,
 * sales channels, shipping profile). What a bundle adds on top is the component
 * list and its own price.
 *
 * Those sections are typed against `ProductCreateSchemaType`. `BundleSchema`
 * declares the same fields for everything they touch and leaves out only
 * `options`, `variants` and `enable_variants`, which none of them read, so the
 * form is passed through with a cast rather than duplicating the fields.
 */
const asProductForm = (form: UseFormReturn<BundleSchemaType>) =>
  form as unknown as UseFormReturn<ProductCreateSchemaType>

type BundleFormFieldsProps = {
  form: UseFormReturn<BundleSchemaType>
  currencies: HttpTypes.AdminStore["supported_currencies"]
  /** Heading shown above the form. */
  header: string
  /** One line under the heading. */
  hint: string
  /**
   * The message from a rejected save. It is shown here, above the fields the
   * admin filled in, which are left exactly as they were typed (AC 4).
   */
  serverError?: string | null
}

export const BundleFormFields = ({
  form,
  currencies,
  header,
  hint,
  serverError,
}: BundleFormFieldsProps) => {
  const productForm = asProductForm(form)

  return (
    <StackedFocusModal id={SC_STACKED_MODAL_ID}>
      <div className="flex flex-col items-center p-16">
        <div className="flex w-full max-w-[720px] flex-col gap-y-8">
          <div className="flex flex-col gap-y-1">
            <Heading>{header}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {hint}
            </Text>
          </div>

          {serverError && (
            <Alert variant="error" dismissible={false}>
              {serverError}
            </Alert>
          )}

          <div className="flex flex-col gap-y-6">
            <ProductCreateGeneralSection form={productForm} />
            <ProductCreateMediaSection form={productForm} />
          </div>

          <Divider />
          <BundleComponentsForm form={form} />

          <Divider />
          <BundlePricesForm form={form} currencies={currencies} />

          <Divider />
          <ProductCreateOrganizationSection form={productForm} />
        </div>
      </div>
      <ProductCreateSalesChannelStackedModal form={productForm} />
    </StackedFocusModal>
  )
}
