import { z } from "@medusajs/framework/zod"
import {
  getRequestedRange,
  isRangeWithinLimit,
  MAX_RANGE_MONTHS,
} from "./date-range"

/**
 * Query parameters for `GET /admin/analytics/sales-summary`.
 *
 * Both dates are optional: with neither, the summary covers the last 7 days
 * (issue #30). The range is filtered on the order's creation time and may not
 * be longer than `MAX_RANGE_MONTHS`.
 */
export type AdminGetSalesSummaryParamsType = z.infer<
  typeof AdminGetSalesSummaryParams
>
export const AdminGetSalesSummaryParams = z
  .object({
    start_date: z.coerce.date().optional(),
    end_date: z.coerce.date().optional(),
  })
  .refine(
    ({ start_date, end_date }) =>
      !start_date || !end_date || end_date.getTime() >= start_date.getTime(),
    { message: "end_date cannot be before start_date", path: ["end_date"] }
  )
  .refine(
    (params) => {
      const { start, end } = getRequestedRange(params)

      return isRangeWithinLimit(start, end)
    },
    {
      message: `The date range cannot be longer than ${MAX_RANGE_MONTHS} months`,
      path: ["start_date"],
    }
  )
