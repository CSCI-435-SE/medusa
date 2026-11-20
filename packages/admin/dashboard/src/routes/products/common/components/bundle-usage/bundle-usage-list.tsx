import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

type BundleUsageListProps = {
  bundles: { id: string; title?: string | null }[]
}

/**
 * The bundles that blocked a delete, each linking to its product page.
 */
export const BundleUsageList = ({ bundles }: BundleUsageListProps) => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-y-1">
      <span>{t("products.bundles.usage.description")}</span>
      <ul className="flex flex-col gap-y-0.5">
        {bundles.map((bundle) => (
          <li key={bundle.id}>
            <Link
              to={`/products/${bundle.id}`}
              className="text-ui-fg-interactive"
            >
              {bundle.title || bundle.id}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
