import { HttpTypes, SelectParams } from "@medusajs/types"
import { Client } from "../client.js"
import { ClientHeaders } from "../types.js"

export class Bundle {
  /**
   * @ignore
   */
  private client: Client
  /**
   * @ignore
   */
  constructor(client: Client) {
    this.client = client
  }

  /**
   * This method creates a product bundle: a product with its own price that is
   * made of several component variants. It sends a request to the
   * `POST /admin/bundles` API route.
   *
   * @param body - The details of the bundle to create.
   * @param query - Configure the fields to retrieve in the bundle's product.
   * @param headers - Headers to pass in the request
   * @returns The bundle's product.
   *
   * @example
   * sdk.admin.bundle.create({
   *   title: "Camera kit",
   *   components: [
   *     { variant_id: "variant_camera", quantity: 1 },
   *     { variant_id: "variant_lens", quantity: 1 }
   *   ],
   *   prices: [{ currency_code: "usd", amount: 899 }]
   * })
   * .then(({ product }) => {
   *   console.log(product)
   * })
   */
  async create(
    body: HttpTypes.AdminCreateBundle,
    query?: SelectParams,
    headers?: ClientHeaders
  ) {
    return this.client.fetch<HttpTypes.AdminProductResponse>(`/admin/bundles`, {
      method: "POST",
      headers,
      body,
      query,
    })
  }

  /**
   * This method updates a bundle's product fields, components, quantities and
   * prices. It sends a request to the `POST /admin/bundles/:id` API route.
   *
   * @param id - The bundle product's ID.
   * @param body - The data to update in the bundle.
   * @param query - Configure the fields to retrieve in the bundle's product.
   * @param headers - Headers to pass in the request
   * @returns The bundle's product.
   *
   * @example
   * sdk.admin.bundle.update("prod_123", {
   *   prices: [{ currency_code: "usd", amount: 799 }]
   * })
   * .then(({ product }) => {
   *   console.log(product)
   * })
   */
  async update(
    id: string,
    body: HttpTypes.AdminUpdateBundle,
    query?: SelectParams,
    headers?: ClientHeaders
  ) {
    return this.client.fetch<HttpTypes.AdminProductResponse>(
      `/admin/bundles/${id}`,
      {
        method: "POST",
        headers,
        body,
        query,
      }
    )
  }
}
