import { Heading } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"

import { RouteDrawer } from "../../../components/modals"
import { useProduct } from "../../../hooks/api/products"
import { DuplicateProductForm } from "./components/duplicate-product-form"

export const ProductDuplicate = () => {
  const { id } = useParams()
  const { t } = useTranslation()

  // Only the fields needed to pre-fill and validate the dialog are loaded.
  const { product, isLoading, isError, error } = useProduct(id!, {
    fields: "id,title,handle",
  })

  if (isError) {
    throw error
  }

  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <RouteDrawer.Title asChild>
          <Heading>{t("products.duplicate.header")}</Heading>
        </RouteDrawer.Title>
        <RouteDrawer.Description>
          {t("products.duplicate.description")}
        </RouteDrawer.Description>
      </RouteDrawer.Header>
      {!isLoading && product && <DuplicateProductForm product={product} />}
    </RouteDrawer>
  )
}
