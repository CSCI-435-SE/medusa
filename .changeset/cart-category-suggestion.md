---
"@medusajs/core-flows": patch
"@medusajs/js-sdk": patch
"integration-tests-http": patch
---

Suggest a product for a cart from the categories of the products in it: the best-selling eligible product in those categories, or the first eligible one if none has been sold. The Get Suggested Product Store API route now returns `null` instead of falling back to the whole catalog when no product in the cart's categories is eligible. Inactive and internal categories are skipped, and products that require shipping are only suggested if the cart can choose a shipping option for them, to its shipping address or, without one, to its region
