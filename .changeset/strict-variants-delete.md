---
"@medusajs/medusa": patch
---

fix(medusa): Enforce the product ID when deleting a product variant through `DELETE /admin/products/:id/variants/:variant_id`. Variants that don't belong to the product, or don't exist, now return a 404
