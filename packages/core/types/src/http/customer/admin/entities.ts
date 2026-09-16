import { AdminCustomerGroup } from "../../customer-group"
import { BaseCustomer, BaseCustomerAddress } from "../common"

export interface AdminCustomer extends BaseCustomer {
  /**
   * Whether the customer is a guest.
   */
  has_account: boolean
  /**
   * The groups the customer is in.
   */
  groups?: AdminCustomerGroup[]
  /**
   * The customer's addresses.
   */
  addresses: AdminCustomerAddress[]
  /**
   * The number of orders placed by the customer.
   */
  order_count?: number
  /**
   * The total amount spent by the customer across all orders.
   */
  lifetime_value?: number
}
export interface AdminCustomerAddress extends BaseCustomerAddress {}
