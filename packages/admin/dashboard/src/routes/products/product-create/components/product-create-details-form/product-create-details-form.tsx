import { Divider, Heading } from "@medusajs/ui"
import { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { FormExtensionZone } from "../../../../../dashboard-app"
import { useExtension } from "../../../../../providers/extension-provider"
import { ProductCreateSchemaType } from "../../types"
import { ProductCreateGeneralSection } from "./components/product-create-details-general-section"
import { ProductCreateMediaSection } from "./components/product-create-details-media-section"
import { ProductCreateVariantsSection } from "./components/product-create-details-variant-section"

type ProductAttributesProps = {
  form: UseFormReturn<ProductCreateSchemaType>
  /** Forwarded to the options/variants builder; "edit" is used by the full Edit Product flow. */
  mode?: "create" | "edit"
}

export const ProductCreateDetailsForm = ({
  form,
  mode = "create",
}: ProductAttributesProps) => {
  const { getFormFields } = useExtension()
  const fields = getFormFields("product", "create", "general")

  return (
    <div className="flex flex-col items-center p-16">
      <div className="flex w-full max-w-[720px] flex-col gap-y-8">
        <Header />
        <div className="flex flex-col gap-y-6">
          <ProductCreateGeneralSection form={form} />
          <FormExtensionZone fields={fields} form={form} />
          <ProductCreateMediaSection form={form} />
        </div>
        <Divider />
        <ProductCreateVariantsSection form={form} mode={mode} />
      </div>
    </div>
  )
}

const Header = () => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col">
      <Heading>{t("products.create.header")}</Heading>
    </div>
  )
}
