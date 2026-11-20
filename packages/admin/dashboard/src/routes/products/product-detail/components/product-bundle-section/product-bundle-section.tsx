import { PencilSquare } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import { Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { ActionMenu } from "../../../../../components/common/action-menu"
import { useVariants } from "../../../../../hooks/api/product-variants"
import { getBundleComponents, isBundle } from "../../../common/bundles"

type ProductBundleSectionProps = {
  product: HttpTypes.AdminProduct
}

/**
 * Lists a bundle's components and their quantities on its product page
 * (issue #114, AC 5). It renders nothing for a product that is not a bundle.
 *
 * The components are stored as variant IDs, so the variants are read to get a
 * name and the product to link to. A component whose variant can't be read is
 * still listed by its ID: a bundle that looks like it has fewer parts than it
 * does would be worse than an unnamed row.
 */
export const ProductBundleSection = ({
  product,
}: ProductBundleSectionProps) => {
  const { t } = useTranslation()

  const components = getBundleComponents(product.metadata)

  const { variants = [] } = useVariants(
    {
      id: (components ?? []).map((component) => component.variant_id),
      fields: "id,title,product_id,product.title",
      limit: components?.length || 1,
    },
    { enabled: !!components?.length }
  )

  if (!isBundle(product) || !components) {
    return null
  }

  const variantsById = new Map(variants.map((variant) => [variant.id, variant]))

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h2">{t("products.bundles.section.header")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("products.bundles.section.hint")}
          </Text>
        </div>
        <ActionMenu
          groups={[
            {
              actions: [
                {
                  label: t("products.bundles.editAction"),
                  to: "edit-bundle",
                  icon: <PencilSquare />,
                },
              ],
            },
          ]}
        />
      </div>

      {components.map((component) => {
        const variant = variantsById.get(component.variant_id) as
          | (HttpTypes.AdminProductVariant & {
              product?: { id?: string; title?: string | null } | null
            })
          | undefined

        const name = variant
          ? [variant.product?.title, variant.title].filter(Boolean).join(" · ")
          : t("products.bundles.section.unknownVariant", {
              id: component.variant_id,
            })

        const productId = variant?.product_id ?? variant?.product?.id

        return (
          <div
            key={component.variant_id}
            className="text-ui-fg-subtle flex items-center justify-between px-6 py-4"
          >
            {productId ? (
              <Link
                to={`/products/${productId}`}
                className="text-ui-fg-interactive txt-small"
              >
                {name}
              </Link>
            ) : (
              <Text size="small">{name}</Text>
            )}
            <Text size="small" className="tabular-nums">
              {t("products.bundles.section.quantity", {
                count: component.quantity,
              })}
            </Text>
          </div>
        )
      })}
    </Container>
  )
}
