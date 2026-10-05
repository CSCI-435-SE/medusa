import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { HttpTypes } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
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
 * Returns a snapshot of the store's sales performance for the admin dashboard
 * home page (issue #42): total revenue, number of orders, and the top three
 * products by units sold.
 *
 * Only paid, non-draft, non-canceled orders in the store's default currency
 * are counted. See `../helpers.ts` for the exact rules.
 *
 * The figures are computed on every request (there is no server-side cache);
 * the dashboard caches the response for a few minutes instead.
 */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.AdminSalesSummaryResponse>
) => {
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
      sales_summary: finalizeSalesSummary(accumulator, null),
    })
  }

  // 2. Page through all candidate orders and add each batch to the running
  //    totals. The database filters out drafts, canceled orders, and other
  //    currencies up front so we load as few rows as possible. Payment status
  //    can't be filtered in the database (it's derived from the payment
  //    collections), so that check happens in `addOrdersToSalesSummary`.
  let skip = 0

  while (true) {
    const { data: orders } = await query.graph({
      entity: "order",
      fields: SALES_SUMMARY_ORDER_FIELDS,
      filters: {
        is_draft_order: false,
        status: { $nin: EXCLUDED_ORDER_STATUSES },
        currency_code: currencyCode,
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
    sales_summary: finalizeSalesSummary(accumulator, currencyCode),
  })
}
