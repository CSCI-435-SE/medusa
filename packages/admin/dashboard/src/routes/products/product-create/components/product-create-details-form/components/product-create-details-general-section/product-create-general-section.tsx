import { Input, Textarea } from "@medusajs/ui"
import { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Form } from "../../../../../../../components/common/form"
import { HandleInput } from "../../../../../../../components/inputs/handle-input"
import { ProductCreateSchemaType } from "../../../../types"

type ProductCreateGeneralSectionProps = {
  form: UseFormReturn<ProductCreateSchemaType>
}

export const ProductCreateGeneralSection = ({
  form,
}: ProductCreateGeneralSectionProps) => {
  const { t } = useTranslation()

  return (
    <div id="general" className="flex flex-col gap-y-6">
      <div className="flex flex-col gap-y-2">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Form.Field
            control={form.control}
            name="title"
            render={({ field }) => {
              return (
                <Form.Item>
                  <Form.Label>{t("products.fields.title.label")}</Form.Label>
                  <Form.Control>
                    <Input
                      {...field}
                      placeholder={t("products.fields.title.placeholder")}
                    />
                  </Form.Control>
                </Form.Item>
              )
            }}
          />
          <Form.Field
            control={form.control}
            name="subtitle"
            render={({ field }) => {
              return (
                <Form.Item>
                  <Form.Label optional>
                    {t("products.fields.subtitle.label")}
                  </Form.Label>
                  <Form.Control>
                    <Input
                      {...field}
                      placeholder={t("products.fields.subtitle.placeholder")}
                    />
                  </Form.Control>
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
                  <Form.Label tooltip={t("products.fields.handle.tooltip")}>
                    {t("fields.handle")}
                  </Form.Label>
                  <Form.Control>
                    <HandleInput
                      {...field}
                      placeholder={t("products.fields.handle.placeholder")}
                    />
                  </Form.Control>
                </Form.Item>
              )
            }}
          />
        </div>
      </div>
      <Form.Field
        control={form.control}
        name="description"
        render={({ field }) => {
          return (
            <Form.Item>
              <Form.Label optional>
                {t("products.fields.description.label")}
              </Form.Label>
              <Form.Control>
                <Textarea
                  {...field}
                  placeholder={t("products.fields.description.placeholder")}
                />
              </Form.Control>
              {/*
                Live character count. `field.value` comes from react-hook-form's
                Controller, so it already re-renders on every keystroke - no
                extra state needed to keep this in sync with the textarea.
              */}
              <Form.Hint>
                {t("general.characters", { count: field.value?.length ?? 0 })}
              </Form.Hint>
            </Form.Item>
          )
        }}
      />
    </div>
  )
}
