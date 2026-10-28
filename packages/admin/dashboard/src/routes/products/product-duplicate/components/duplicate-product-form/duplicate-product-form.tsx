import { HttpTypes } from "@medusajs/types"
import { Button, Input, toast } from "@medusajs/ui"
import { FieldErrors, Resolver, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { Form } from "../../../../../components/common/form"
import { RouteDrawer } from "../../../../../components/modals"
import { KeyboundForm } from "../../../../../components/utilities/keybound-form"
import { useDuplicateProduct } from "../../../../../hooks/api/products"

type DuplicateProductFormProps = {
  product: Pick<HttpTypes.AdminProduct, "id" | "title" | "handle">
}

type DuplicateProductValues = { title: string; handle: string }

/**
 * Both fields are required, nothing else is checked here. The server still
 * checks that the handle is not already used by another product and the error
 * is shown as a toast.
 *
 * This is a plain resolver instead of `zodResolver` because the installed
 * `@hookform/resolvers` (3.4.2) cannot catch zod 4 validation errors: it
 * rethrows them, so an empty field would never show an error.
 */
const resolver: Resolver<DuplicateProductValues> = async (values) => {
  const title = values.title.trim()
  const handle = values.handle.trim()
  const errors: FieldErrors<DuplicateProductValues> = {}

  if (!title) {
    errors.title = { type: "required", message: "" }
  }

  if (!handle) {
    errors.handle = { type: "required", message: "" }
  }

  return Object.keys(errors).length
    ? { values: {}, errors }
    : { values: { title, handle }, errors: {} }
}

export const DuplicateProductForm = ({
  product,
}: DuplicateProductFormProps) => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const form = useForm<DuplicateProductValues>({
    // Pre-filled as a starting point; the owner can keep or edit both values.
    defaultValues: {
      title: `${product.title} (Copy)`,
      handle: `${product.handle}-copy`,
    },
    resolver,
  })

  const { mutateAsync, isPending } = useDuplicateProduct(product.id)

  const handleSubmit = form.handleSubmit(async (data) => {
    await mutateAsync(
      { title: data.title.trim(), handle: data.handle.trim() },
      {
        onSuccess: ({ product: created }) => {
          toast.success(
            t("products.duplicate.successToast", { title: created.title })
          )
          // Land on the new draft product, not the original.
          navigate(`/products/${created.id}`, { replace: true })
        },
        onError: (e) => {
          // e.g. the handle is already used by another product.
          toast.error(e.message)
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
            name="handle"
            render={({ field }) => {
              return (
                <Form.Item>
                  <Form.Label>{t("fields.handle")}</Form.Label>
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
