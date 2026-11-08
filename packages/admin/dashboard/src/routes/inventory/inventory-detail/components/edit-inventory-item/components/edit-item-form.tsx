import * as zod from "zod"

import { Button, Input, toast } from "@medusajs/ui"
import { RouteDrawer, useRouteModal } from "../../../../../../components/modals"

import { zodResolver } from "@hookform/resolvers/zod"
import { AdminInventoryItem } from "@medusajs/types"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Form } from "../../../../../../components/common/form"
import { KeyboundForm } from "../../../../../../components/utilities/keybound-form"
import { useUpdateInventoryItem } from "../../../../../../hooks/api/inventory"
import { EditInventoryItemSchema } from "../schema"

type EditInventoryItemFormProps = {
  item: AdminInventoryItem
}

const getDefaultValues = (item: AdminInventoryItem) => {
  return {
    title: item.title ?? undefined,
    sku: item.sku ?? undefined,
    low_stock_threshold: item.low_stock_threshold,
  }
}

export const EditInventoryItemForm = ({ item }: EditInventoryItemFormProps) => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()

  const form = useForm<zod.infer<typeof EditInventoryItemSchema>>({
    defaultValues: getDefaultValues(item),
    resolver: zodResolver(EditInventoryItemSchema),
  })

  const { mutateAsync, isPending: isLoading } = useUpdateInventoryItem(item.id)

  const handleSubmit = form.handleSubmit(async (values) => {
    mutateAsync(values as any, {
      onSuccess: () => {
        toast.success(t("inventory.toast.updateItem"))
        handleSuccess()
      },
      onError: (e) => toast.error(e.message),
    })
  })

  return (
    <RouteDrawer.Form form={form}>
      <KeyboundForm
        onSubmit={handleSubmit}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <RouteDrawer.Body className="flex flex-1 flex-col gap-y-8 overflow-auto">
          <Form.Field
            control={form.control}
            name="title"
            render={({ field }) => {
              return (
                <Form.Item>
                  <Form.Label>{t("fields.title")}</Form.Label>
                  <Form.Control>
                    <Input {...field} />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )
            }}
          />
          <Form.Field
            control={form.control}
            name="sku"
            render={({ field }) => {
              return (
                <Form.Item>
                  <Form.Label>{t("fields.sku")}</Form.Label>
                  <Form.Control>
                    <Input {...field} />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )
            }}
          />
          <Form.Field
            control={form.control}
            name="low_stock_threshold"
            render={({ field }) => {
              return (
                <Form.Item>
                  <Form.Label>{t("inventory.lowStockThreshold")}</Form.Label>
                  <Form.Hint>{t("inventory.lowStockThresholdHint")}</Form.Hint>
                  <Form.Control>
                    <Input type="number" min={0} step={1} {...field} />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )
            }}
          />
        </RouteDrawer.Body>
        <RouteDrawer.Footer>
          <div className="flex items-center justify-end gap-x-2">
            <RouteDrawer.Close asChild>
              <Button variant="secondary" size="small">
                {t("actions.cancel")}
              </Button>
            </RouteDrawer.Close>
            <Button type="submit" size="small" isLoading={isLoading}>
              {t("actions.save")}
            </Button>
          </div>
        </RouteDrawer.Footer>
      </KeyboundForm>
    </RouteDrawer.Form>
  )
}
