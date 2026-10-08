import {
  BaseCreateCustomer,
  BaseCreateCustomerAddress,
  BaseUpdateCustomer,
  BaseUpdateCustomerAddress,
} from "../common"

export interface AdminCreateCustomer extends BaseCreateCustomer {}
export interface AdminUpdateCustomer extends BaseUpdateCustomer {}

export interface AdminCreateCustomerAddress extends BaseCreateCustomerAddress {}
export interface AdminUpdateCustomerAddress extends BaseUpdateCustomerAddress {}

export interface AdminImportCustomersRequest {
  /**
   * The CSV file to import the customers from, with the columns
   * Email, First Name, Last Name, Company and Phone.
   *
   * It's an uploaded file of type [File](https://developer.mozilla.org/en-US/docs/Web/API/File).
   */
  file: File
}
