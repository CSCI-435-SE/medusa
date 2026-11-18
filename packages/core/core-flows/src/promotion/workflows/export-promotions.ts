import { FilterablePromotionProps } from "@medusajs/framework/types"
import {
  WorkflowData,
  createWorkflow,
  transform,
} from "@medusajs/framework/workflows-sdk"
import { useRemoteQueryStep } from "../../common"
import { notifyOnFailureStep, sendNotificationsStep } from "../../notification"
import { exportPromotionsStep } from "../steps/export-promotions"

/**
 * The data to export promotions.
 */
export type ExportPromotionsWorkflowInput = {
  /**
   * The fields to select. These fields will be passed to
   * [Query](https://docs.medusajs.com/learn/fundamentals/module-links/query).
   */
  select: string[]
  /**
   * The filters to select which promotions to export.
   */
  filter?: FilterablePromotionProps
}

export const exportPromotionsWorkflowId = "export-promotions"
/**
 * This workflow exports promotions matching the specified filters to a CSV
 * file in the promotion import's format. It runs in the background.
 *
 * :::note
 *
 * This workflow doesn't return the exported promotions. Instead, it sends a notification to the admin
 * users that they can download the exported promotions.
 *
 * :::
 *
 * @example
 * To export all promotions:
 *
 * ```ts
 * const { transaction } = await exportPromotionsWorkflow(container)
 * .run({
 *   input: {
 *     select: ["*"],
 *   }
 * })
 * ```
 *
 * To export promotions matching a criteria:
 *
 * ```ts
 * const { transaction } = await exportPromotionsWorkflow(container)
 * .run({
 *   input: {
 *     select: ["*"],
 *     filter: {
 *       status: "active"
 *     }
 *   }
 * })
 * ```
 *
 * @summary
 *
 * Export promotions to a CSV file.
 */
export const exportPromotionsWorkflow = createWorkflow(
  exportPromotionsWorkflowId,
  (input: WorkflowData<ExportPromotionsWorkflowInput>): WorkflowData<void> => {
    const file = exportPromotionsStep(input).config({
      async: true,
      backgroundExecution: true,
    })

    const failureNotification = transform({ input }, (data) => {
      return [
        {
          // We don't need the recipient here for now, but if we want to push feed notifications to a specific user we could add it.
          to: "",
          channel: "feed",
          template: "admin-ui",
          data: {
            title: "Promotion export",
            description: `Failed to export promotions, please try again later.`,
          },
        },
      ]
    })
    notifyOnFailureStep(failureNotification)

    const fileDetails = useRemoteQueryStep({
      fields: ["id", "url"],
      entry_point: "file",
      variables: { id: file.id },
      list: false,
    })

    const notifications = transform({ fileDetails, file }, (data) => {
      return [
        {
          // We don't need the recipient here for now, but if we want to push feed notifications to a specific user we could add it.
          to: "",
          channel: "feed",
          template: "admin-ui",
          data: {
            title: "Promotion export",
            description: "Promotion export completed successfully!",
            file: {
              filename: data.file.filename,
              url: data.fileDetails.url,
              mimeType: "text/csv",
            },
          },
        },
      ]
    })

    sendNotificationsStep(notifications)
  }
)
