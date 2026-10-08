import { DeleteResponseWithParent, PaginatedResponse } from "../../common"
import {
  StoreCustomer,
  StoreCustomerAddress,
  StoreSubscription,
} from "./entities"

export interface StoreCustomerResponse {
  /**
   * The customer's details.
   */
  customer: StoreCustomer
}

export interface StoreCustomerAddressResponse {
  /**
   * The address's details.
   */
  address: StoreCustomerAddress
}

export interface StoreCustomerAddressListResponse
  extends PaginatedResponse<{ 
    /**
     * The paginated list of addresses.
     */
    addresses: StoreCustomerAddress[] 
  }> {}

export type StoreCustomerAddressDeleteResponse = DeleteResponseWithParent<
  "address",
  StoreCustomer
>

export interface StoreSubscriptionResponse {
  /**
   * The subscription's details.
   */
  subscription: StoreSubscription
}

export interface StoreSubscriptionListResponse
  extends PaginatedResponse<{
    /**
     * The paginated list of subscriptions.
     */
    subscriptions: StoreSubscription[]
  }> {}
