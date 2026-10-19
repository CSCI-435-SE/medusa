import { DeleteResponseWithParent } from "../../common"
import { StoreOrder } from "../../order"
import { StoreProduct } from "../../product"
import { StoreCart } from "./entities"

export interface StoreCartResponse {
  /**
   * The cart's details.
   */
  cart: StoreCart
}

export interface StoreCartSuggestedProductResponse {
  /**
   * The product suggested for the cart: the best-selling eligible product, or
   * the first eligible product in the catalog if no best-seller is eligible.
   * It's `null` only if no product in the catalog is eligible.
   * Its variants are limited to those that can be added to the cart, and
   * include their calculated prices.
   */
  suggested_product: StoreProduct | null
}

export type StoreCompleteCartResponse =
  | {
      /**
       * The response's type. If `cart`, then an error has occurred.
       */
      type: "cart"
      /**
       * The cart's details.
       */
      cart: StoreCart
      /**
       * The error that occurred while completing the cart.
       */
      error: {
        /**
         * The error message.
         */
        message: string
        /**
         * The error name.
         */
        name: string
        /**
         * The error type.
         */
        type: string
      }
    }
  | {
      /**
       * The response's type. If `order`, then the cart
       * was completed and an order was placed.
       */
      type: "order"
      /**
       * The order's details.
       */
      order: StoreOrder
    }

export type StoreLineItemDeleteResponse = DeleteResponseWithParent<
  "line-item",
  StoreCart
>
