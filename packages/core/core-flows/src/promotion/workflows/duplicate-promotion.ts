import {
  AdditionalData,
  CreatePromotionDTO,
  CreatePromotionRuleDTO,
} from "@medusajs/framework/types"
import { MedusaError, PromotionStatus } from "@medusajs/framework/utils"
import {
  WorkflowData,
  WorkflowResponse,
  createStep,
  createWorkflow,
  transform,
} from "@medusajs/framework/workflows-sdk"
import { useQueryGraphStep } from "../../common"
import { createPromotionsWorkflow } from "./create-promotions"

/**
 * The fields read from the original promotion, including its rules and their
 * values.
 */
const DUPLICATE_PROMOTION_FIELDS = [
  "id",
  "type",
  "is_automatic",
  "is_tax_inclusive",
  "limit",
  "metadata",
  "rules.description",
  "rules.attribute",
  "rules.operator",
  "rules.values.value",
  "application_method.type",
  "application_method.target_type",
  "application_method.allocation",
  "application_method.value",
  "application_method.currency_code",
  "application_method.max_quantity",
  "application_method.apply_to_quantity",
  "application_method.buy_rules_min_quantity",
  "application_method.target_rules.description",
  "application_method.target_rules.attribute",
  "application_method.target_rules.operator",
  "application_method.target_rules.values.value",
  "application_method.buy_rules.description",
  "application_method.buy_rules.attribute",
  "application_method.buy_rules.operator",
  "application_method.buy_rules.values.value",
]

/**
 * The data to duplicate a promotion, along with custom data that's passed to
 * the hooks of the underlying create workflow.
 */
export type DuplicatePromotionWorkflowInput = {
  /**
   * The ID of the promotion to duplicate.
   */
  id: string
  /**
   * The code of the new promotion. It must not be used by another promotion.
   */
  code: string
} & AdditionalData

/**
 * The data to validate before duplicating a promotion.
 */
export interface ValidateDuplicatePromotionStepInput {
  /**
   * The promotions matching the requested ID (empty if it does not exist).
   */
  source: { id: string }[]
  /**
   * The promotions already using the requested code.
   */
  codeConflicts: { id: string }[]
  /**
   * The requested code for the copy.
   */
  code: string
}

export const validateDuplicatePromotionStepId = "validate-duplicate-promotion"
/**
 * This step validates a duplicate request. It throws if the original promotion
 * is missing or if the code is already used by another promotion, before
 * anything is created.
 */
export const validateDuplicatePromotionStep = createStep(
  validateDuplicatePromotionStepId,
  async (data: ValidateDuplicatePromotionStepInput) => {
    if (!data.source[0]) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Promotion to duplicate was not found"
      )
    }

    // Same message as the create API gives for a code that's taken.
    if (data.codeConflicts.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Promotion with code: ${data.code}, already exists.`
      )
    }
  }
)

/**
 * Copies rules as new rules, so the copy doesn't share rule rows with the
 * original.
 */
const copyRules = (rules?: Record<string, any>[]): CreatePromotionRuleDTO[] =>
  (rules ?? []).map((rule) => ({
    description: rule.description,
    attribute: rule.attribute,
    operator: rule.operator,
    values: rule.values.map((value: { value: string }) => value.value),
  }))

/**
 * Maps a loaded promotion to the input of `createPromotionsWorkflow`. The copy
 * always starts as a draft with no usage, and it isn't added to the original's
 * campaign.
 */
export const buildDuplicatePromotionInput = (
  source: Record<string, any>,
  code: string
): CreatePromotionDTO => {
  const method = source.application_method

  return {
    code,
    type: source.type,
    status: PromotionStatus.DRAFT,
    is_automatic: source.is_automatic,
    is_tax_inclusive: source.is_tax_inclusive,
    limit: source.limit,
    metadata: source.metadata,
    rules: copyRules(source.rules),
    application_method: {
      type: method.type,
      target_type: method.target_type,
      allocation: method.allocation,
      value: method.value,
      currency_code: method.currency_code,
      max_quantity: method.max_quantity,
      apply_to_quantity: method.apply_to_quantity,
      buy_rules_min_quantity: method.buy_rules_min_quantity,
      target_rules: copyRules(method.target_rules),
      buy_rules: copyRules(method.buy_rules),
    },
  }
}

export const duplicatePromotionWorkflowId = "duplicate-promotion"
/**
 * This workflow duplicates a promotion, including its conditions, target rules
 * and buy rules. It's used by the Duplicate Promotion Admin API Route.
 *
 * The copy always starts as a draft with a usage count of 0, its rules are new
 * rules rather than shared with the original, and it isn't added to the
 * original's campaign.
 *
 * @example
 * const { result } = await duplicatePromotionWorkflow(container)
 * .run({
 *   input: {
 *     id: "promo_123",
 *     code: "FALL20",
 *   }
 * })
 *
 * @summary
 *
 * Duplicate a promotion with its rules.
 */
export const duplicatePromotionWorkflow = createWorkflow(
  duplicatePromotionWorkflowId,
  (input: WorkflowData<DuplicatePromotionWorkflowInput>) => {
    const { data: source } = useQueryGraphStep({
      entity: "promotion",
      fields: DUPLICATE_PROMOTION_FIELDS,
      filters: { id: input.id },
    }).config({ name: "get-promotion-to-duplicate" })

    const { data: codeConflicts } = useQueryGraphStep({
      entity: "promotion",
      fields: ["id"],
      filters: { code: input.code },
    }).config({ name: "get-promotions-with-code" })

    validateDuplicatePromotionStep({
      source,
      codeConflicts,
      code: input.code,
    })

    const promotionsData = transform({ source, input }, (data) => [
      buildDuplicatePromotionInput(data.source[0], data.input.code),
    ])

    const created = createPromotionsWorkflow.runAsStep({
      input: {
        promotionsData,
        additional_data: input.additional_data,
      },
    })

    return new WorkflowResponse(created)
  }
)
