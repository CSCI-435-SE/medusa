import { XCircle } from "@medusajs/icons"
import {
  Badge,
  Container,
  Copy,
  Heading,
  StatusBadge,
  Text,
  clx,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { ActionMenu } from "../../../../../components/common/action-menu"
import { useCancelWorkflowExecution } from "../../../../../hooks/api/workflow-executions"
import { TRANSACTION_CANCELLABLE_STATES } from "../../../constants"
import { getTransactionState, getTransactionStateColor } from "../../../utils"
import { HttpTypes } from "@medusajs/types"
import { TransactionState, TransactionStepState } from "../../../types"

type WorkflowExecutionGeneralSectionProps = {
  execution: HttpTypes.AdminWorkflowExecution
}

export const WorkflowExecutionGeneralSection = ({
  execution,
}: WorkflowExecutionGeneralSectionProps) => {
  const { t } = useTranslation()
  const prompt = usePrompt()

  const { mutateAsync: cancelExecution } = useCancelWorkflowExecution(
    execution.id,
    execution.workflow_id,
    execution.transaction_id
  )

  // The Cancel action is only offered while the execution can actually be
  // cancelled; the API rejects every other state with a 400.
  const canCancel = TRANSACTION_CANCELLABLE_STATES.includes(
    execution.state as TransactionState
  )

  const handleCancel = async () => {
    // Always ask for confirmation first: cancelling rolls back finished steps.
    const confirmed = await prompt({
      title: t("general.areYouSure"),
      description: t("workflowExecutions.cancel.warning"),
      confirmText: t("workflowExecutions.cancel.confirmText"),
      cancelText: t("workflowExecutions.cancel.keepRunningText"),
    })

    if (!confirmed) {
      return
    }

    // The hook invalidates the detail query on success, so the page refetches
    // and shows the new state and the compensated steps in the timeline.
    await cancelExecution(undefined, {
      onSuccess: () => {
        toast.success(t("workflowExecutions.cancel.successToast"))
      },
      onError: (error) => {
        toast.error(error.message)
      },
    })
  }

  const cleanId = execution.id.replace("wf_exec_", "")
  const translatedState = getTransactionState(
    t,
    execution.state as TransactionState
  )
  const stateColor = getTransactionStateColor(
    execution.state as TransactionState
  )

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-x-0.5">
          <Heading>{cleanId}</Heading>
          <Copy content={cleanId} className="text-ui-fg-muted" />
        </div>
        <div className="flex items-center gap-x-2">
          <StatusBadge color={stateColor}>{translatedState}</StatusBadge>
          {canCancel && (
            <ActionMenu
              groups={[
                {
                  actions: [
                    {
                      icon: <XCircle />,
                      label: t("workflowExecutions.cancel.label"),
                      onClick: handleCancel,
                    },
                  ],
                },
              ]}
            />
          )}
        </div>
      </div>
      <div className="text-ui-fg-subtle grid grid-cols-2 px-6 py-4">
        <Text size="small" leading="compact" weight="plus">
          {t("workflowExecutions.workflowIdLabel")}
        </Text>
        <Badge size="2xsmall" className="w-fit">
          {execution.workflow_id}
        </Badge>
      </div>
      <div className="text-ui-fg-subtle grid grid-cols-2 px-6 py-4">
        <Text size="small" leading="compact" weight="plus">
          {t("workflowExecutions.transactionIdLabel")}
        </Text>
        <Badge size="2xsmall" className="w-fit">
          {execution.transaction_id}
        </Badge>
      </div>
      <div className="text-ui-fg-subtle grid grid-cols-2 px-6 py-4">
        <Text size="small" leading="compact" weight="plus">
          {t("workflowExecutions.progressLabel")}
        </Text>
        <Progress steps={execution.execution?.steps} />
      </div>
    </Container>
  )
}

const ROOT_PREFIX = "_root"

const Progress = ({
  steps,
}: {
  steps?: Record<string, HttpTypes.AdminWorkflowExecutionStep> | null
}) => {
  const { t } = useTranslation()

  if (!steps) {
    return (
      <Text size="small" leading="compact" className="text-ui-fg-subtle">
        {t("workflowExecutions.stepsCompletedLabel", {
          completed: 0,
          total: 0,
        })}
      </Text>
    )
  }

  const actionableSteps = Object.values(steps).filter(
    (step) => step.id !== ROOT_PREFIX
  )

  const completedSteps = actionableSteps.filter(
    (step) => step.invoke.state === TransactionStepState.DONE
  )

  return (
    <div className="flex w-fit items-center gap-x-2">
      <div className="flex items-center gap-x-[3px]">
        {actionableSteps.map((step) => (
          <div
            key={step.id}
            className={clx(
              "bg-ui-bg-switch-off shadow-details-switch-background h-3 w-1.5 rounded-full",
              {
                "bg-ui-fg-muted":
                  step.invoke.state === TransactionStepState.DONE,
              }
            )}
          />
        ))}
      </div>
      <Text size="small" leading="compact" className="text-ui-fg-subtle">
        {t("workflowExecutions.stepsCompletedLabel", {
          completed: completedSteps.length,
          count: actionableSteps.length,
        })}
      </Text>
    </div>
  )
}
