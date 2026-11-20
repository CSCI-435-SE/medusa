import { Button, Heading, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { RouteDrawer, useRouteModal } from "../../../components/modals"
import { useExportPromotions } from "../../../hooks/api/promotions"
import { usePromotionTableQuery } from "../../../hooks/table/query/use-promotion-table-query"

export const PromotionExport = () => {
  const { t } = useTranslation()

  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <RouteDrawer.Title asChild>
          <Heading>{t("promotions.export.header")}</Heading>
        </RouteDrawer.Title>
        <RouteDrawer.Description className="sr-only">
          {t("promotions.export.description")}
        </RouteDrawer.Description>
      </RouteDrawer.Header>
      <PromotionExportContent />
    </RouteDrawer>
  )
}

const PromotionExportContent = () => {
  const { t } = useTranslation()
  // The list's Export link forwards its query string, so this reads the same
  // filters and search that are applied to the promotion list.
  const { searchParams } = usePromotionTableQuery({})

  const { mutateAsync, isPending } = useExportPromotions(searchParams)
  const { handleSuccess } = useRouteModal()

  const handleExportRequest = async () => {
    await mutateAsync(searchParams, {
      onSuccess: () => {
        // The export runs in a background workflow, so the response only
        // contains its transaction ID. The CSV's download URL arrives later as
        // a notification.
        toast.info(t("promotions.export.success.title"), {
          description: t("promotions.export.success.description"),
        })
        handleSuccess()
      },
      onError: (err) => {
        toast.error(err.message)
      },
    })
  }

  return (
    <>
      <RouteDrawer.Body>
        <Text size="small" className="text-ui-fg-subtle">
          {t("promotions.export.description")}
        </Text>
      </RouteDrawer.Body>
      <RouteDrawer.Footer>
        <div className="flex items-center gap-x-2">
          <RouteDrawer.Close asChild>
            <Button size="small" variant="secondary">
              {t("actions.cancel")}
            </Button>
          </RouteDrawer.Close>
          {/* The drawer only closes once the request comes back, so without
          this a second click starts a second export. */}
          <Button
            onClick={handleExportRequest}
            size="small"
            isLoading={isPending}
          >
            {t("actions.export")}
          </Button>
        </div>
      </RouteDrawer.Footer>
    </>
  )
}
