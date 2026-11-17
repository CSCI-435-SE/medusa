interface StoreCreateReturnItem {
  id: string
  quantity: number
  reason_id?: string | null
  note?: string | null
  /**
   * The ID of a component variant to return from a bundle item instead of the
   * whole bundle. The customer must be logged in and own the order.
   */
  component_variant_id?: string | null
}

interface StoreCreateReturnShipping {
  option_id: string
  price?: number
}

export interface StoreCreateReturn {
  order_id: string
  items: StoreCreateReturnItem[]
  return_shipping: StoreCreateReturnShipping
  note?: string | null
  receive_now?: boolean
  location_id?: string | null
}
