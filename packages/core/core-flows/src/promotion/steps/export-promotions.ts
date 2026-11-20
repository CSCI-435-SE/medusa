import {
  FilterablePromotionProps,
  IFileModuleService,
  PromotionDTO,
} from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  deduplicate,
} from "@medusajs/framework/utils"
import { StepResponse, createStep } from "@medusajs/framework/workflows-sdk"
import { json2csv } from "json-2-csv"
import {
  EXPORT_COLUMNS,
  normalizePromotionForExport,
} from "../helpers/export-promotions"

/**
 * The data to export promotions.
 */
export type ExportPromotionsStepInput = {
  /**
   * The number of promotions to retrieve per batch.
   */
  batch_size?: number | string
  /**
   * The fields to select.
   */
  select: string[]
  /**
   * The filters to select which promotions to export.
   */
  filter?: FilterablePromotionProps
}

/**
 * The details of the exported file.
 */
export type ExportPromotionsStepOutput = {
  /**
   * The ID of the file.
   */
  id: string
  /**
   * The name of the file.
   */
  filename: string
}

export const exportPromotionsStepId = "export-promotions"

// Everything a row of the import template is built from. The application
// method and the three rule lists are nested, so they have to be asked for
// explicitly or the row comes back half empty.
const EXPORT_FIELDS = [
  "id",
  "code",
  "type",
  "status",
  "is_automatic",
  "is_tax_inclusive",
  "limit",
  "campaign_id",
  "application_method.type",
  "application_method.value",
  "application_method.target_type",
  "application_method.allocation",
  "application_method.currency_code",
  "application_method.max_quantity",
  "application_method.buy_rules_min_quantity",
  "application_method.apply_to_quantity",
  "application_method.target_rules.attribute",
  "application_method.target_rules.operator",
  "application_method.target_rules.values.value",
  "application_method.buy_rules.attribute",
  "application_method.buy_rules.operator",
  "application_method.buy_rules.values.value",
  "rules.attribute",
  "rules.operator",
  "rules.values.value",
]

/**
 * This step exports the promotions matching the filters to a CSV file in the
 * promotion import's format and uploads it with the File Module. It retrieves
 * the promotions in batches, so any pagination in the filters is ignored. The
 * file always has a header row, even when no promotions match.
 */
export const exportPromotionsStep = createStep(
  exportPromotionsStepId,
  async (input: ExportPromotionsStepInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const fileModule = container.resolve(Modules.FILE)

    const filename = `${Date.now()}-promotion-exports.csv`
    const { writeStream, promise, fileKey } = await fileModule.getUploadStream({
      filename,
      mimeType: "text/csv",
    })

    const pageSize = !isNaN(parseInt(input?.batch_size as string))
      ? parseInt(input?.batch_size as string, 10)
      : 50

    let lastId: string | undefined
    let hasHeader = false

    const fields = deduplicate([...input.select, ...EXPORT_FIELDS])

    const filter = input.filter ?? {}

    while (true) {
      // Page with an id cursor instead of an offset, so promotions sharing a
      // created_at, or added and deleted during the export, aren't skipped or
      // repeated. The cursor goes in $and so it can't replace an id filter.
      const { data: promotions } = await query.graph({
        entity: "promotion",
        filters: lastId
          ? {
              ...filter,
              $and: [...(filter.$and ?? []), { id: { $gt: lastId } }],
            }
          : filter,
        pagination: {
          take: pageSize,
          order: { id: "ASC" },
        },
        fields,
      })

      if (promotions.length === 0) {
        break
      }

      const batchCsv = json2csv(
        promotions.map((promotion) =>
          normalizePromotionForExport(promotion as PromotionDTO)
        ),
        {
          keys: EXPORT_COLUMNS,
          prependHeader: !hasHeader,
          preventCsvInjection: true,
          emptyFieldValue: "",
        }
      )

      const ok = writeStream.write((hasHeader ? "\n" : "") + batchCsv)
      if (!ok) {
        await new Promise((resolve) => writeStream.once("drain", resolve))
      }

      hasHeader = true
      lastId = promotions[promotions.length - 1].id

      if (promotions.length < pageSize) {
        break
      }
    }

    if (!hasHeader) {
      writeStream.write(EXPORT_COLUMNS.join(","))
    }

    writeStream.end()

    await promise

    return new StepResponse(
      { id: fileKey, filename } as ExportPromotionsStepOutput,
      fileKey
    )
  },
  async (fileId, { container }) => {
    if (!fileId) {
      return
    }

    const fileModule: IFileModuleService = container.resolve(Modules.FILE)
    await fileModule.deleteFiles(fileId)
  }
)
