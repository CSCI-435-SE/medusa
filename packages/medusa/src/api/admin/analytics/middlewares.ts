import {
  MiddlewareRoute,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import { PolicyOperation } from "@medusajs/framework/utils"
import { AdminGetSalesSummaryParams } from "./validators"

/**
 * Middlewares for the `/admin/analytics` routes.
 *
 * Authentication is not configured here: the framework router already
 * requires an authenticated admin user for every `/admin/*` route.
 */
export const adminAnalyticsRoutesMiddlewares: MiddlewareRoute[] = [
  {
    method: ["GET"],
    matcher: "/admin/analytics/sales-summary",
    middlewares: [validateAndTransformQuery(AdminGetSalesSummaryParams, {})],
    // The summary is computed entirely from order data, so anyone allowed to
    // read orders may see it. Reusing the existing `order` resource avoids
    // inventing a new RBAC resource just for this panel.
    policies: [
      {
        resource: "order",
        operation: PolicyOperation.read,
      },
    ],
  },
]
