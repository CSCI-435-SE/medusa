---
"@medusajs/core-flows": patch
"@medusajs/types": patch
"@medusajs/js-sdk": patch
"@medusajs/medusa": patch
"integration-tests-http": patch
---

Add a Store API route that returns a product to suggest for a cart: the best-selling eligible product, or the first eligible product in the catalog when no best-seller is eligible. Products already in the cart, out of stock, or without a price in the cart's currency are excluded
