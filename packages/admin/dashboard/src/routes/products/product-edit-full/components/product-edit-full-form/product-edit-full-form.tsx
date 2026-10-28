import { HttpTypes } from "@medusajs/types"
import { Button, ProgressStatus, ProgressTabs, toast } from "@medusajs/ui"
import { useMemo, useState } from "react"
import { useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"

import {
  RouteFocusModal,
  useRouteModal,
} from "../../../../../components/modals"
import { KeyboundForm } from "../../../../../components/utilities/keybound-form"
import { useExtendableForm } from "../../../../../dashboard-app/forms/hooks"
import {
  productsQueryKeys,
  useBatchProductVariants,
  useLinkProductOptions,
  useProductVariantsInventoryItemsBatch,
  useUpdateProduct,
} from "../../../../../hooks/api/products"
import { useDocumentDirection } from "../../../../../hooks/use-document-direction"
import { sdk } from "../../../../../lib/client"
import { queryClient } from "../../../../../lib/query-client"
import { useExtension } from "../../../../../providers/extension-provider"
// The edit flow re-uses the create flow's schema and tab components so both
// flows stay visually identical and share one set of validations.
import { ProductCreateInventoryKitForm } from "../../../product-create/components/product-create-inventory-kit-form"
import { ProductCreateDetailsForm } from "../../../product-create/components/product-create-details-form"
import { ProductCreateOrganizeForm } from "../../../product-create/components/product-create-organize-form"
import { ProductCreateAttributeSection } from "../../../product-create/components/product-create-organize-form/components/product-create-organize-attribute-section"
import { ProductCreateVariantsForm } from "../../../product-create/components/product-create-variants-form"
import { ProductCreateSchema } from "../../../product-create/constants"
import { buildProductEditRequests, mapProductToFormValues } from "../../utils"

enum Tab {
  DETAILS = "details",
  ORGANIZE = "organize",
  VARIANTS = "variants",
  INVENTORY = "inventory",
}

type ProductEditFullFormProps = {
  product: HttpTypes.AdminProduct
  regions: HttpTypes.AdminRegion[]
  store: HttpTypes.AdminStore
  pricePreferences: HttpTypes.AdminPricePreference[]
}

export const ProductEditFullForm = ({
  product,
  regions,
  store,
  pricePreferences,
}: ProductEditFullFormProps) => {
  const [tab, setTab] = useState<Tab>(Tab.DETAILS)

  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()
  const { getFormConfigs } = useExtension()
  const direction = useDocumentDirection()

  // Pre-fill every field from the stored product (acceptance criterion 3).
  // `RouteFocusModal.Form` below watches this form's dirty state and shows the
  // "unsaved changes" prompt if the user tries to leave, so closing the modal
  // without saving never writes anything (criterion 6).
  const form = useExtendableForm({
    defaultValues: mapProductToFormValues(product),
    schema: ProductCreateSchema,
    configs: getFormConfigs("product", "create"),
  })

  // One mutation hook per kind of request the save may need to send.
  const batchVariants = useBatchProductVariants(product.id)
  const linkOptions = useLinkProductOptions(product.id)
  const updateInventoryItems = useProductVariantsInventoryItemsBatch(product.id)
  const updateProduct = useUpdateProduct(product.id)
  const isPending =
    batchVariants.isPending ||
    linkOptions.isPending ||
    updateInventoryItems.isPending ||
    updateProduct.isPending

  const regionsCurrencyMap = useMemo(
    () =>
      regions.reduce((acc, region) => {
        acc[region.id] = region.currency_code
        return acc
      }, {} as Record<string, string>),
    [regions]
  )

  // The inventory-kit tab only matters when at least one variant is a kit.
  const watchedVariants = useWatch({ control: form.control, name: "variants" })
  const showInventoryTab = useMemo(
    () => watchedVariants.some((v) => v.manage_inventory && v.inventory_kit),
    [watchedVariants]
  )

  const tabs = useMemo(
    () =>
      [
        Tab.DETAILS,
        Tab.ORGANIZE,
        Tab.VARIANTS,
        ...(showInventoryTab ? [Tab.INVENTORY] : []),
      ] as Tab[],
    [showInventoryTab]
  )
  const isLastTab = tab === tabs[tabs.length - 1]

  // Tabs before the current one are "completed", the current one is
  // "in-progress", the rest are "not-started".
  const getTabState = (value: Tab): ProgressStatus => {
    const current = tabs.indexOf(tab)
    const index = tabs.indexOf(value)

    if (index < current) {
      return "completed"
    }

    return index === current ? "in-progress" : "not-started"
  }

  /**
   * Save handler. Nothing is sent to the server until this runs (criterion 5).
   *
   * Saving is several requests because no single endpoint can update product
   * fields, options, variants, prices and inventory kits together. The order
   * (documented on `ProductEditRequests`) is dictated by backend rules: variants
   * that are being deleted go first, new options/values before the variants
   * that use them, and option values are only removed once nothing uses them.
   * The product's own fields go last. If a request fails we stop there instead
   * of carrying on in an inconsistent state.
   */
  const handleSubmit = form.handleSubmit(async (values) => {
    // Step 1: upload any newly added files. Entries that already have a URL
    // (existing images) have `file: null` and are left alone.
    const media = values.media ?? []
    const newFiles = media
      .map((m, index) => ({ file: m.file as File | null, index }))
      .filter((m) => !!m.file)

    let uploadedUrls: string[] = []

    if (newFiles.length) {
      try {
        const { files } = await sdk.admin.upload.create({
          files: newFiles.map((m) => m.file!),
        })
        uploadedUrls = files.map((f) => f.url)
      } catch (e) {
        // Unlike the create flow we stop here: carrying on would silently
        // drop the images the user just added.
        toast.error(t("products.media.failedToUpload"))
        return
      }
    }

    // Swap each new file's temporary preview URL for the uploaded URL.
    const resolvedMedia = media.map((m, index) => {
      const uploadIndex = newFiles.findIndex((f) => f.index === index)
      return uploadIndex > -1 ? { ...m, url: uploadedUrls[uploadIndex] } : m
    })

    // Step 2: work out what actually changed and build the payloads.
    const requests = buildProductEditRequests({
      values,
      product,
      media: resolvedMedia,
      regionsCurrencyMap,
    })

    try {
      // Step 3: delete variants the manager unchecked. Its own request, run
      // first: a batch runs create/update/delete in parallel, and the backend
      // refuses to unlink an option value while a variant still uses it.
      if (requests.variantDeletes) {
        await batchVariants.mutateAsync({ delete: requests.variantDeletes })
      }

      // Step 4: add new options and option values, so the variants created or
      // updated next can refer to them.
      if (requests.optionsAdd) {
        await linkOptions.mutateAsync(requests.optionsAdd)
      }

      // Step 5: create new variants and update changed ones (skipped if there
      // is nothing to do). Existing variants get their full options record
      // here when a new option was added.
      if (requests.variantsBatch) {
        await batchVariants.mutateAsync(requests.variantsBatch)
      }

      // Step 6: inventory kit links of existing variants (skipped if no kit
      // changed). New variants already carry their kit in step 5.
      if (requests.inventoryItems) {
        await updateInventoryItems.mutateAsync(requests.inventoryItems)
      }

      // Step 7: unlink option values nothing uses any more.
      if (requests.optionsRemove) {
        await linkOptions.mutateAsync(requests.optionsRemove)
      }

      // Step 8: the product itself, last.
      await updateProduct.mutateAsync(requests.product)
    } catch (e) {
      // Earlier requests may already have been saved, so refetch the product
      // to make sure the page reflects what is really stored, and keep the
      // modal open so the user can retry.
      await queryClient.invalidateQueries({
        queryKey: productsQueryKeys.detail(product.id),
      })

      toast.error(t("products.edit.full.errorToast"), {
        description: e instanceof Error ? e.message : undefined,
      })
      return
    }

    toast.success(
      t("products.edit.successToast", { title: values.title.trim() })
    )

    // No argument: close the modal and return to the product detail page.
    handleSuccess()
  })

  // Validate before moving on so errors surface on the tab where they occur.
  const onNext = async () => {
    if (!(await form.trigger())) {
      return
    }

    setTab(tabs[tabs.indexOf(tab) + 1])
  }

  return (
    <RouteFocusModal.Form form={form}>
      <KeyboundForm
        onKeyDown={(e) => {
          // Enter must not submit the form half-way through the flow.
          if (e.key !== "Enter") {
            return
          }

          if (
            e.target instanceof HTMLTextAreaElement &&
            !(e.metaKey || e.ctrlKey)
          ) {
            return
          }

          e.preventDefault()

          // Cmd/Ctrl+Enter advances, or saves on the last tab.
          if (e.metaKey || e.ctrlKey) {
            if (isLastTab) {
              handleSubmit()
            } else {
              e.stopPropagation()
              onNext()
            }
          }
        }}
        onSubmit={handleSubmit}
        className="flex h-full flex-col"
      >
        <ProgressTabs
          dir={direction}
          value={tab}
          onValueChange={async (next) => {
            if (await form.trigger()) {
              setTab(next as Tab)
            }
          }}
          className="flex h-full flex-col overflow-hidden"
        >
          <RouteFocusModal.Header>
            <div className="-my-2 w-full border-l">
              <ProgressTabs.List className="justify-start-start flex w-full items-center">
                {tabs.map((value) => (
                  <ProgressTabs.Trigger
                    key={value}
                    status={getTabState(value)}
                    value={value}
                    className="max-w-[200px] truncate"
                  >
                    {t(`products.create.tabs.${value}`)}
                  </ProgressTabs.Trigger>
                ))}
              </ProgressTabs.List>
            </div>
          </RouteFocusModal.Header>
          <RouteFocusModal.Body className="size-full overflow-hidden">
            <ProgressTabs.Content
              className="size-full overflow-y-auto"
              value={Tab.DETAILS}
            >
              {/* Same builder as the create flow, in "edit" mode: it merges
                  option/variant changes into the existing variants instead of
                  regenerating them (see ProductCreateVariantsSection). */}
              <ProductCreateDetailsForm form={form} mode="edit" />
            </ProgressTabs.Content>
            <ProgressTabs.Content
              className="size-full overflow-y-auto"
              value={Tab.ORGANIZE}
            >
              <ProductCreateOrganizeForm form={form} />
              {/* The create flow leaves attributes (dimensions, material,
                  origin, HS/MID codes) out. The edit flow needs them so a
                  manager can change shipping dimensions in the same session. */}
              <div className="flex flex-col items-center px-16 pb-16">
                <div className="w-full max-w-[720px]">
                  <ProductCreateAttributeSection form={form} />
                </div>
              </div>
            </ProgressTabs.Content>
            <ProgressTabs.Content
              className="size-full overflow-y-auto"
              value={Tab.VARIANTS}
            >
              <ProductCreateVariantsForm
                form={form}
                store={store}
                regions={regions}
                pricePreferences={pricePreferences}
              />
            </ProgressTabs.Content>
            {showInventoryTab && (
              <ProgressTabs.Content
                className="size-full overflow-y-auto"
                value={Tab.INVENTORY}
              >
                <ProductCreateInventoryKitForm form={form} />
              </ProgressTabs.Content>
            )}
          </RouteFocusModal.Body>
        </ProgressTabs>
        <RouteFocusModal.Footer>
          <div className="flex items-center justify-end gap-x-2">
            <RouteFocusModal.Close asChild>
              <Button variant="secondary" size="small">
                {t("actions.cancel")}
              </Button>
            </RouteFocusModal.Close>
            {isLastTab ? (
              <Button
                key="submit-button"
                type="submit"
                variant="primary"
                size="small"
                isLoading={isPending}
              >
                {t("actions.save")}
              </Button>
            ) : (
              <Button
                key="next-button"
                type="button"
                variant="primary"
                size="small"
                onClick={onNext}
              >
                {t("actions.continue")}
              </Button>
            )}
          </div>
        </RouteFocusModal.Footer>
      </KeyboundForm>
    </RouteFocusModal.Form>
  )
}
