import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { HttpTypes, IWorkflowEngineService } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  TransactionHandlerType,
  TransactionState,
  TransactionStepStatus,
  remoteQueryObjectFromString,
} from "@medusajs/framework/utils"
import { AdminGetWorkflowExecutionDetailsParamsType } from "../../../validators"

/**
 * Only executions that are actively running (including ones parked on an
 * async step, which also report `invoking`) can be cancelled. Every other
 * state is either already finished or already being rolled back.
 */
const CANCELLABLE_STATES: string[] = [TransactionState.INVOKING]

export const POST = async (
  req: AuthenticatedMedusaRequest<AdminGetWorkflowExecutionDetailsParamsType>,
  res: MedusaResponse<HttpTypes.AdminWorkflowExecutionResponse>
) => {
  const remoteQuery = req.scope.resolve(ContainerRegistrationKeys.REMOTE_QUERY)
  const workflowEngine: IWorkflowEngineService = req.scope.resolve(
    Modules.WORKFLOW_ENGINE
  )

  const { workflow_id, transaction_id } = req.params

  // Helper so we can load the execution both before and after cancelling,
  // using the same fields the GET detail route returns.
  const fetchExecution = async () => {
    const queryObject = remoteQueryObjectFromString({
      entryPoint: "workflow_execution",
      variables: { workflow_id, transaction_id },
      fields: req.queryConfig.fields,
    })

    const [execution] = await remoteQuery(queryObject)
    return execution
  }

  // 1. The execution has to exist. We check this ourselves because the engine
  //    throws a plain Error for unknown executions, which would become a 500.
  const execution = await fetchExecution()

  if (!execution) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Workflow execution with workflow id: ${workflow_id} and transaction id: ${transaction_id} was not found`
    )
  }

  // 2. Reject anything that is not currently running. This also stops the
  //    engine from "reverting" a DONE execution, which it would otherwise allow.
  if (!CANCELLABLE_STATES.includes(execution.state)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `Cannot cancel a workflow execution in the "${execution.state}" state. Only running executions can be cancelled.`
    )
  }

  // 3. Work out which steps are parked waiting for an async response. These
  //    are the steps that make an execution look "stuck", and the engine's
  //    `cancel` alone does not unstick them: it marks the run for rollback but
  //    only starts compensating once every waiting step has resolved, which
  //    for a genuinely stuck step is never.
  const waitingSteps = Object.values(execution.execution?.steps ?? {}).filter(
    (step: any) =>
      step.id !== "_root" &&
      step.invoke?.status === TransactionStepStatus.WAITING
  ) as any[]

  try {
    if (waitingSteps.length) {
      // Fail each waiting step permanently. A step failure makes the engine
      // compensate the steps that already finished, so the run ends up
      // reverted, which is exactly what cancelling should do.
      //
      // `forcePermanentFailure` skips the step's retry settings, otherwise a
      // step configured with retries would just be retried and stay stuck.
      for (const step of waitingSteps) {
        await workflowEngine.setStepFailure({
          idempotencyKey: {
            action: TransactionHandlerType.INVOKE,
            transactionId: transaction_id,
            stepId: step.definition.action,
            workflowId: workflow_id,
          },
          stepResponse: {
            name: "WorkflowExecutionCancelled",
            message: "The workflow execution was cancelled by an admin",
          },
          options: {
            container: req.scope,
            context: { requestId: req.requestId },
            throwOnError: false,
            logOnError: true,
            forcePermanentFailure: true,
          },
        })
      }
    } else {
      // Nothing is waiting on an async response (a step is running in-process),
      // so there is nothing to fail. Ask the engine to cancel instead: it
      // flags the run and rolls back once the running step settles.
      await workflowEngine.cancel(workflow_id, {
        transactionId: transaction_id,
        container: req.scope,
        context: { requestId: req.requestId },
      })
    }
  } catch (e) {
    // The execution may have finished or started compensating between our
    // check above and the engine call. Report that as a client error rather
    // than letting the engine's plain Error turn into a 500.
    if (
      e?.message === "Transaction not found" ||
      e?.type === MedusaError.Types.NOT_ALLOWED
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Workflow execution ${transaction_id} can no longer be cancelled`
      )
    }

    throw e
  }

  // 4. Return the execution as it is now (usually reverted or compensating).
  res.status(200).json({ workflow_execution: await fetchExecution() })
}
