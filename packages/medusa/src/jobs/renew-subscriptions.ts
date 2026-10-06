import {
  endSubscriptionWorkflow,
  renewSubscriptionWorkflow,
} from "@medusajs/core-flows"
import {
  ILockingModule,
  ISubscriptionModuleService,
  Logger,
  MedusaContainer,
} from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  SubscriptionStatus,
} from "@medusajs/framework/utils"

const JOB_LOCK_KEY = "renew-subscriptions-job"
const ONE_HOUR = 60 * 60

/**
 * Renews every active subscription whose next billing date has passed. A
 * subscription whose renewal fails is marked as failed and isn't retried.
 */
export default async function renewSubscriptionsJob(
  container: MedusaContainer
) {
  if (!container.hasRegistration(Modules.SUBSCRIPTION)) {
    return
  }

  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const locking = container.resolve<ILockingModule>(Modules.LOCKING)

  // Prevents overlapping runs, e.g. when a run takes longer than the schedule
  // interval, from renewing the same subscription twice.
  try {
    await locking.acquire(JOB_LOCK_KEY, { expire: ONE_HOUR })
  } catch {
    logger.info("Skipping subscription renewals, a previous run is in progress")
    return
  }

  try {
    await renewDueSubscriptions(container, logger)
  } finally {
    await locking.release(JOB_LOCK_KEY)
  }
}

async function renewDueSubscriptions(
  container: MedusaContainer,
  logger: Logger
) {
  const subscriptionModule = container.resolve<ISubscriptionModuleService>(
    Modules.SUBSCRIPTION
  )
  const now = new Date()
  const dueSubscriptions = await subscriptionModule.listSubscriptions(
    { status: SubscriptionStatus.ACTIVE, next_billing_at: { $lte: now } },
    { select: ["id"], take: null }
  )

  for (const { id } of dueSubscriptions) {
    try {
      await renewSubscriptionWorkflow(container).run({ input: { id } })
    } catch (error) {
      // The subscription may have been canceled or renewed since it was
      // listed, in which case the renewal didn't fail.
      const [subscription] = await subscriptionModule.listSubscriptions({
        id,
        status: SubscriptionStatus.ACTIVE,
        next_billing_at: { $lte: now },
      })

      if (!subscription) {
        continue
      }

      const reason = error?.message ?? "Renewal failed"
      logger.warn(`Renewal of subscription ${id} failed: ${reason}`)

      await endSubscriptionWorkflow(container).run({
        input: {
          id,
          status: SubscriptionStatus.FAILED,
          failure_reason: reason,
        },
      })
    }
  }
}

export const config = {
  name: "renew-subscriptions",
  schedule: "0 * * * *",
}
