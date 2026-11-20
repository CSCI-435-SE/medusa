import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"

import { RouteFocusModal } from "../../../components/modals"
import { useRegions } from "../../../hooks/api"
import { useProduct } from "../../../hooks/api/products"
import { useStore } from "../../../hooks/api/store"
import { BUNDLE_EDIT_FIELDS } from "../common/bundles"
import { BundleEditForm } from "./components/bundle-edit-form"

/**
 * The "Edit bundle" screen, opened from a bundle's product page.
 */
export const BundleEdit = () => {
  const { t } = useTranslation()
  const { id } = useParams()

  const {
    product,
    isPending: isProductPending,
    isError: isProductError,
    error: productError,
  } = useProduct(id!, { fields: BUNDLE_EDIT_FIELDS })

  const {
    store,
    isPending: isStorePending,
    isError: isStoreError,
    error: storeError,
  } = useStore()

  const {
    regions,
    isPending: isRegionsPending,
    isError: isRegionsError,
    error: regionsError,
  } = useRegions({ limit: 9999 })

  if (isProductError) {
    throw productError
  }

  if (isStoreError) {
    throw storeError
  }

  if (isRegionsError) {
    throw regionsError
  }

  const ready =
    !!product &&
    !isProductPending &&
    !!store &&
    !isStorePending &&
    !!regions &&
    !isRegionsPending

  return (
    <RouteFocusModal>
      <RouteFocusModal.Title asChild>
        <span className="sr-only">{t("products.bundles.editHeader")}</span>
      </RouteFocusModal.Title>
      <RouteFocusModal.Description asChild>
        <span className="sr-only">{t("products.bundles.editHint")}</span>
      </RouteFocusModal.Description>
      {ready && (
        <BundleEditForm product={product} store={store} regions={regions} />
      )}
    </RouteFocusModal>
  )
}
