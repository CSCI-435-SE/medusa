---
"@medusajs/inventory": patch
"@medusajs/types": patch
"@medusajs/medusa": patch
"@medusajs/dashboard": patch
---

feat(inventory,types,medusa,dashboard): add a `stock_status` filter (`low_stock`, `out_of_stock`) to `GET /admin/inventory-items`, sorted by available quantity, lowest first. The admin inventory list gets a stock status filter and Available and Low stock threshold columns
