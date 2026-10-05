import { ExclamationCircle } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import { Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { NoRecords } from "../../../../components/common/empty-table-content"
import { Skeleton } from "../../../../components/common/skeleton"
import { useSalesSummary } from "../../../../hooks/api/analytics"
import { getLocaleAmount } from "../../../../lib/money-amount-helpers"

/**
 * The "Sales overview" panel on the dashboard home page (issue #42).
 *
 * It shows three metrics computed by `GET /admin/analytics/sales-summary`:
 * total revenue, number of orders, and the top three products by units sold.
 * Only paid, non-draft, non-canceled orders in the store's default currency
 * are counted (the backend applies these rules).
 *
 * The component handles four states:
 * - loading: skeleton placeholders with the same layout as the loaded panel
 * - error: an inline message, so a failing summary doesn't break the page
 * - empty (no qualifying orders): zero values plus short helper messages
 * - loaded: the metrics and the top products list
 */
export const SalesSummarySection = () => {
  const { t } = useTranslation()
  const { sales_summary, isPending, isError } = useSalesSummary()

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading>{t("home.salesSummary.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("home.salesSummary.description")}
        </Text>
      </div>
      <SalesSummaryBody
        summary={sales_summary}
        isPending={isPending}
        isError={isError}
      />
    </Container>
  )
}

/**
 * Picks which state to render. Kept separate from `SalesSummarySection` so the
 * header stays visible in every state and only the body changes.
 */
const SalesSummaryBody = ({
  summary,
  isPending,
  isError,
}: {
  summary?: HttpTypes.AdminSalesSummary
  isPending: boolean
  isError: boolean
}) => {
  const { t } = useTranslation()

  if (isPending) {
    return <SalesSummarySkeleton />
  }

  // We render the error inline rather than throwing to the route's error
  // boundary: the home page should still load even if analytics fail.
  if (isError || !summary) {
    return (
      <NoRecords
        icon={<ExclamationCircle className="text-ui-fg-error" />}
        title={t("home.salesSummary.errorTitle")}
        message={t("home.salesSummary.errorMessage")}
      />
    )
  }

  const hasOrders = summary.order_count > 0

  return (
    <>
      <div className="grid grid-cols-1 divide-y md:grid-cols-2 md:divide-x md:divide-y-0">
        <Metric
          label={t("home.salesSummary.totalRevenue")}
          value={formatRevenue(summary)}
          // Explain a zero value instead of showing a bare "$0.00". If the
          // store has no default currency the backend can't compute revenue,
          // so we tell the merchant how to fix that.
          hint={
            !summary.currency_code
              ? t("home.salesSummary.noCurrencyHint")
              : !hasOrders
              ? t("home.salesSummary.noOrdersHint")
              : undefined
          }
        />
        <Metric
          label={t("home.salesSummary.orderCount")}
          value={summary.order_count.toLocaleString()}
          hint={!hasOrders ? t("home.salesSummary.noOrdersHint") : undefined}
        />
      </div>
      <div className="flex flex-col gap-y-2 px-6 py-4">
        <Text size="small" leading="compact" weight="plus">
          {t("home.salesSummary.topProducts")}
        </Text>
        {summary.top_products.length > 0 ? (
          <TopProductsList products={summary.top_products} />
        ) : (
          <NoRecords
            title={t("home.salesSummary.noSalesTitle")}
            message={t("home.salesSummary.noSalesMessage")}
          />
        )}
      </div>
    </>
  )
}

/**
 * Formats total revenue in the store's default currency using the browser's
 * locale (e.g. "$1,250.50"). Amounts from the API are already in the major
 * unit, so no conversion from cents is needed. Without a currency we can only
 * show a plain zero.
 */
const formatRevenue = (summary: HttpTypes.AdminSalesSummary) => {
  if (!summary.currency_code) {
    return "0"
  }

  return getLocaleAmount(summary.total_revenue, summary.currency_code)
}

/**
 * A single labelled number, with an optional muted hint underneath (used for
 * the empty-state messages).
 */
const Metric = ({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) => {
  return (
    <div className="flex flex-col gap-y-1 px-6 py-4">
      <Text size="small" leading="compact" className="text-ui-fg-subtle">
        {label}
      </Text>
      <Heading level="h2">{value}</Heading>
      {hint && (
        <Text size="small" className="text-ui-fg-muted">
          {hint}
        </Text>
      )}
    </div>
  )
}

/**
 * The ranked list of best selling products. The backend already sorts the
 * products and limits them to three, so we just render them in order.
 */
const TopProductsList = ({
  products,
}: {
  products: HttpTypes.AdminSalesSummaryTopProduct[]
}) => {
  const { t } = useTranslation()

  return (
    <ol className="flex flex-col gap-y-2">
      {products.map((product, index) => (
        <li
          key={product.product_id}
          className="text-ui-fg-subtle flex items-center justify-between gap-x-4"
        >
          <div className="flex min-w-0 items-center gap-x-3">
            <Text size="small" leading="compact" className="text-ui-fg-muted">
              {index + 1}.
            </Text>
            <Text size="small" leading="compact" className="truncate">
              {product.title}
            </Text>
          </div>
          <Text size="small" leading="compact" className="shrink-0">
            {t("home.salesSummary.unitsSold", { count: product.units_sold })}
          </Text>
        </li>
      ))}
    </ol>
  )
}

/**
 * Loading placeholder that mirrors the loaded layout (two metrics, then three
 * product rows) so the page doesn't jump when the data arrives.
 */
const SalesSummarySkeleton = () => {
  return (
    <>
      <div className="grid grid-cols-1 divide-y md:grid-cols-2 md:divide-x md:divide-y-0">
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-y-2 px-6 py-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-32" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-y-3 px-6 py-4">
        <Skeleton className="h-3 w-36" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-3 w-full" />
        ))}
      </div>
    </>
  )
}
