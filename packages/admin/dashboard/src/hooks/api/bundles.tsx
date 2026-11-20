import { FetchError } from "@medusajs/js-sdk"
import { HttpTypes } from "@medusajs/types"
import { useMutation, UseMutationOptions } from "@tanstack/react-query"

import { sdk } from "../../lib/client"
import { queryClient } from "../../lib/query-client"
import { productsQueryKeys, variantsQueryKeys } from "./products"

/*
 * A bundle is a product, so there is no separate bundle list or detail query:
 * the product hooks already read one (issue #114). Only the two writes need
 * their own route, because `POST /admin/bundles` takes components and prices
 * that the product routes don't accept.
 */

export const useCreateBundle = (
  options?: UseMutationOptions<
    HttpTypes.AdminProductResponse,
    FetchError,
    HttpTypes.AdminCreateBundle
  >
) => {
  return useMutation({
    mutationFn: (payload: HttpTypes.AdminCreateBundle) =>
      sdk.admin.bundle.create(payload),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: productsQueryKeys.lists() })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useUpdateBundle = (
  id: string,
  options?: UseMutationOptions<
    HttpTypes.AdminProductResponse,
    FetchError,
    HttpTypes.AdminUpdateBundle
  >
) => {
  return useMutation({
    mutationFn: (payload: HttpTypes.AdminUpdateBundle) =>
      sdk.admin.bundle.update(id, payload),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: productsQueryKeys.lists() })
      queryClient.invalidateQueries({
        queryKey: productsQueryKeys.detail(id),
      })
      // The bundle's one variant holds the prices and the inventory links.
      queryClient.invalidateQueries({ queryKey: variantsQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
