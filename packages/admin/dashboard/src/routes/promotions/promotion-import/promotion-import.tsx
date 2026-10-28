import { Trash } from "@medusajs/icons"
import { Button, Heading, Hint, Text, toast } from "@medusajs/ui"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { FilePreview } from "../../../components/common/file-preview"
import {
  FileType,
  FileUpload,
  RejectedFile,
} from "../../../components/common/file-upload"
import { RouteDrawer, useRouteModal } from "../../../components/modals"
import { useImportPromotions } from "../../../hooks/api/promotions"
import { formatFileSize } from "../../../lib/format-file-size"
import { getPromotionImportCsvTemplate } from "./helpers/import-template"

const SUPPORTED_FORMATS = ["text/csv", "application/vnd.ms-excel"]

export const PromotionImport = () => {
  const { t } = useTranslation()

  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <RouteDrawer.Title asChild>
          <Heading>{t("promotions.import.header")}</Heading>
        </RouteDrawer.Title>
        <RouteDrawer.Description className="sr-only">
          {t("promotions.import.description")}
        </RouteDrawer.Description>
      </RouteDrawer.Header>
      <PromotionImportContent />
    </RouteDrawer>
  )
}

const PromotionImportContent = () => {
  const { t } = useTranslation()
  const [file, setFile] = useState<File>()
  const [fileError, setFileError] = useState<string>()
  const [rowErrors, setRowErrors] = useState<string[]>([])

  const { mutateAsync: importPromotions, isPending } = useImportPromotions()
  const { handleSuccess } = useRouteModal()

  const templateContent = useMemo(() => {
    return getPromotionImportCsvTemplate()
  }, [])

  const handleUploaded = (
    files: FileType[],
    rejectedFiles?: RejectedFile[]
  ) => {
    setRowErrors([])

    if (rejectedFiles?.length) {
      setFile(undefined)
      setFileError(
        t("promotions.import.fileTooLarge", {
          size: formatFileSize(__MAX_UPLOAD_FILE_SIZE__ ?? 1024 * 1024),
        })
      )
      return
    }

    setFileError(undefined)
    setFile(files[0]?.file)
  }

  const handleImport = async () => {
    if (!file) {
      return
    }

    setRowErrors([])

    await importPromotions(
      { file },
      {
        onSuccess: ({ created }) => {
          toast.success(t("promotions.import.successToast", { count: created }))
          handleSuccess()
        },
        onError: (err) => {
          // The API returns one line per failing row.
          setRowErrors(err.message.split("\n"))
        },
      }
    ).catch(() => {
      // Already handled in onError.
    })
  }

  const uploadedFileActions = [
    {
      actions: [
        {
          label: t("actions.delete"),
          icon: <Trash />,
          onClick: () => {
            setFile(undefined)
            setRowErrors([])
          },
        },
      ],
    },
  ]

  return (
    <>
      <RouteDrawer.Body>
        <Heading level="h2">{t("promotions.import.upload.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("promotions.import.upload.description")}
        </Text>

        <div className="mt-4">
          {file ? (
            <FilePreview
              filename={file.name}
              loading={isPending}
              activity={t("promotions.import.upload.importing")}
              actions={uploadedFileActions}
            />
          ) : (
            <div className="flex flex-col gap-y-4">
              <FileUpload
                label={t("promotions.import.uploadLabel")}
                hint={t("promotions.import.uploadHint")}
                multiple={false}
                hasError={!!fileError}
                formats={SUPPORTED_FORMATS}
                onUploaded={handleUploaded}
              />
              {fileError && (
                <div>
                  <Hint variant="error">{fileError}</Hint>
                </div>
              )}
            </div>
          )}
        </div>

        {rowErrors.length > 0 && (
          <div className="mt-4 flex flex-col gap-y-2">
            <Text size="small" weight="plus" className="text-ui-fg-error">
              {t("promotions.import.rowErrors")}
            </Text>
            <ul className="text-ui-fg-error list-disc pl-5">
              {rowErrors.map((error, index) => (
                <li key={index}>
                  <Text size="small">{error}</Text>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Heading className="mt-6" level="h2">
          {t("promotions.import.template.title")}
        </Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("promotions.import.template.description")}
        </Text>
        <div className="mt-4">
          <FilePreview
            filename={"promotion-import-template.csv"}
            url={templateContent}
          />
        </div>
      </RouteDrawer.Body>
      <RouteDrawer.Footer>
        <div className="flex items-center gap-x-2">
          <RouteDrawer.Close asChild>
            <Button size="small" variant="secondary">
              {t("actions.cancel")}
            </Button>
          </RouteDrawer.Close>
          <Button
            onClick={handleImport}
            size="small"
            disabled={!file}
            isLoading={isPending}
          >
            {t("actions.import")}
          </Button>
        </div>
      </RouteDrawer.Footer>
    </>
  )
}
