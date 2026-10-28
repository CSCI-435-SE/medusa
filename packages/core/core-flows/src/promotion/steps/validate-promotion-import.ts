import type { IPromotionModuleService } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { StepResponse, createStep } from "@medusajs/framework/workflows-sdk"
import {
  parsePromotionImportCsv,
  validatePromotionImport,
} from "../helpers/import-promotions"

/**
 * The data to validate a promotion import.
 */
export type ValidatePromotionImportStepInput = {
  /**
   * The content of the CSV file to import.
   */
  file_content: string
}

export const validatePromotionImportStepId = "validate-promotion-import"
/**
 * This step parses a promotion import CSV and checks every row. It throws a
 * single error listing each failing row if any row is invalid, otherwise it
 * returns the promotions to create.
 *
 * A code counts as already existing when a promotion that hasn't been deleted
 * has it. A row's Campaign ID must match an existing campaign.
 */
export const validatePromotionImportStep = createStep(
  validatePromotionImportStepId,
  async (input: ValidatePromotionImportStepInput, { container }) => {
    const rows = parsePromotionImportCsv(input.file_content)
    const codes = [...new Set(rows.map((row) => row.code).filter(Boolean))]
    const campaignIds = [
      ...new Set(rows.map((row) => row.campaign_id).filter(Boolean)),
    ]

    const promotionModule = container.resolve<IPromotionModuleService>(
      Modules.PROMOTION
    )

    const [existingPromotions, campaigns] = await Promise.all([
      codes.length
        ? promotionModule.listPromotions({ code: codes }, { select: ["code"] })
        : [],
      campaignIds.length
        ? promotionModule.listCampaigns({ id: campaignIds }, { select: ["id"] })
        : [],
    ])

    const { promotions, errors } = validatePromotionImport(
      rows,
      existingPromotions.map((promotion) => promotion.code!),
      campaigns.map((campaign) => campaign.id)
    )

    if (errors.length) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, errors.join("\n"))
    }

    return new StepResponse(promotions)
  }
)
