---
"@medusajs/core-flows": patch
"@medusajs/types": patch
"@medusajs/dashboard": patch
---

feat(core-flows,types,dashboard): Add a carrier name and tracking status to shipments. The shipment form saves them to the fulfillment's metadata, the order fulfillment section shows them, with the tracking status as a colored badge, and `createOrderShipmentWorkflow` now merges shipment metadata into the fulfillment's existing metadata instead of dropping it
