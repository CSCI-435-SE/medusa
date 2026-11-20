import { sdk } from "../../../../../lib/client"
import { findBundlesUsingVariants, isBundleUsageError } from "../../bundles"

/*
 * Deleting a product or variant that a bundle uses is blocked by the delete
 * workflows (issue #112, AC 11). The dashboard turns that into the list of
 * bundles, each with a link, instead of showing the message as it is
 * (issue #114, AC 7).
 *
 * The error carries a code, not the list, because the HTTP error handler only
 * passes `code`, `type` and `message` through. So the code says this is a
 * bundle conflict, and the bundles are looked up here to get an ID to link to.
 * The lookup only runs when a delete was refused.
 */

/** How many products one lookup page reads. */
const PAGE_SIZE = 200

/** The most pages to read before giving up on a large catalog. */
const MAX_PAGES = 10

type BundleUsageClient = {
  listProducts: (query: {
    fields: string
    limit: number
    offset: number
  }) => Promise<{
    products: {
      id: string
      title?: string | null
      metadata?: Record<string, unknown> | null
    }[]
  }>
  listVariants: (productId: string) => Promise<{ variants: { id: string }[] }>
}

/**
 * The real client. It is passed in so the resolver can be tested without the
 * SDK.
 */
export const bundleUsageClient: BundleUsageClient = {
  listProducts: (query) => sdk.admin.product.list(query as any) as any,
  listVariants: (productId) =>
    sdk.admin.product.listVariants(productId, {
      fields: "id",
      limit: 1000,
    }) as any,
}

export type ResolveBundleUsageInput = {
  /** The error the delete failed with. */
  error?: { code?: string } | null
  /** The product being deleted, when a whole product was deleted. */
  productId?: string
  /** The variants being deleted, when they are already known. */
  variantIds?: string[]
  client?: BundleUsageClient
}

/**
 * Returns the bundles that blocked a delete, or `null` when the failure was
 * something else and the caller should show its own message.
 *
 * Bundles keep their components in product metadata, which cannot be searched
 * by variant ID, so the products are read in pages and matched in memory. This
 * is the same approach `validateNoBundleUsageStep` takes on the server.
 */
export const resolveBundleUsage = async ({
  error,
  productId,
  variantIds,
  client = bundleUsageClient,
}: ResolveBundleUsageInput): Promise<
  { id: string; title?: string | null }[] | null
> => {
  if (!isBundleUsageError(error)) {
    return null
  }

  try {
    let ids = variantIds ?? []

    if (!ids.length && productId) {
      ids = (await client.listVariants(productId)).variants.map((v) => v.id)
    }

    if (!ids.length) {
      return null
    }

    const found: { id: string; title?: string | null }[] = []

    for (let page = 0; page < MAX_PAGES; page++) {
      const { products } = await client.listProducts({
        fields: "id,title,metadata",
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })

      found.push(
        ...findBundlesUsingVariants(products, ids, productId ? [productId] : [])
      )

      if (products.length < PAGE_SIZE) {
        break
      }
    }

    return found
  } catch {
    // The delete already failed; failing the lookup too should not replace the
    // admin's error with a crash. The caller falls back to the message.
    return null
  }
}
