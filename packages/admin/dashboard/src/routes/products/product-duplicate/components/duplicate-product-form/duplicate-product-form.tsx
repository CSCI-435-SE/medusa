import { HttpTypes } from "@medusajs/types"
import { Button, Checkbox, Hint, Input, Text, toast } from "@medusajs/ui"
import { FieldErrors, Resolver, useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { Form } from "../../../../../components/common/form"
import { RouteDrawer } from "../../../../../components/modals"
import { KeyboundForm } from "../../../../../components/utilities/keybound-form"
import { useDuplicateProduct } from "../../../../../hooks/api/products"

type DuplicateProductFormProps = {
  product: Pick<HttpTypes.AdminProduct, "id" | "title" | "handle">
}

type DuplicateProductInclude = {
  images: boolean
  variants: boolean
  prices: boolean
  inventory_settings: boolean
}

type DuplicateProductValues = {
  title: string
  handle: string
  include: DuplicateProductInclude
}

/**
 * The groups the owner can choose from, in the order they are shown. Prices and
 * inventory settings are stored on the variants, so they are only available
 * when variants are copied.
 */
const INCLUDE_FIELDS: {
  name: keyof DuplicateProductInclude
  labelKey: string
  requiresVariants: boolean
}[] = [
  {
    name: "images",
    labelKey: "products.duplicate.include.images",
    requiresVariants: false,
  },
  {
    name: "variants",
    labelKey: "products.duplicate.include.variants",
    requiresVariants: false,
  },
  {
    name: "prices",
    labelKey: "products.duplicate.include.prices",
    requiresVariants: true,
  },
  {
    name: "inventory_settings",
    labelKey: "products.duplicate.include.inventorySettings",
    requiresVariants: true,
  },
]

/**
 * Both text fields are required, nothing else is checked here. The groups are
 * booleans, and any combination of them is valid. The server still checks that
 * the handle is not already used by another product and the error is shown as
 * a toast.
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
    : { values: { title, handle, include: values.include }, errors: {} }
}

export const DuplicateProductForm = ({
  product,
}: DuplicateProductFormProps) => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const form = useForm<DuplicateProductValues>({
    // Pre-filled as a starting point; the owner can keep or edit both values.
    // Every group starts selected, so duplicating without touching the
    // checkboxes copies the whole product. The selection is not remembered
    // between attempts.
    defaultValues: {
      title: `${product.title} (Copy)`,
      handle: `${product.handle}-copy`,
      include: {
        images: true,
        variants: true,
        prices: true,
        inventory_settings: true,
      },
    },
    resolver,
  })

  const variantsSelected = useWatch({
    control: form.control,
    name: "include.variants",
  })

  const { mutateAsync, isPending } = useDuplicateProduct(product.id)

  /**
   * Unselecting variants also unselects the two groups that depend on them, so
   * the payload always matches the checkboxes the owner can see.
   */
  const onVariantsChange = (checked: boolean) => {
    form.setValue("include.variants", checked)

    if (!checked) {
      form.setValue("include.prices", false)
      form.setValue("include.inventory_settings", false)
    }
  }

  const handleSubmit = form.handleSubmit(async (data) => {
    await mutateAsync(
      {
        title: data.title.trim(),
        handle: data.handle.trim(),
        include: data.include,
      },
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
          <div className="flex flex-col gap-y-3">
            <Text size="small" weight="plus" leading="compact">
              {t("products.duplicate.include.label")}
            </Text>
            {INCLUDE_FIELDS.map(({ name, labelKey, requiresVariants }) => {
              const disabled = requiresVariants && !variantsSelected

              return (
                <Form.Field
                  key={name}
                  control={form.control}
                  name={`include.${name}`}
                  render={({ field: { value, onChange, ...field } }) => {
                    return (
                      <Form.Item>
                        <div className="flex items-center gap-x-2">
                          <Form.Control>
                            <Checkbox
                              {...field}
                              checked={value}
                              disabled={disabled}
                              onCheckedChange={(checked) =>
                                name === "variants"
                                  ? onVariantsChange(!!checked)
                                  : onChange(!!checked)
                              }
                            />
                          </Form.Control>
                          <Form.Label className="!mb-0">
                            {/* The keys are dynamic, as in customizer-menu.tsx. */}
                            {t(labelKey as any)}
                          </Form.Label>
                        </div>
                      </Form.Item>
                    )
                  }}
                />
              )
            })}
            <Hint>{t("products.duplicate.include.hint")}</Hint>
          </div>
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
