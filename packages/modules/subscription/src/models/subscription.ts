import {
  model,
  SubscriptionInterval,
  SubscriptionStatus,
} from "@medusajs/framework/utils"

const Subscription = model
  .define("Subscription", {
    id: model.id({ prefix: "sub" }).primaryKey(),
    customer_id: model.text(),
    variant_id: model.text(),
    quantity: model.number(),
    interval: model.enum(SubscriptionInterval),
    status: model.enum(SubscriptionStatus).default(SubscriptionStatus.ACTIVE),
    next_billing_at: model.dateTime(),
    payment_provider_id: model.text(),
    payment_method_id: model.text().nullable(),
    canceled_at: model.dateTime().nullable(),
    failed_at: model.dateTime().nullable(),
    failure_reason: model.text().nullable(),
  })
  .indexes([
    {
      on: ["customer_id"],
      where: "deleted_at IS NULL",
    },
    {
      on: ["status", "next_billing_at"],
      where: "deleted_at IS NULL",
    },
  ])

export default Subscription
