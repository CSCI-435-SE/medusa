import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"

import { RouteFocusModal } from "../../../components/modals"
import { useRegions } from "../../../hooks/api"
import { usePricePreferences } from "../../../hooks/api/price-preferences"
import { useProduct } from "../../../hooks/api/products"
import { useStore } from "../../../hooks/api/store"
import { ProductEditFullForm } from "./components/product-edit-full-form"
import { PRODUCT_EDIT_FULL_FIELDS } from "./utils"

/**
 * Route component for `/products/:id/edit-all`: the full-screen "Edit Product"
 * flow opened from the product detail page.
 *
 * It only loads data and renders the modal shell; the form itself is not
 * rendered until everything it needs has arrived, because the form's default
 * values are computed once on first render.
 */
export const ProductEditFull = () => {
  const { id } = useParams()
  const { t } = useTranslation()

  const { product, isPending, isError, error } = useProduct(id!, {
    fields: PRODUCT_EDIT_FULL_FIELDS,
  })

  // Store: supplies the currencies shown as price columns.
  const {
    store,
    isPending: isStorePending,
    isError: isStoreError,
    error: storeError,
  } = useStore()

  // Regions and price preferences: needed for region-specific price columns.
  const {
    regions,
    isPending: isRegionsPending,
    isError: isRegionsError,
    error: regionsError,
  } = useRegions({ limit: 9999 })

  const {
    price_preferences,
    isPending: isPricePreferencesPending,
    isError: isPricePreferencesError,
    error: pricePreferencesError,
  } = usePricePreferences({ limit: 9999 })

  // Surface load failures through the route's error boundary, like the create
  // flow does.
  if (isError) {
    throw error
  }
  if (isStoreError) {
    throw storeError
  }
  if (isRegionsError) {
    throw regionsError
  }
  if (isPricePreferencesError) {
    throw pricePreferencesError
  }

  const ready =
    !!product &&
    !isPending &&
    !!store &&
    !isStorePending &&
    !!regions &&
    !isRegionsPending &&
    !!price_preferences &&
    !isPricePreferencesPending

  return (
    <RouteFocusModal>
      <RouteFocusModal.Title asChild>
        <span className="sr-only">{t("products.edit.full.title")}</span>
      </RouteFocusModal.Title>
      <RouteFocusModal.Description asChild>
        <span className="sr-only">{t("products.edit.full.description")}</span>
      </RouteFocusModal.Description>
      {ready && (
        <ProductEditFullForm
          product={product}
          store={store}
          regions={regions}
          pricePreferences={price_preferences}
        />
      )}
    </RouteFocusModal>
  )
}
