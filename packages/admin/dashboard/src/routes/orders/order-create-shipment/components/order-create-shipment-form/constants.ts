import { z } from "zod"

export const TRACKING_STATUSES = [
  "pending",
  "in_transit",
  "delivered",
  "returned",
  "failed",
] as const

export const CreateShipmentSchema = z.object({
  labels: z.array(
    z.object({
      tracking_number: z.string(),
      // TODO: this 2 are not optional in the API
      tracking_url: z.string().optional(),
      label_url: z.string().optional(),
    })
  ),
  carrier_name: z.string().optional(),
  tracking_status: z.enum(TRACKING_STATUSES).optional(),
  send_notification: z.boolean().optional(),
})
