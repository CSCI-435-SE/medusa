import { HttpTypes } from "@medusajs/types"
import { CurrencyInput, Hint } from "@medusajs/ui"
import { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Form } from "../../../../../components/common/form"
import { getCurrencySymbol } from "../../../../../lib/data/currencies"
import { BundleSchemaType } from "../../../bundle-create/constants"

type BundlePricesFormProps = {
  form: UseFormReturn<BundleSchemaType>
  currencies: HttpTypes.AdminStore["supported_currencies"]
}

/**
 * The bundle's own price, one input per currency the store supports (AC 1).
 *
 * The product form prices many variants at once in a data grid; a bundle has a
 * single variant, so the same `prices` record is edited as a short list of
 * inputs keyed by currency code. `normalizePrices` turns it into the payload
 * for both forms.
 */
export const BundlePricesForm = ({
  form,
  currencies = [],
}: BundlePricesFormProps) => {
  const { t } = useTranslation()

  // "Set a price in at least one currency" belongs to the record, not to any
  // one currency input, so it is read off form state and shown under the list.
  const pricesError = form.formState.errors.prices

  return (
    <div id="prices" className="flex flex-col gap-y-4">
      <div className="flex flex-col">
        <Form.Label>{t("products.bundles.prices.label")}</Form.Label>
        <Form.Hint>{t("products.bundles.prices.hint")}</Form.Hint>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {currencies.map(({ currency_code }) => (
          <Form.Field
            key={currency_code}
            control={form.control}
            name={`prices.${currency_code}`}
            render={({ field: { onChange, value, ...field } }) => (
              <Form.Item>
                <Form.Label>{currency_code.toUpperCase()}</Form.Label>
                <Form.Control>
                  <CurrencyInput
                    {...field}
                    min={0}
                    code={currency_code}
                    symbol={getCurrencySymbol(currency_code)}
                    value={value ?? ""}
                    onValueChange={(amount) => onChange(amount ?? "")}
                  />
                </Form.Control>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
        ))}
      </div>

      {pricesError && "message" in pricesError && pricesError.message && (
        <Hint variant="error">{String(pricesError.message)}</Hint>
      )}
    </div>
  )
}
