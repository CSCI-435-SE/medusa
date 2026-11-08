import { z } from "zod"

export const EditInventoryItemSchema = z.object({
  title: z.string().optional(),
  sku: z.string().min(1),
  // Empty input is rejected instead of coerced to 0, which would turn the warning off
  low_stock_threshold: z
    .union([z.number(), z.string().trim().min(1).transform(Number)])
    .pipe(z.number().int().min(0).max(2147483647)),
})
