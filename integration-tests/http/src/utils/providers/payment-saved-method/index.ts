import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import { SavedMethodPaymentProvider } from "./provider"

const services = [SavedMethodPaymentProvider]

export default ModuleProvider(Modules.PAYMENT, {
  services,
})
