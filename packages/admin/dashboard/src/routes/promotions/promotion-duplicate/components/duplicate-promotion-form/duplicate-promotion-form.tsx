import { HttpTypes } from "@medusajs/types"
import { Button, Input, toast } from "@medusajs/ui"
import { FieldErrors, Resolver, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Form } from "../../../../../components/common/form"
import { RouteDrawer, useRouteModal } from "../../../../../components/modals"
import { KeyboundForm } from "../../../../../components/utilities/keybound-form"
import { useDuplicatePromotion } from "../../../../../hooks/api/promotions"

type DuplicatePromotionFormProps = {
  promotion: Pick<HttpTypes.AdminPromotion, "id" | "code">
}

type DuplicatePromotionValues = { code: string }

/**
 * The code is required, nothing else is checked here. The server checks that
 * no other promotion uses it, and that error is shown on the field.
 *
 * This is a plain resolver instead of `zodResolver` for the same reason as the
 * duplicate product form: the installed `@hookform/resolvers` can't catch zod 4
 * validation errors.
 */
const resolver: Resolver<DuplicatePromotionValues> = async (values) => {
  const code = values.code.trim()
  const errors: FieldErrors<DuplicatePromotionValues> = {}

  if (!code) {
    errors.code = { type: "required", message: "" }
  }

  return Object.keys(errors).length
    ? { values: {}, errors }
    : { values: { code }, errors: {} }
}

export const DuplicatePromotionForm = ({
  promotion,
}: DuplicatePromotionFormProps) => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()

  const form = useForm<DuplicatePromotionValues>({
    defaultValues: {
      code: `${promotion.code}-COPY`,
    },
    resolver,
  })

  const { mutateAsync, isPending } = useDuplicatePromotion(promotion.id)

  const handleSubmit = form.handleSubmit(async (data) => {
    await mutateAsync(
      { code: data.code },
      {
        onSuccess: ({ promotion: created }) => {
          toast.success(
            t("promotions.duplicate.successToast", { code: created.code })
          )
          // Land on the new draft promotion, not the original. Going through
          // handleSuccess skips the unsaved changes prompt for an edited code.
          handleSuccess(`/promotions/${created.id}`)
        },
        onError: (e) => {
          // e.g. another promotion already uses the code.
          form.setError("code", { type: "manual", message: e.message })
        },
      }
    )
  })

  return (
    <RouteDrawer.Form form={form}>
      <KeyboundForm
        onSubmit={handleSubmit}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <RouteDrawer.Body className="flex flex-1 flex-col gap-y-4 overflow-y-auto">
          <Form.Field
            control={form.control}
            name="code"
            render={({ field }) => {
              return (
                <Form.Item>
                  <Form.Label>{t("fields.code")}</Form.Label>
                  <Form.Control>
                    <Input {...field} />
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
              <Button size="small" variant="secondary">
                {t("actions.cancel")}
              </Button>
            </RouteDrawer.Close>
            <Button size="small" type="submit" isLoading={isPending}>
              {t("actions.duplicate")}
            </Button>
          </div>
        </RouteDrawer.Footer>
      </KeyboundForm>
    </RouteDrawer.Form>
  )
}
