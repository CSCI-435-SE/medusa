import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  remoteQueryObjectFromString,
} from "@medusajs/framework/utils"

export const refetchCustomer = async (
  customerId: string,
  scope: MedusaContainer,
  fields: string[]
) => {
  const remoteQuery = scope.resolve(ContainerRegistrationKeys.REMOTE_QUERY)
  const queryObject = remoteQueryObjectFromString({
    entryPoint: "customer",
    variables: {
      filters: { id: customerId },
    },
    fields: fields,
  })

  const customers = await remoteQuery(queryObject)
  return customers[0]
}

export const getCustomerOrderStats = async (
  customerId: string,
  scope: MedusaContainer
) => {
  const remoteQuery = scope.resolve(ContainerRegistrationKeys.REMOTE_QUERY)
  const queryObject = remoteQueryObjectFromString({
    entryPoint: "customer",
    variables: {
      filters: { id: customerId },
    },
    fields: ["orders.id", "orders.total", "orders.currency_code"],
  })

  const customers = await remoteQuery(queryObject)
  const orders: { total: number; currency_code: string }[] =
    customers[0]?.orders ?? []

  const totalsByCurrency = new Map<string, number>()
  for (const order of orders) {
    const currentTotal = totalsByCurrency.get(order.currency_code) ?? 0
    totalsByCurrency.set(order.currency_code, currentTotal + (order.total ?? 0))
  }

  return {
    order_count: orders.length,
    lifetime_value: Array.from(totalsByCurrency, ([currency_code, amount]) => ({
      currency_code,
      amount,
    })),
  }
}
