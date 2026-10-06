import { ModuleJoinerConfig } from "@medusajs/framework/types"
import { LINKS, Modules } from "@medusajs/framework/utils"

export const OrderSubscription: ModuleJoinerConfig = {
  serviceName: LINKS.OrderSubscription,
  isLink: true,
  databaseConfig: {
    tableName: "order_subscription",
    idPrefix: "ordersub",
  },
  alias: [
    {
      name: ["order_subscription", "order_subscriptions"],
      entity: "LinkOrderSubscription",
    },
  ],
  primaryKeys: ["id", "order_id", "subscription_id"],
  relationships: [
    {
      serviceName: Modules.ORDER,
      entity: "Order",
      primaryKey: "id",
      foreignKey: "order_id",
      alias: "order",
      args: {
        methodSuffix: "Orders",
      },
      hasMany: true,
    },
    {
      serviceName: Modules.SUBSCRIPTION,
      entity: "Subscription",
      primaryKey: "id",
      foreignKey: "subscription_id",
      alias: "subscription",
      args: {
        methodSuffix: "Subscriptions",
      },
    },
  ],
  extends: [
    {
      serviceName: Modules.ORDER,
      entity: "Order",
      fieldAlias: {
        subscription: "subscription_link.subscription",
      },
      relationship: {
        serviceName: LINKS.OrderSubscription,
        primaryKey: "order_id",
        foreignKey: "id",
        alias: "subscription_link",
      },
    },
    {
      serviceName: Modules.SUBSCRIPTION,
      entity: "Subscription",
      fieldAlias: {
        orders: {
          path: "orders_link.order",
          isList: true,
        },
      },
      relationship: {
        serviceName: LINKS.OrderSubscription,
        primaryKey: "subscription_id",
        foreignKey: "id",
        alias: "orders_link",
        isList: true,
      },
    },
  ],
}
