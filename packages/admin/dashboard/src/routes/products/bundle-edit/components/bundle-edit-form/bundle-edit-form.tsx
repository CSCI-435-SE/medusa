import { AdminFile, HttpTypes } from "@medusajs/types"
import { Button, toast } from "@medusajs/ui"
import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

import {
  RouteFocusModal,
  useRouteModal,
} from "../../../../../components/modals"
import { KeyboundForm } from "../../../../../components/utilities/keybound-form"
import { useUpdateBundle } from "../../../../../hooks/api/bundles"
import { sdk } from "../../../../../lib/client"
import { zodFormResolver } from "../../../../../lib/zod-form-resolver"
import {
  mapBundleToFormValues,
  normalizeBundleFormValues,
} from "../../../common/bundles"
import { BundleFormFields } from "../../../common/components/bundle-form-fields"
import {
  BundleSchema,
  BundleSchemaType,
} from "../../../bundle-create/constants"

type BundleEditFormProps = {
  product: HttpTypes.AdminProduct
  store: HttpTypes.AdminStore
  regions: HttpTypes.AdminRegion[]
}

/**
 * Edits a bundle's product fields, components, quantities and price through
 * `POST /admin/bundles/:id` (issue #114, AC 2).
 *
 * It is the create form with the values filled in, which keeps one set of
 * fields and one set of rules for both.
 */
export const BundleEditForm = ({
  product,
  store,
  regions,
}: BundleEditFormProps) => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()

  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<BundleSchemaType>({
    defaultValues: mapBundleToFormValues(product) as BundleSchemaType,
    resolver: zodFormResolver<BundleSchemaType>(BundleSchema),
  })

  const { mutateAsync, isPending } = useUpdateBundle(product.id)

  const regionsCurrencyMap = useMemo(
    () =>
      (regions ?? []).reduce((acc, region) => {
        acc[region.id] = region.currency_code
        return acc
      }, {} as Record<string, string>),
    [regions]
  )

  const handleSubmit = form.handleSubmit(async (values) => {
    setServerError(null)

    // Images already on the product come back with `file: null`; only the ones
    // the admin just added carry a File and have to be uploaded first.
    const media = values.media || []
    const existing = media.filter((item) => !item.file)
    const added = media.filter((item) => item.file)

    let uploaded: { url: string; isThumbnail: boolean }[] = []

    try {
      if (added.length) {
        const thumbnail = added.find((item) => item.isThumbnail)
        const others = added.filter((item) => !item.isThumbnail)

        const requests: Promise<(AdminFile & { isThumbnail: boolean })[]>[] = []

        if (thumbnail) {
          requests.push(
            sdk.admin.upload
              .create({ files: [thumbnail.file] })
              .then((r) => r.files.map((f) => ({ ...f, isThumbnail: true })))
          )
        }

        if (others.length) {
          requests.push(
            sdk.admin.upload
              .create({ files: others.map((item) => item.file) })
              .then((r) => r.files.map((f) => ({ ...f, isThumbnail: false })))
          )
        }

        uploaded = (await Promise.all(requests)).flat()
      }
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message)
      }
      return
    }

    const payload = normalizeBundleFormValues({
      ...values,
      media: [
        ...existing.map((item) => ({
          url: item.url,
          isThumbnail: item.isThumbnail,
          file: null,
        })),
        ...uploaded,
      ] as BundleSchemaType["media"],
      // Editing a bundle does not publish or unpublish it.
      status: product.status,
      regionsCurrencyMap,
    })

    try {
      // The create and update bodies differ only in which fields are optional;
      // the form always produces a handle, which is the one field the update
      // type declares more narrowly.
      await mutateAsync(payload as HttpTypes.AdminUpdateBundle)

      toast.success(
        t("products.bundles.editSuccessToast", { title: payload.title })
      )

      handleSuccess(`/products/${product.id}`)
    } catch (error) {
      setServerError(
        error instanceof Error ? error.message : String(error ?? "")
      )
    }
  })

  return (
    <RouteFocusModal.Form form={form}>
      <KeyboundForm onSubmit={handleSubmit} className="flex h-full flex-col">
        <RouteFocusModal.Header />
        <RouteFocusModal.Body className="size-full overflow-y-auto">
          <BundleFormFields
            form={form}
            currencies={store.supported_currencies}
            header={t("products.bundles.editHeader")}
            hint={t("products.bundles.editHint")}
            serverError={serverError}
          />
        </RouteFocusModal.Body>
        <RouteFocusModal.Footer>
          <div className="flex items-center justify-end gap-x-2">
            <RouteFocusModal.Close asChild>
              <Button variant="secondary" size="small">
                {t("actions.cancel")}
              </Button>
            </RouteFocusModal.Close>
            <Button
              size="small"
              type="submit"
              variant="primary"
              isLoading={isPending}
            >
              {t("actions.save")}
            </Button>
          </div>
        </RouteFocusModal.Footer>
      </KeyboundForm>
    </RouteFocusModal.Form>
  )
}
