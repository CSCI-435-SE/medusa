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
    fields: ["orders.id", "orders.total"],
  })

  const customers = await remoteQuery(queryObject)
  const orders: { total: number }[] = customers[0]?.orders ?? []

  return {
    order_count: orders.length,
    lifetime_value: orders.reduce((sum, order) => sum + (order.total ?? 0), 0),
  }
}
