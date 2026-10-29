import { FilterableCustomerProps } from "@medusajs/framework/types"
import {
  WorkflowData,
  createWorkflow,
  transform,
} from "@medusajs/framework/workflows-sdk"
import { useRemoteQueryStep } from "../../common"
import { notifyOnFailureStep, sendNotificationsStep } from "../../notification"
import { exportCustomersStep } from "../steps/export-customers"

/**
 * The data to export customers.
 */
export type ExportCustomersWorkflowInput = {
  /**
   * The fields to select. These fields will be passed to
   * [Query](https://docs.medusajs.com/learn/fundamentals/module-links/query).
   */
  select: string[]
  /**
   * The filters to select which customers to export.
   */
  filter?: FilterableCustomerProps
}

export const exportCustomersWorkflowId = "export-customers"
/**
 * This workflow exports customers matching the specified filters to a CSV
 * file. It runs in the background.
 *
 * :::note
 *
 * This workflow doesn't return the exported customers. Instead, it sends a notification to the admin
 * users that they can download the exported customers.
 *
 * :::
 *
 * @example
 * To export all customers:
 *
 * ```ts
 * const { transaction } = await exportCustomersWorkflow(container)
 * .run({
 *   input: {
 *     select: ["*"],
 *   }
 * })
 * ```
 *
 * To export customers matching a criteria:
 *
 * ```ts
 * const { transaction } = await exportCustomersWorkflow(container)
 * .run({
 *   input: {
 *     select: ["*"],
 *     filter: {
 *       has_account: false
 *     }
 *   }
 * })
 * ```
 *
 * @summary
 *
 * Export customers to a CSV file.
 */
export const exportCustomersWorkflow = createWorkflow(
  exportCustomersWorkflowId,
  (input: WorkflowData<ExportCustomersWorkflowInput>): WorkflowData<void> => {
    const file = exportCustomersStep(input).config({
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
            title: "Customer export",
            description: `Failed to export customers, please try again later.`,
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
            title: "Customer export",
            description: "Customer export completed successfully!",
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
