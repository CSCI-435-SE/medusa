/**
 * The query parameters accepted by `GET /admin/analytics/sales-summary`.
 *
 * The sales summary is an all-time snapshot, so it takes no parameters yet.
 * This type exists to mirror the `AdminGetSalesSummaryParams` validator in
 * `packages/medusa/src/api/admin/analytics/validators.ts`, which the
 * "Validate HTTP Types" CI check requires. Add fields here whenever you add
 * them to the validator (e.g. a date range).
 */
export interface AdminGetSalesSummaryParams {}
