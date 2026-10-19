import {
  QueryKey,
  UseQueryOptions,
  keepPreviousData,
  useQuery,
} from "@tanstack/react-query"

import { FetchError } from "@medusajs/js-sdk"
import { HttpTypes } from "@medusajs/types"
import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

const ANALYTICS_QUERY_KEY = "analytics" as const
export const analyticsQueryKeys = queryKeysFactory(ANALYTICS_QUERY_KEY)

/**
 * How long a fetched sales summary is considered fresh. The summary is a
 * snapshot (no live updates), so we avoid refetching it every time the
 * merchant navigates back to the home page or switches back to a period they
 * already viewed.
 */
const SALES_SUMMARY_STALE_TIME = 5 * 60 * 1000 // 5 minutes

/**
 * Fetches the sales summary (total revenue, order count, and top products)
 * shown on the dashboard home page, for the date range in `query` (issue #30).
 * Each range is cached separately, and the previous range's figures stay on
 * screen while a new range loads so the panel doesn't flash its skeleton.
 *
 * The JS SDK has no method for this custom endpoint, so we call it through the
 * SDK's generic `client.fetch`, which still handles the base URL and the
 * admin's authentication for us.
 */
export const useSalesSummary = (
  query?: HttpTypes.AdminGetSalesSummaryParams,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminSalesSummaryResponse,
      FetchError,
      HttpTypes.AdminSalesSummaryResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<HttpTypes.AdminSalesSummaryResponse>(
        "/admin/analytics/sales-summary",
        { method: "GET", query }
      ),
    queryKey: analyticsQueryKeys.detail("sales-summary", query),
    staleTime: SALES_SUMMARY_STALE_TIME,
    placeholderData: keepPreviousData,
    ...options,
  })

  // Spread the response so callers can write `const { sales_summary } = ...`,
  // matching the convention used by the other hooks in this folder.
  return { ...data, ...rest }
}
