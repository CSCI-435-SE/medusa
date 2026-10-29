import { Heading } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"

import { RouteDrawer } from "../../../components/modals"
import { usePromotion } from "../../../hooks/api/promotions"
import { DuplicatePromotionForm } from "./components/duplicate-promotion-form"

export const PromotionDuplicate = () => {
  const { id } = useParams()
  const { t } = useTranslation()

  const { promotion, isLoading, isError, error } = usePromotion(id!)

  if (isError) {
    throw error
  }

  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <RouteDrawer.Title asChild>
          <Heading>{t("promotions.duplicate.header")}</Heading>
        </RouteDrawer.Title>
        <RouteDrawer.Description>
          {t("promotions.duplicate.description")}
        </RouteDrawer.Description>
      </RouteDrawer.Header>
      {!isLoading && promotion && (
        <DuplicatePromotionForm promotion={promotion} />
      )}
    </RouteDrawer>
  )
}
