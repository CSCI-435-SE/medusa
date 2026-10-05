import { z } from "@medusajs/framework/zod"

/**
 * The sales summary endpoint takes no query parameters: the issue (#42) asks
 * for an all-time snapshot with no time interval or filters. An empty schema
 * is still used so the route goes through the standard query validation
 * middleware, which makes adding parameters later (e.g. a date range) easy.
 */
export type AdminGetSalesSummaryParamsType = z.infer<
  typeof AdminGetSalesSummaryParams
>
export const AdminGetSalesSummaryParams = z.object({})
