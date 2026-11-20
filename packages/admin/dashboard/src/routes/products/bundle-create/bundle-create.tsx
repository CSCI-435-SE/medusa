import { useTranslation } from "react-i18next"

import { RouteFocusModal } from "../../../components/modals"
import { useRegions } from "../../../hooks/api"
import { useSalesChannel } from "../../../hooks/api/sales-channels"
import { useStore } from "../../../hooks/api/store"
import { BundleCreateForm } from "./components/bundle-create-form"

/**
 * The "Create bundle" screen, opened from the Products list.
 *
 * It loads the same context the product create screen does: the store for its
 * currencies, its default sales channel, and the regions, which a price can be
 * scoped to.
 */
export const BundleCreate = () => {
  const { t } = useTranslation()

  const {
    store,
    isPending: isStorePending,
    isError: isStoreError,
    error: storeError,
  } = useStore({ fields: "+default_sales_channel" })

  const {
    sales_channel,
    isPending: isSalesChannelPending,
    isError: isSalesChannelError,
    error: salesChannelError,
  } = useSalesChannel(store?.default_sales_channel_id!, {
    enabled: !!store?.default_sales_channel_id,
  })

  const {
    regions,
    isPending: isRegionsPending,
    isError: isRegionsError,
    error: regionsError,
  } = useRegions({ limit: 9999 })

  if (isStoreError) {
    throw storeError
  }

  if (isRegionsError) {
    throw regionsError
  }

  if (isSalesChannelError) {
    throw salesChannelError
  }

  const ready =
    !!store &&
    !isStorePending &&
    !!regions &&
    !isRegionsPending &&
    !isSalesChannelPending

  return (
    <RouteFocusModal>
      <RouteFocusModal.Title asChild>
        <span className="sr-only">{t("products.bundles.createHeader")}</span>
      </RouteFocusModal.Title>
      <RouteFocusModal.Description asChild>
        <span className="sr-only">{t("products.bundles.createHint")}</span>
      </RouteFocusModal.Description>
      {ready && (
        <BundleCreateForm
          store={store}
          regions={regions}
          defaultChannel={sales_channel}
        />
      )}
    </RouteFocusModal>
  )
}
