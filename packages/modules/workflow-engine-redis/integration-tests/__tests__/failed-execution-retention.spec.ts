import { TransactionState } from "@medusajs/framework/orchestration"
import { IWorkflowEngineService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { ulid } from "ulid"
import { TestDatabase } from "../utils"

jest.setTimeout(60000)

const testRunId = ulid()

const redisOptions = (suffix: string) => ({
  url: "localhost:6379",
  queueName: `medusa-workflows-${
    process.env.JEST_WORKER_ID ?? "1"
  }-${testRunId}-${suffix}`,
  jobQueueName: `medusa-workflows-jobs-${
    process.env.JEST_WORKER_ID ?? "1"
  }-${testRunId}-${suffix}`,
})

const SEVEN_DAYS_IN_SECONDS = 60 * 60 * 24 * 7
const ONE_DAY_IN_SECONDS = 60 * 60 * 24

const createRevertingWorkflow = (config: { retentionTime?: number } = {}) => {
  const workflowId = "reverting-workflow-" + ulid()
  const revertingStep = createStep(
    "reverting-step-" + ulid(),
    () => {
      throw new Error("I am reverting")
    },
    () => {
      return new StepResponse("reverted")
    }
  )

  createWorkflow({ name: workflowId, store: true, ...config }, () => {
    revertingStep()
    return new WorkflowResponse("reverted")
  })

  return workflowId
}

const createFailingWorkflow = () => {
  const workflowId = "failed-workflow-" + ulid()
  const step1 = createStep(
    "step-1-" + ulid(),
    () => {
      return new StepResponse("step 1 done")
    },
    () => {
      throw new Error("I can't compensate")
    }
  )
  const failingStep = createStep("failing-step-" + ulid(), () => {
    throw new Error("I am failing")
  })

  createWorkflow({ name: workflowId, store: true }, () => {
    step1()
    failingStep()
    return new WorkflowResponse("failed")
  })

  return workflowId
}

const createParentAndChildWorkflows = (
  parentConfig: { retentionTime?: number } = {}
) => {
  const childWorkflowId = "child-workflow-" + ulid()
  const parentWorkflowId = "parent-workflow-" + ulid()
  const failingStep = createStep("child-failing-step-" + ulid(), () => {
    throw new Error("I am failing")
  })

  const childWorkflow = createWorkflow(
    { name: childWorkflowId, store: true },
    () => {
      failingStep()
      return new WorkflowResponse("child")
    }
  )

  createWorkflow(
    { name: parentWorkflowId, store: true, ...parentConfig },
    () => {
      childWorkflow.runAsStep({ input: {} })
      return new WorkflowResponse("parent")
    }
  )

  return { childWorkflowId, parentWorkflowId }
}

moduleIntegrationTestRunner<IWorkflowEngineService>({
  moduleName: Modules.WORKFLOW_ENGINE,
  resolve: __dirname + "/../..",
  moduleOptions: {
    redis: redisOptions("custom"),
    failedExecutionRetentionTime: ONE_DAY_IN_SECONDS,
  },
  testSuite: ({ service: workflowOrcModule }) => {
    describe("Failed execution retention time set to a custom value", function () {
      beforeEach(async () => {
        await TestDatabase.clearTables()
      })

      afterEach(async () => {
        await TestDatabase.clearTables()
      })

      it("should keep a reverted execution with the configured retention time", async () => {
        const workflowId = createRevertingWorkflow()
        const transactionId = "trx-reverted-" + ulid()

        await workflowOrcModule.run(workflowId, {
          transactionId,
          throwOnError: false,
        })

        const executions = await workflowOrcModule.listWorkflowExecutions({
          transaction_id: transactionId,
        })

        expect(executions).toHaveLength(1)
        expect(executions[0]).toEqual(
          expect.objectContaining({
            state: TransactionState.REVERTED,
            retention_time: ONE_DAY_IN_SECONDS,
          })
        )
      })

      it("should keep a failed execution with the configured retention time", async () => {
        const workflowId = createFailingWorkflow()
        const transactionId = "trx-failed-" + ulid()

        await workflowOrcModule.run(workflowId, {
          transactionId,
          throwOnError: false,
        })

        const executions = await workflowOrcModule.listWorkflowExecutions({
          transaction_id: transactionId,
        })

        expect(executions).toHaveLength(1)
        expect(executions[0]).toEqual(
          expect.objectContaining({
            state: TransactionState.FAILED,
            retention_time: ONE_DAY_IN_SECONDS,
          })
        )
      })

      it("should keep a reverted child workflow execution and its failed parent with the configured retention time", async () => {
        const { childWorkflowId, parentWorkflowId } =
          createParentAndChildWorkflows()

        await workflowOrcModule.run(parentWorkflowId, {
          transactionId: "trx-parent-" + ulid(),
          throwOnError: false,
        })

        const [childExecution] = await workflowOrcModule.listWorkflowExecutions(
          { workflow_id: childWorkflowId }
        )

        expect(childExecution).toEqual(
          expect.objectContaining({
            state: TransactionState.REVERTED,
            retention_time: ONE_DAY_IN_SECONDS,
          })
        )

        const [parentExecution] =
          await workflowOrcModule.listWorkflowExecutions({
            workflow_id: parentWorkflowId,
          })

        expect(parentExecution).toEqual(
          expect.objectContaining({
            state: TransactionState.FAILED,
            retention_time: ONE_DAY_IN_SECONDS,
          })
        )
      })

      it("should use the workflow's own retention time for a reverted execution", async () => {
        const workflowId = createRevertingWorkflow({ retentionTime: 60 })
        const transactionId = "trx-own-retention-" + ulid()

        await workflowOrcModule.run(workflowId, {
          transactionId,
          throwOnError: false,
        })

        const executions = await workflowOrcModule.listWorkflowExecutions({
          transaction_id: transactionId,
        })

        expect(executions).toHaveLength(1)
        expect(executions[0]).toEqual(
          expect.objectContaining({
            state: TransactionState.REVERTED,
            retention_time: 60,
          })
        )
      })
    })
  },
})

moduleIntegrationTestRunner<IWorkflowEngineService>({
  moduleName: Modules.WORKFLOW_ENGINE,
  resolve: __dirname + "/../..",
  moduleOptions: {
    redis: redisOptions("off"),
    failedExecutionRetentionTime: 0,
  },
  testSuite: ({ service: workflowOrcModule }) => {
    describe("Failed execution retention time set to 0", function () {
      beforeEach(async () => {
        await TestDatabase.clearTables()
      })

      afterEach(async () => {
        await TestDatabase.clearTables()
      })

      it("should delete a reverted execution when it finishes", async () => {
        const workflowId = createRevertingWorkflow()
        const transactionId = "trx-reverted-" + ulid()

        const { transaction } = await workflowOrcModule.run(workflowId, {
          transactionId,
          throwOnError: false,
        })

        expect(transaction.getFlow().state).toEqual(TransactionState.REVERTED)

        const executions = await workflowOrcModule.listWorkflowExecutions({
          transaction_id: transactionId,
        })

        expect(executions).toHaveLength(0)
      })

      it("should delete a failed execution when it finishes", async () => {
        const workflowId = createFailingWorkflow()
        const transactionId = "trx-failed-" + ulid()

        const { transaction } = await workflowOrcModule.run(workflowId, {
          transactionId,
          throwOnError: false,
        })

        expect(transaction.getFlow().state).toEqual(TransactionState.FAILED)

        const executions = await workflowOrcModule.listWorkflowExecutions({
          transaction_id: transactionId,
        })

        expect(executions).toHaveLength(0)
      })

      it("should delete a reverted child workflow execution and its failed parent when they finish", async () => {
        const { childWorkflowId, parentWorkflowId } =
          createParentAndChildWorkflows()

        const { transaction } = await workflowOrcModule.run(parentWorkflowId, {
          transactionId: "trx-parent-" + ulid(),
          throwOnError: false,
        })

        expect(transaction.getFlow().state).toEqual(TransactionState.FAILED)

        const childExecutions = await workflowOrcModule.listWorkflowExecutions({
          workflow_id: childWorkflowId,
        })
        const parentExecutions = await workflowOrcModule.listWorkflowExecutions(
          {
            workflow_id: parentWorkflowId,
          }
        )

        expect(childExecutions).toHaveLength(0)
        expect(parentExecutions).toHaveLength(0)
      })

      it("should delete a reverted child workflow execution when its parent is kept with its own retention time", async () => {
        const { childWorkflowId, parentWorkflowId } =
          createParentAndChildWorkflows({ retentionTime: 60 })

        await workflowOrcModule.run(parentWorkflowId, {
          transactionId: "trx-parent-" + ulid(),
          throwOnError: false,
        })

        const childExecutions = await workflowOrcModule.listWorkflowExecutions({
          workflow_id: childWorkflowId,
        })
        const parentExecutions = await workflowOrcModule.listWorkflowExecutions(
          {
            workflow_id: parentWorkflowId,
          }
        )

        expect(childExecutions).toHaveLength(0)
        expect(parentExecutions).toHaveLength(1)
        expect(parentExecutions[0]).toEqual(
          expect.objectContaining({
            state: TransactionState.FAILED,
            retention_time: 60,
          })
        )
      })

      it("should use the workflow's own retention time for a reverted execution", async () => {
        const workflowId = createRevertingWorkflow({ retentionTime: 60 })
        const transactionId = "trx-own-retention-" + ulid()

        await workflowOrcModule.run(workflowId, {
          transactionId,
          throwOnError: false,
        })

        const executions = await workflowOrcModule.listWorkflowExecutions({
          transaction_id: transactionId,
        })

        expect(executions).toHaveLength(1)
        expect(executions[0]).toEqual(
          expect.objectContaining({
            state: TransactionState.REVERTED,
            retention_time: 60,
          })
        )
      })
    })
  },
})

moduleIntegrationTestRunner<IWorkflowEngineService>({
  moduleName: Modules.WORKFLOW_ENGINE,
  resolve: __dirname + "/../..",
  moduleOptions: {
    redis: redisOptions("default"),
  },
  testSuite: ({ service: workflowOrcModule }) => {
    describe("Failed execution retention time not set", function () {
      beforeEach(async () => {
        await TestDatabase.clearTables()
      })

      afterEach(async () => {
        await TestDatabase.clearTables()
      })

      it("should keep a reverted execution with the default retention time", async () => {
        const workflowId = createRevertingWorkflow()
        const transactionId = "trx-reverted-" + ulid()

        await workflowOrcModule.run(workflowId, {
          transactionId,
          throwOnError: false,
        })

        const executions = await workflowOrcModule.listWorkflowExecutions({
          transaction_id: transactionId,
        })

        expect(executions).toHaveLength(1)
        expect(executions[0]).toEqual(
          expect.objectContaining({
            state: TransactionState.REVERTED,
            retention_time: SEVEN_DAYS_IN_SECONDS,
          })
        )
      })
    })
  },
})
