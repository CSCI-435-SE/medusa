import { toast } from "@medusajs/ui"

import { BundleUsageList } from "./bundle-usage-list"
import { ResolveBundleUsageInput, resolveBundleUsage } from "./bundle-usage"

/**
 * How long the blocked-delete toast stays up. It holds links the admin is
 * meant to follow, so it outlasts a normal error toast.
 */
const USAGE_TOAST_DURATION = 30000

/**
 * Shows a failed delete. When bundles blocked it, they are listed with a link
 * to each (AC 7); otherwise the given fallback is shown.
 *
 * @returns whether the failure was a bundle conflict
 */
export const showDeleteError = async (
  input: ResolveBundleUsageInput & {
    header: string
    fallback: { header: string; description?: string }
  }
): Promise<boolean> => {
  const bundles = await resolveBundleUsage(input)

  if (!bundles?.length) {
    toast.error(input.fallback.header, {
      description: input.fallback.description,
    })
    return false
  }

  toast.error(input.header, {
    description: <BundleUsageList bundles={bundles} />,
    duration: USAGE_TOAST_DURATION,
  })

  return true
}
