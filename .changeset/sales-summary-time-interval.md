---
"@medusajs/medusa": patch
"@medusajs/types": patch
"@medusajs/dashboard": patch
---

feat(medusa,types,dashboard): add a time interval control to the admin home page sales overview (last 7 days, 30 days, 3 months, 12 months, or a custom date range), backed by new `start_date` and `end_date` query parameters on `GET /admin/analytics/sales-summary` that default to the last 7 days and are limited to 12 months
