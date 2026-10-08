import { Module, Modules } from "@medusajs/framework/utils"
import { SubscriptionModuleService } from "@services"

export default Module(Modules.SUBSCRIPTION, {
  service: SubscriptionModuleService,
})
