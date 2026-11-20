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
import { useCreateBundle } from "../../../../../hooks/api/bundles"
import { sdk } from "../../../../../lib/client"
import { zodFormResolver } from "../../../../../lib/zod-form-resolver"
import { normalizeBundleFormValues } from "../../../common/bundles"
import { BundleFormFields } from "../../../common/components/bundle-form-fields"
import {
  BUNDLE_CREATE_FORM_DEFAULTS,
  BundleSchema,
  BundleSchemaType,
} from "../../constants"

const SAVE_DRAFT_BUTTON = "save-draft-button"

type BundleCreateFormProps = {
  store: HttpTypes.AdminStore
  regions: HttpTypes.AdminRegion[]
  defaultChannel?: HttpTypes.AdminSalesChannel
}

/**
 * Creates a bundle through `POST /admin/bundles` (issue #114, AC 1).
 *
 * The form is one page rather than the product form's wizard: a bundle has no
 * options or variants to build up, so there is nothing to step through.
 */
export const BundleCreateForm = ({
  store,
  regions,
  defaultChannel,
}: BundleCreateFormProps) => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()

  /**
   * The message from a rejected save, shown above the form. Keeping it in state
   * rather than in a toast means the admin can read it next to the fields they
   * filled in, which are left as they were typed (AC 4).
   */
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<BundleSchemaType>({
    defaultValues: {
      ...BUNDLE_CREATE_FORM_DEFAULTS,
      sales_channels: defaultChannel
        ? [{ id: defaultChannel.id, name: defaultChannel.name }]
        : [],
    } as BundleSchemaType,
    resolver: zodFormResolver<BundleSchemaType>(BundleSchema),
  })

  const { mutateAsync, isPending } = useCreateBundle()

  const regionsCurrencyMap = useMemo(
    () =>
      (regions ?? []).reduce((acc, region) => {
        acc[region.id] = region.currency_code
        return acc
      }, {} as Record<string, string>),
    [regions]
  )

  const handleSubmit = form.handleSubmit(async (values, event) => {
    let isDraft = false
    if (event?.nativeEvent instanceof SubmitEvent) {
      const submitter = event.nativeEvent.submitter as HTMLButtonElement | null
      isDraft = submitter?.dataset.name === SAVE_DRAFT_BUTTON
    }

    setServerError(null)

    const media = values.media || []
    let uploaded: { url: string; isThumbnail: boolean }[] = []

    try {
      if (media.length) {
        const thumbnail = media.find((m) => m.isThumbnail)
        const others = media.filter((m) => !m.isThumbnail)

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
              .create({ files: others.map((m) => m.file) })
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
      media: uploaded as BundleSchemaType["media"],
      status: (isDraft ? "draft" : "published") as HttpTypes.AdminProductStatus,
      regionsCurrencyMap,
    })

    try {
      const { product } = await mutateAsync(payload)

      toast.success(
        t("products.bundles.createSuccessToast", { title: product.title })
      )

      handleSuccess(`/products/${product.id}`)
    } catch (error) {
      // The workflow rejects a bundle the form cannot check on its own: a
      // component that is itself a bundle, one that does not track inventory,
      // a variant that no longer exists (AC 4).
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
            header={t("products.bundles.createHeader")}
            hint={t("products.bundles.createHint")}
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
              data-name={SAVE_DRAFT_BUTTON}
              size="small"
              type="submit"
              isLoading={isPending}
              className="whitespace-nowrap"
            >
              {t("actions.saveAsDraft")}
            </Button>
            <Button
              data-name="publish-button"
              size="small"
              type="submit"
              variant="primary"
              isLoading={isPending}
            >
              {t("actions.publish")}
            </Button>
          </div>
        </RouteFocusModal.Footer>
      </KeyboundForm>
    </RouteFocusModal.Form>
  )
}
