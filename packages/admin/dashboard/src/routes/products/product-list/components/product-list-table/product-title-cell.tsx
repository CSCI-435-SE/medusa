import { HttpTypes } from "@medusajs/types"
import { Badge } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { ProductCell } from "../../../../../components/table/table-cells/product/product-cell"

// Bundles (#112) are products whose metadata.bundle holds the component list.
// typeof null is "object", so null is ruled out explicitly.
const isBundle = (product: Pick<HttpTypes.AdminProduct, "metadata">) =>
  typeof product.metadata?.bundle === "object" &&
  product.metadata.bundle !== null

export const ProductTitleCell = ({
  product,
}: {
  product: Pick<HttpTypes.AdminProduct, "thumbnail" | "title" | "metadata">
}) => {
  const { t } = useTranslation()

  return (
    <ProductCell
      product={product}
      badge={
        isBundle(product) ? (
          <Badge size="2xsmall">{t("products.list.bundleBadge")}</Badge>
        ) : null
      }
    />
  )
}
