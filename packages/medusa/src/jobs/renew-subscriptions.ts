import {
  endSubscriptionWorkflow,
  renewSubscriptionWorkflow,
} from "@medusajs/core-flows"
import {
  ISubscriptionModuleService,
  Logger,
  MedusaContainer,
} from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  SubscriptionStatus,
} from "@medusajs/framework/utils"

/**
 * Renews every active subscription whose next billing date has passed. A
 * subscription whose renewal fails is marked as failed and isn't retried.
 *
 * Overlapping runs are safe: the renewal workflow locks each subscription
 * and re-checks that it's still due, so it's never renewed twice.
 */
export default async function renewSubscriptionsJob(
  container: MedusaContainer
) {
  if (!container.hasRegistration(Modules.SUBSCRIPTION)) {
    return
  }

  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const subscriptionModule = container.resolve<ISubscriptionModuleService>(
    Modules.SUBSCRIPTION
  )

  const now = new Date()
  const dueSubscriptions = await subscriptionModule.listSubscriptions(
    { status: SubscriptionStatus.ACTIVE, next_billing_at: { $lte: now } },
    { select: ["id"], take: null }
  )

  for (const { id } of dueSubscriptions) {
    // Errors are caught per subscription so one can't stop the others
    try {
      await renewSubscription(container, logger, id, now)
    } catch (error) {
      logger.error(
        `Couldn't process the renewal of subscription ${id}: ${error?.message}`
      )
    }
  }
}

async function renewSubscription(
  container: MedusaContainer,
  logger: Logger,
  id: string,
  now: Date
) {
  try {
    await renewSubscriptionWorkflow(container).run({ input: { id } })
    return
  } catch (error) {
    // The subscription may have been canceled or renewed by another run since
    // it was listed, in which case the renewal didn't fail.
    const subscriptionModule = container.resolve<ISubscriptionModuleService>(
      Modules.SUBSCRIPTION
    )
    const [subscription] = await subscriptionModule.listSubscriptions({
      id,
      status: SubscriptionStatus.ACTIVE,
      next_billing_at: { $lte: now },
    })

    if (!subscription) {
      return
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

export const config = {
  name: "renew-subscriptions",
  schedule: "0 * * * *",
}
