import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { HttpTypes } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { resolveDateRange } from "../date-range"
import { AdminGetSalesSummaryParamsType } from "../validators"
import {
  addOrdersToSalesSummary,
  createSalesSummaryAccumulator,
  EXCLUDED_ORDER_STATUSES,
  finalizeSalesSummary,
  SALES_SUMMARY_ORDER_FIELDS,
  SalesSummaryOrder,
} from "../helpers"

/**
 * How many orders to load per database query. Orders are processed in
 * batches so memory use stays flat no matter how many orders the store has.
 */
const ORDER_BATCH_SIZE = 500

/**
 * GET /admin/analytics/sales-summary
 *
 * Returns the store's sales performance for the admin dashboard home page
 * (issue #42): total revenue, number of orders, and the top three products by
 * units sold.
 *
 * The summary covers orders placed between `start_date` and `end_date` (issue
 * #30). Without them it covers the last 7 days. Ranges are limited to 12
 * months; see `../date-range.ts` for the rules.
 *
 * Only paid, non-draft, non-canceled orders in the store's default currency
 * are counted. See `../helpers.ts` for the exact rules.
 *
 * The figures are computed on every request (there is no server-side cache);
 * the dashboard caches the response for a few minutes instead.
 */
export const GET = async (
  req: AuthenticatedMedusaRequest<undefined, AdminGetSalesSummaryParamsType>,
  res: MedusaResponse<HttpTypes.AdminSalesSummaryResponse>
) => {
  const { start, end } = resolveDateRange(req.validatedQuery)
  const dates = {
    start_date: start.toISOString(),
    end_date: end.toISOString(),
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // 1. Find the store's default currency. Revenue is reported in this
  //    currency only, because orders placed in other currencies can't be
  //    added together without exchange rates (which Medusa doesn't track).
  const {
    data: [store],
  } = await query.graph({
    entity: "store",
    fields: [
      "supported_currencies.currency_code",
      "supported_currencies.is_default",
    ],
    pagination: { take: 1 },
  })

  const currencyCode =
    store?.supported_currencies?.find((currency) => currency?.is_default)
      ?.currency_code ?? null

  const accumulator = createSalesSummaryAccumulator()

  // Without a default currency there is nothing meaningful to report, so we
  // return the zero state rather than an error.
  if (!currencyCode) {
    return res.json({
      sales_summary: { ...finalizeSalesSummary(accumulator, null), ...dates },
    })
  }

  // 2. Page through all candidate orders and add each batch to the running
  //    totals. The database filters out drafts, canceled orders, other
  //    currencies, and orders outside the date range up front so we load as
  //    few rows as possible. Payment status can't be filtered in the database
  //    (it's derived from the payment collections), so that check happens in
  //    `addOrdersToSalesSummary`.
  let skip = 0

  while (true) {
    const { data: orders } = await query.graph({
      entity: "order",
      fields: SALES_SUMMARY_ORDER_FIELDS,
      filters: {
        is_draft_order: false,
        status: { $nin: EXCLUDED_ORDER_STATUSES },
        currency_code: currencyCode,
        // The order's creation time (time of purchase) decides which range
        // it belongs to.
        created_at: { $gte: start, $lte: end },
      },
      pagination: {
        skip,
        take: ORDER_BATCH_SIZE,
        // A stable sort order is required when paginating with skip/take,
        // otherwise rows could be repeated or skipped between pages.
        order: { id: "ASC" },
      },
    })

    addOrdersToSalesSummary(
      accumulator,
      orders as unknown as SalesSummaryOrder[],
      currencyCode
    )

    // A short page means we've reached the last batch.
    if (orders.length < ORDER_BATCH_SIZE) {
      break
    }

    skip += ORDER_BATCH_SIZE
  }

  // 3. Convert the running totals into the response shape (sorting and
  //    trimming the top products list).
  return res.json({
    sales_summary: {
      ...finalizeSalesSummary(accumulator, currencyCode),
      ...dates,
    },
  })
}
