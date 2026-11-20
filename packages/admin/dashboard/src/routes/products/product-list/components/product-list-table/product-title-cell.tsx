import { HttpTypes } from "@medusajs/types"
import { Badge } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { ProductCell } from "../../../../../components/table/table-cells/product/product-cell"
import { isBundle } from "../../../common/bundles"

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
