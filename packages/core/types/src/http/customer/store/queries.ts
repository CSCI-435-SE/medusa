import { BaseCustomerAddressFilters, BaseCustomerFilters } from "../common"
import { FindParams, SelectParams } from "../../common"
import { StoreSubscriptionStatus } from "./entities"

export interface StoreCustomerFilters extends BaseCustomerFilters {}
export interface StoreCustomerAddressFilters
  extends Omit<BaseCustomerAddressFilters, "company" | "province">,
    FindParams {}

export interface StoreGetCustomerParams extends SelectParams {}

export interface StoreGetCustomerAddressParams extends SelectParams {}

export interface StoreGetSubscriptionParams extends SelectParams {}

export interface StoreGetSubscriptionsParams extends FindParams {
  /**
   * Filter by the subscriptions' status.
   */
  status?: StoreSubscriptionStatus | StoreSubscriptionStatus[]
}
