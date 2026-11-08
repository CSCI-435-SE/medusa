---
"@medusajs/inventory": patch
"@medusajs/types": patch
"@medusajs/medusa": patch
"@medusajs/dashboard": patch
---

feat(inventory,types,medusa,dashboard): add a configurable `low_stock_threshold` to inventory items (default 10). The admin inventory list shows a "Low stock" badge when the available quantity is above 0 and at or below the threshold, and an "Out of stock" badge when it is 0 or less. The threshold is editable in the edit inventory item drawer
