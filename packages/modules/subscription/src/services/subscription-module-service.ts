import {
  DAL,
  InternalModuleDeclaration,
  ISubscriptionModuleService,
  ModuleJoinerConfig,
  SubscriptionTypes,
} from "@medusajs/framework/types"
import { MedusaService } from "@medusajs/framework/utils"
import { Subscription } from "@models"
import { joinerConfig } from "../joiner-config"

type InjectedDependencies = {
  baseRepository: DAL.RepositoryService
}

export class SubscriptionModuleService
  extends MedusaService<{
    Subscription: { dto: SubscriptionTypes.SubscriptionDTO }
  }>({ Subscription })
  implements ISubscriptionModuleService
{
  protected baseRepository_: DAL.RepositoryService

  constructor(
    { baseRepository }: InjectedDependencies,
    protected readonly moduleDeclaration: InternalModuleDeclaration
  ) {
    // @ts-ignore
    super(...arguments)
    this.baseRepository_ = baseRepository
  }

  __joinerConfig(): ModuleJoinerConfig {
    return joinerConfig
  }
}
