import {
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework"
import { MiddlewareRoute } from "@medusajs/framework/http"
import { PolicyOperation } from "@medusajs/framework/utils"
import * as ProductQueryConfig from "../products/query-config"
import { Entities } from "../products/query-config"
import { AdminCreateBundle, AdminGetBundleParams, AdminUpdateBundle } from "./validators"

/**
 * Bundle routes live under /admin/bundles. Like every /admin route they are
 * only available to logged-in admin users (unauthenticated calls get a 401).
 * A bundle is a product, so the product entity policies apply.
 */
export const adminBundleRoutesMiddlewares: MiddlewareRoute[] = [
  {
    method: ["POST"],
    matcher: "/admin/bundles",
    middlewares: [
      validateAndTransformBody(AdminCreateBundle),
      validateAndTransformQuery(
        AdminGetBundleParams,
        ProductQueryConfig.retrieveProductQueryConfig
      ),
    ],
    policies: [{ resource: Entities.product, operation: PolicyOperation.create }],
  },
  {
    method: ["POST"],
    matcher: "/admin/bundles/:id",
    middlewares: [
      validateAndTransformBody(AdminUpdateBundle),
      validateAndTransformQuery(
        AdminGetBundleParams,
        ProductQueryConfig.retrieveProductQueryConfig
      ),
    ],
    policies: [{ resource: Entities.product, operation: PolicyOperation.update }],
  },
]
