import { XMarkMini } from "@medusajs/icons"
import { Button, Hint, IconButton, Input, Label } from "@medusajs/ui"
import { UseFormReturn, useFieldArray, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Form } from "../../../../../components/common/form"
import { Combobox } from "../../../../../components/inputs/combobox"
import { useComboboxData } from "../../../../../hooks/use-combobox-data"
import { sdk } from "../../../../../lib/client"
import {
  BundleSchemaType,
  emptyBundleComponent,
} from "../../../bundle-create/constants"

/**
 * Fields the variant picker needs to label an option.
 */
const VARIANT_FIELDS = "id,title,sku,product.title"

const variantLabel = (variant: {
  title?: string | null
  sku?: string | null
  product?: { title?: string | null } | null
}) => {
  const name = [variant.product?.title, variant.title]
    .filter(Boolean)
    .join(" · ")

  return variant.sku ? `${name} (${variant.sku})` : name
}

type ComponentRowProps = {
  form: UseFormReturn<BundleSchemaType>
  index: number
  isVariantTaken: (variantId: string, index: number) => boolean
  onRemove: () => void
  canRemove: boolean
}

/**
 * One component row: which variant, and how many of it go into one bundle.
 *
 * Laid out the same way as the inventory kit rows in the product create form
 * (`ProductCreateInventoryKitSection`), which pair a combobox with a quantity
 * for the same kind of relationship.
 */
const ComponentRow = ({
  form,
  index,
  isVariantTaken,
  onRemove,
  canRemove,
}: ComponentRowProps) => {
  const { t } = useTranslation()

  const selectedVariantId = useWatch({
    control: form.control,
    name: `components.${index}.variant_id`,
  })

  const variants = useComboboxData({
    queryKey: ["product_variants", "bundle_components"],
    defaultValueKey: "id",
    selectedValue: selectedVariantId,
    queryFn: (params) =>
      sdk.admin.productVariant.list({ ...params, fields: VARIANT_FIELDS }),
    getOptions: (data) =>
      data.variants.map((variant) => ({
        label: variantLabel(variant),
        value: variant.id,
      })),
  })

  return (
    <li className="bg-ui-bg-component shadow-elevation-card-rest grid grid-cols-[1fr_28px] items-center gap-1.5 rounded-xl p-1.5">
      <div className="grid grid-cols-[min-content,1fr] items-center gap-1.5">
        <div className="flex items-center px-2 py-1.5">
          <Label
            size="xsmall"
            weight="plus"
            className="text-ui-fg-subtle"
            htmlFor={`components.${index}.variant_id`}
          >
            {t("fields.variant")}
          </Label>
        </div>

        <Form.Field
          control={form.control}
          name={`components.${index}.variant_id`}
          render={({ field }) => (
            <Form.Item>
              <Form.Control>
                <Combobox
                  {...field}
                  options={variants.options.map((option) => ({
                    ...option,
                    disabled: isVariantTaken(option.value, index),
                  }))}
                  searchValue={variants.searchValue}
                  onBlur={() => variants.onSearchValueChange("")}
                  onSearchValueChange={variants.onSearchValueChange}
                  fetchNextPage={variants.fetchNextPage}
                  className="bg-ui-bg-field-component hover:bg-ui-bg-field-component-hover"
                  placeholder={t(
                    "products.bundles.components.variantPlaceholder"
                  )}
                />
              </Form.Control>
              <Form.ErrorMessage />
            </Form.Item>
          )}
        />

        <div className="flex items-center px-2 py-1.5">
          <Label
            size="xsmall"
            weight="plus"
            className="text-ui-fg-subtle"
            htmlFor={`components.${index}.quantity`}
          >
            {t("fields.quantity")}
          </Label>
        </div>
        <Form.Field
          control={form.control}
          name={`components.${index}.quantity`}
          render={({ field: { onChange, value, ...field } }) => (
            <Form.Item>
              <Form.Control>
                {/*
                  No `min`/`step` on purpose. The browser's own constraint
                  validation blocks the submit event before react-hook-form
                  runs, so the admin would get a native tooltip on some
                  browsers and our message on others. The schema is the single
                  place the quantity rules live (AC 3).
                */}
                <Input
                  type="number"
                  className="bg-ui-bg-field-component"
                  value={value ?? ""}
                  onChange={(event) => {
                    const next = event.target.value
                    onChange(next === "" ? "" : Number(next))
                  }}
                  {...field}
                  placeholder={t(
                    "products.bundles.components.quantityPlaceholder"
                  )}
                />
              </Form.Control>
              <Form.ErrorMessage />
            </Form.Item>
          )}
        />
      </div>
      {canRemove ? (
        <IconButton
          type="button"
          size="small"
          variant="transparent"
          className="text-ui-fg-muted"
          aria-label={t("actions.remove")}
          onClick={onRemove}
        >
          <XMarkMini />
        </IconButton>
      ) : (
        <span />
      )}
    </li>
  )
}

type BundleComponentsFormProps = {
  form: UseFormReturn<BundleSchemaType>
}

/**
 * The components section of the bundle create and edit forms (AC 1 and 2).
 *
 * The "at least 2 components" message belongs to the array rather than to any
 * one row, so it is read off form state and rendered under the list.
 */
export const BundleComponentsForm = ({ form }: BundleComponentsFormProps) => {
  const { t } = useTranslation()

  const components = useFieldArray({
    control: form.control,
    name: "components",
  })

  const values = useWatch({ control: form.control, name: "components" })

  /**
   * A variant already used by another row is disabled, which is the same way
   * the inventory kit rows keep one item out of two rows.
   */
  const isVariantTaken = (variantId: string, index: number) =>
    !!values?.some(
      (component, otherIndex) =>
        otherIndex !== index && component.variant_id === variantId
    )

  const arrayError = form.formState.errors.components

  return (
    <div id="components" className="flex flex-col gap-y-4">
      <div className="flex items-start justify-between gap-x-4">
        <div className="flex flex-col">
          <Form.Label>{t("products.bundles.components.label")}</Form.Label>
          <Form.Hint>{t("products.bundles.components.hint")}</Form.Hint>
        </div>
        <Button
          size="small"
          variant="secondary"
          type="button"
          onClick={() => components.append(emptyBundleComponent())}
        >
          {t("products.bundles.components.add")}
        </Button>
      </div>

      <ul className="flex flex-col gap-y-2">
        {components.fields.map((field, index) => (
          <ComponentRow
            key={field.id}
            form={form}
            index={index}
            isVariantTaken={isVariantTaken}
            onRemove={() => components.remove(index)}
            canRemove={components.fields.length > 1}
          />
        ))}
      </ul>

      {/*
        `arrayError` is the array itself when the list is too short, and an
        array of per-row errors otherwise, so only a message on the node is
        shown here. The rows render their own.
      */}
      {arrayError && "message" in arrayError && arrayError.message && (
        <Hint variant="error">{String(arrayError.message)}</Hint>
      )}
    </div>
  )
}
