import { Button, Heading, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { RouteDrawer, useRouteModal } from "../../../components/modals"
import { useExportCustomers } from "../../../hooks/api/customers"
import { useCustomerTableQuery } from "../../../hooks/table/query"

export const CustomerExport = () => {
  const { t } = useTranslation()

  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <RouteDrawer.Title asChild>
          <Heading>{t("customers.export.header")}</Heading>
        </RouteDrawer.Title>
        <RouteDrawer.Description className="sr-only">
          {t("customers.export.description")}
        </RouteDrawer.Description>
      </RouteDrawer.Header>
      <CustomerExportContent />
    </RouteDrawer>
  )
}

const CustomerExportContent = () => {
  const { t } = useTranslation()
  // The list's Export link forwards its query string, so this reads the same
  // filters and search that are applied to the customer list.
  const { searchParams } = useCustomerTableQuery({})

  const { mutateAsync } = useExportCustomers(searchParams)
  const { handleSuccess } = useRouteModal()

  const handleExportRequest = async () => {
    await mutateAsync(searchParams, {
      onSuccess: () => {
        // The export runs in a background workflow, so the response only
        // contains its transaction ID. The CSV's download URL arrives later as
        // a notification.
        toast.info(t("customers.export.success.title"), {
          description: t("customers.export.success.description"),
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
        <p className="text-ui-fg-subtle text-sm">
          {t("customers.export.description")}
        </p>
      </RouteDrawer.Body>
      <RouteDrawer.Footer>
        <div className="flex items-center gap-x-2">
          <RouteDrawer.Close asChild>
            <Button size="small" variant="secondary">
              {t("actions.cancel")}
            </Button>
          </RouteDrawer.Close>
          <Button onClick={handleExportRequest} size="small">
            {t("actions.export")}
          </Button>
        </div>
      </RouteDrawer.Footer>
    </>
  )
}