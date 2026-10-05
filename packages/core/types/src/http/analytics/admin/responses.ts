import { AdminSalesSummary } from "./entities"

export interface AdminSalesSummaryResponse {
  /**
   * The store's sales summary.
   */
  sales_summary: AdminSalesSummary
}
