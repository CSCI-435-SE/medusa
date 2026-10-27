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

// A copy must not keep the pre-filled "(Copy)" name.
const COPY_SUFFIX_REGEX = /\(copy\)\s*$/i

type DuplicateProductValues = { title: string; handle: string }

/**
 * Builds a resolver per product, because the title rule depends on the
 * original title. The server enforces the same rules, so API callers cannot
 * bypass them; this only gives the owner immediate feedback. It is a plain
 * resolver (not zodResolver) because the installed @hookform/resolvers cannot
 * catch zod 4 validation errors.
 */
const buildResolver =
  (
    product: DuplicateProductFormProps["product"],
    message: string
  ): Resolver<DuplicateProductValues> =>
  async (values) => {
    const title = values.title.trim()
    const handle = values.handle.trim()
    const errors: FieldErrors<DuplicateProductValues> = {}

    if (
      !title ||
      title.toLowerCase() === product.title.trim().toLowerCase() ||
      COPY_SUFFIX_REGEX.test(title)
    ) {
      errors.title = { type: "validate", message }
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
    // Pre-filled as a starting point only; the owner has to change the title.
    defaultValues: {
      title: `${product.title} (Copy)`,
      handle: `${product.handle}-copy`,
    },
    resolver: buildResolver(product, t("products.duplicate.titleMustChange")),
    // Validate on change so the submit button reflects the title rule.
    mode: "onChange",
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

  // The pre-filled "(Copy)" title is invalid, so the button starts disabled
  // and enables once the title has been changed to something valid.
  const isTitleValid = !form.formState.errors.title && form.formState.isValid

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
            <Button
              size="small"
              type="submit"
              isLoading={isPending}
              disabled={!isTitleValid}
            >
              {t("actions.duplicate")}
            </Button>
          </div>
        </RouteDrawer.Footer>
      </KeyboundForm>
    </RouteDrawer.Form>
  )
}
