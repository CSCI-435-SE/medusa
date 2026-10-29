import { asClass, asValue } from "@medusajs/framework/awilix"
import { LoaderOptions } from "@medusajs/framework/types"
import { isDefined, MedusaError } from "@medusajs/framework/utils"
import { RedisDistributedTransactionStorage } from "../utils"

export default async ({
  container,
  options,
  dataLoaderOnly,
}: LoaderOptions<{ failedExecutionRetentionTime?: number }>): Promise<void> => {
  const failedExecutionRetentionTime = options?.failedExecutionRetentionTime

  if (
    isDefined(failedExecutionRetentionTime) &&
    (!Number.isInteger(failedExecutionRetentionTime) ||
      failedExecutionRetentionTime < 0 ||
      // retention_time is a Postgres integer column
      failedExecutionRetentionTime > 2147483647)
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_ARGUMENT,
      `The workflow engine module option "failedExecutionRetentionTime" must be an integer number of seconds between 0 and 2147483647. Received: ${failedExecutionRetentionTime}`
    )
  }

  container.register({
    failedExecutionRetentionTime: asValue(failedExecutionRetentionTime),
    redisDistributedTransactionStorage: asClass(
      RedisDistributedTransactionStorage
    ).singleton(),
    dataLoaderOnly: asValue(!!dataLoaderOnly),
  })
}
