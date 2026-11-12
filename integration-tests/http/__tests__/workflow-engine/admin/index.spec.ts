import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowData,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules, TransactionState } from "@medusajs/utils"
import {
  adminHeaders,
  createAdminUser,
} from "../../../../helpers/create-admin-user"
import { setTimeout } from "timers/promises"
import { IWorkflowEngineService } from "@medusajs/framework/types"

jest.setTimeout(300000)

medusaIntegrationTestRunner({
  testSuite: ({ dbConnection, getContainer, api, dbUtils }) => {
    let container
    let workflowOrcModule: IWorkflowEngineService

    beforeAll(async () => {
      container = getContainer()
      await createAdminUser(dbConnection, adminHeaders, container)
      workflowOrcModule = container.resolve(Modules.WORKFLOW_ENGINE)

      await dbUtils.snapshot()
    })

    describe("GET /admin/workflow-executions", () => {
      it("should filter using q", async () => {
        const step1 = createStep(
          {
            name: "my-step",
          },
          async (_) => {
            return new StepResponse({ result: "success" })
          }
        )

        const workflowName = "workflow-admin/workflow-executions"
        createWorkflow(
          {
            name: workflowName,
            retentionTime: 50,
          },
          function (input: WorkflowData<{ initial: string }>) {
            const stepRes = step1()

            return new WorkflowResponse(stepRes)
          }
        )

        const engine = container.resolve(Modules.WORKFLOW_ENGINE)

        const transactionId = "test-transaction-id"
        await engine.run(workflowName, {
          transactionId,
          input: {
            initial: "test",
          },
        })

        const transactionId2 = "unknown"
        await engine.run(workflowName, {
          transactionId: transactionId2,
          input: {
            initial: "test",
          },
        })

        const q = "transaction-id"
        const response = await api.get(
          `/admin/workflows-executions?q=${q}`,
          adminHeaders
        )

        expect(response.status).toEqual(200)
        expect(response.data.workflow_executions.length).toEqual(1)
        expect(response.data.workflow_executions[0].transaction_id).toEqual(
          transactionId
        )

        const q2 = "known"
        const response2 = await api.get(
          `/admin/workflows-executions?q=${q2}`,
          adminHeaders
        )

        expect(response2.status).toEqual(200)
        expect(response2.data.workflow_executions.length).toEqual(1)
        expect(response2.data.workflow_executions[0].transaction_id).toEqual(
          transactionId2
        )
      })

      it("should list a reverted execution of a workflow that doesn't set a retention time", async () => {
        const step1 = createStep(
          {
            name: "reverted-step-1",
          },
          async () => {
            return new StepResponse("step 1 done")
          },
          async () => {
            return new StepResponse("step 1 compensated")
          }
        )
        const failingStep = createStep(
          {
            name: "failing-step",
          },
          async () => {
            throw new Error("I am failing")
          }
        )

        const workflowName = "workflow-admin-reverted-executions"
        createWorkflow(
          {
            name: workflowName,
            store: true,
          },
          function () {
            step1()
            failingStep()

            return new WorkflowResponse(void 0)
          }
        )

        const transactionId = "reverted-transaction-id"
        await workflowOrcModule.run(workflowName, {
          transactionId,
          throwOnError: false,
        })

        const response = await api.get(
          `/admin/workflows-executions?workflow_id=${workflowName}`,
          adminHeaders
        )

        expect(response.status).toEqual(200)
        expect(response.data.workflow_executions).toEqual([
          expect.objectContaining({
            workflow_id: workflowName,
            transaction_id: transactionId,
            state: TransactionState.REVERTED,
          }),
        ])

        const detailResponse = await api.get(
          `/admin/workflows-executions/${response.data.workflow_executions[0].id}`,
          adminHeaders
        )

        expect(detailResponse.status).toEqual(200)

        const steps = Object.values(
          detailResponse.data.workflow_execution.execution.steps
        )

        expect(steps).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: expect.stringContaining("failing-step"),
              invoke: expect.objectContaining({ state: "failed" }),
            }),
            expect.objectContaining({
              id: expect.stringContaining("reverted-step-1"),
              compensate: expect.objectContaining({ state: "reverted" }),
            }),
          ])
        )
      })
    })

    describe("POST /admin/workflows-executions/[workflow_id]/steps/failure", function () {
      it("should set step as failed", async () => {
        const stepId = "test-step"
        const step = createStep(
          {
            name: stepId,
            async: true,
          },
          () => {}
        )

        const workflowId =
          "workflow-f" + Math.random().toString(36).substring(2, 15)
        createWorkflow(
          {
            name: workflowId,
            retentionTime: 60,
          },
          () => {
            step()
            return new WorkflowResponse(void 0)
          }
        )

        const transactionId =
          "trx_123_f" + Math.random().toString(36).substring(2, 15)
        const engine = container.resolve(
          Modules.WORKFLOW_ENGINE
        ) as IWorkflowEngineService
        await engine.run(workflowId, {
          transactionId,
        })
        let workflowDetail = (
          await api.get(
            `/admin/workflows-executions/${workflowId}/${transactionId}`,
            adminHeaders
          )
        ).data.workflow_execution

        expect(workflowDetail.state).toBe(TransactionState.INVOKING)

        const setFailureResponse = await api.post(
          `/admin/workflows-executions/${workflowId}/steps/failure`,
          {
            transaction_id: transactionId,
            step_id: stepId,
          },
          adminHeaders
        )

        expect(setFailureResponse.status).toBe(200)
        expect(setFailureResponse.data).toEqual(
          expect.objectContaining({
            success: true,
          })
        )

        workflowDetail = (
          await api.get(
            `/admin/workflows-executions/${workflowId}/${transactionId}`,
            adminHeaders
          )
        ).data.workflow_execution

        expect(workflowDetail).toEqual(
          expect.objectContaining({
            state: TransactionState.REVERTED,
          })
        )
      })
    })

    describe("POST /admin/workflows-executions/[workflow_id]/steps/success", function () {
      it("should set step as successful", async () => {
        const stepId = "test-step"
        const step = createStep(
          {
            name: stepId,
            async: true,
          },
          () => {}
        )

        const workflowId =
          "workflow_s" + Math.random().toString(36).substring(2, 15)
        createWorkflow(
          {
            name: workflowId,
            retentionTime: 60,
          },
          () => {
            step()
            return new WorkflowResponse(void 0)
          }
        )

        const transactionId =
          "trx_123_s" + Math.random().toString(36).substring(2, 15)
        const engine = container.resolve(
          Modules.WORKFLOW_ENGINE
        ) as IWorkflowEngineService
        await engine.run(workflowId, {
          transactionId,
        })
        let workflowDetail = (
          await api.get(
            `/admin/workflows-executions/${workflowId}/${transactionId}`,
            adminHeaders
          )
        ).data.workflow_execution

        expect(workflowDetail.state).toBe(TransactionState.INVOKING)

        const setSuccessResponse = await api.post(
          `/admin/workflows-executions/${workflowId}/steps/success`,
          {
            transaction_id: transactionId,
            step_id: stepId,
          },
          adminHeaders
        )

        expect(setSuccessResponse.status).toBe(200)
        expect(setSuccessResponse.data).toEqual(
          expect.objectContaining({
            success: true,
          })
        )

        workflowDetail = (
          await api.get(
            `/admin/workflows-executions/${workflowId}/${transactionId}`,
            adminHeaders
          )
        ).data.workflow_execution

        expect(workflowDetail).toEqual(
          expect.objectContaining({
            state: TransactionState.DONE,
          })
        )
      })
    })

    describe("POST /admin/workflows-executions/[workflow_id]/[transaction_id]/cancel", function () {
      const unique = () => Math.random().toString(36).substring(2, 15)

      const getExecution = async (workflowId: string, transactionId: string) =>
        (
          await api.get(
            `/admin/workflows-executions/${workflowId}/${transactionId}`,
            adminHeaders
          )
        ).data.workflow_execution

      const cancel = (
        workflowId: string,
        transactionId: string,
        headers: any = adminHeaders
      ) =>
        api.post(
          `/admin/workflows-executions/${workflowId}/${transactionId}/cancel`,
          {},
          headers
        )

      // Builds a workflow with one finished step (that has a compensation
      // handler we can spy on) followed by an async step that stays parked, so
      // the execution sits in `invoking` until something resolves it.
      const buildRunningWorkflow = (compensateSpy = jest.fn()) => {
        const syncStep = createStep(
          { name: "cancel-sync-step-" + unique() },
          async () => new StepResponse("done", "compensate-me"),
          async (data) => {
            compensateSpy(data)
          }
        )
        const asyncStepName = "cancel-async-step-" + unique()
        const asyncStep = createStep(
          { name: asyncStepName, async: true },
          () => {}
        )

        const workflowId = "workflow-cancel-" + unique()
        createWorkflow({ name: workflowId, retentionTime: 60 }, () => {
          syncStep()
          asyncStep()
          return new WorkflowResponse(void 0)
        })

        return { workflowId, asyncStepName, compensateSpy }
      }

      // AC1: cancels a running execution and returns the updated execution.
      it("should cancel a running execution and return the updated execution", async () => {
        const { workflowId, compensateSpy } = buildRunningWorkflow()
        const transactionId = "trx_cancel_" + unique()

        await workflowOrcModule.run(workflowId, { transactionId })
        expect((await getExecution(workflowId, transactionId)).state).toBe(
          TransactionState.INVOKING
        )

        const response = await cancel(workflowId, transactionId)

        expect(response.status).toBe(200)
        // The body is the updated execution, not a bare acknowledgement.
        expect(response.data.workflow_execution).toEqual(
          expect.objectContaining({
            workflow_id: workflowId,
            transaction_id: transactionId,
          })
        )
        expect(response.data.workflow_execution.state).not.toBe(
          TransactionState.INVOKING
        )

        // The steps that had already finished were compensated.
        expect(compensateSpy).toHaveBeenCalledWith("compensate-me")

        // The stored execution reflects the same new state as the response.
        const stored = await getExecution(workflowId, transactionId)
        expect(stored.state).toBe(response.data.workflow_execution.state)
        expect([
          TransactionState.REVERTED,
          TransactionState.WAITING_TO_COMPENSATE,
          TransactionState.COMPENSATING,
        ]).toContain(stored.state)
      })

      // AC2: an execution that is DONE is rejected and left untouched.
      it("should return 400 when the execution is already done", async () => {
        const { workflowId, asyncStepName, compensateSpy } =
          buildRunningWorkflow()
        const transactionId = "trx_cancel_done_" + unique()

        await workflowOrcModule.run(workflowId, { transactionId })
        await api.post(
          `/admin/workflows-executions/${workflowId}/steps/success`,
          { transaction_id: transactionId, step_id: asyncStepName },
          adminHeaders
        )
        expect((await getExecution(workflowId, transactionId)).state).toBe(
          TransactionState.DONE
        )

        const error = await cancel(workflowId, transactionId).catch((e) => e)

        expect(error.response.status).toBe(400)
        expect(error.response.data.message).toContain("done")
        // Nothing changed: still done, nothing was rolled back.
        expect((await getExecution(workflowId, transactionId)).state).toBe(
          TransactionState.DONE
        )
        expect(compensateSpy).not.toHaveBeenCalled()
      })

      // AC2: an execution that is REVERTED is rejected and left untouched.
      it("should return 400 when the execution is already reverted", async () => {
        const { workflowId, asyncStepName } = buildRunningWorkflow()
        const transactionId = "trx_cancel_reverted_" + unique()

        await workflowOrcModule.run(workflowId, { transactionId })
        await api.post(
          `/admin/workflows-executions/${workflowId}/steps/failure`,
          { transaction_id: transactionId, step_id: asyncStepName },
          adminHeaders
        )
        expect((await getExecution(workflowId, transactionId)).state).toBe(
          TransactionState.REVERTED
        )

        const error = await cancel(workflowId, transactionId).catch((e) => e)

        expect(error.response.status).toBe(400)
        expect(error.response.data.message).toContain("reverted")
        expect((await getExecution(workflowId, transactionId)).state).toBe(
          TransactionState.REVERTED
        )
      })

      // AC2: an execution that is FAILED is rejected and left untouched.
      // A permanent failure happens when a compensation handler itself throws.
      it("should return 400 when the execution has failed", async () => {
        const failingCompensation = createStep(
          { name: "cancel-failing-comp-" + unique() },
          async () => new StepResponse("done", "data"),
          async () => {
            throw new Error("compensation failed")
          }
        )
        const asyncStepName = "cancel-failed-async-" + unique()
        const asyncStep = createStep(
          { name: asyncStepName, async: true },
          () => {}
        )

        const workflowId = "workflow-cancel-failed-" + unique()
        createWorkflow({ name: workflowId, retentionTime: 60 }, () => {
          failingCompensation()
          asyncStep()
          return new WorkflowResponse(void 0)
        })
        const transactionId = "trx_cancel_failed_" + unique()

        await workflowOrcModule.run(workflowId, { transactionId })
        await api.post(
          `/admin/workflows-executions/${workflowId}/steps/failure`,
          { transaction_id: transactionId, step_id: asyncStepName },
          adminHeaders
        )
        expect((await getExecution(workflowId, transactionId)).state).toBe(
          TransactionState.FAILED
        )

        const error = await cancel(workflowId, transactionId).catch((e) => e)

        expect(error.response.status).toBe(400)
        expect(error.response.data.message).toContain("failed")
        expect((await getExecution(workflowId, transactionId)).state).toBe(
          TransactionState.FAILED
        )
      })

      // AC3: unknown transaction on a real workflow, and unknown workflow.
      it("should return 404 when the transaction does not exist", async () => {
        const { workflowId } = buildRunningWorkflow()

        const error = await cancel(workflowId, "trx_does_not_exist").catch(
          (e) => e
        )

        expect(error.response.status).toBe(404)
      })

      it("should return 404 when the workflow does not exist", async () => {
        const error = await cancel(
          "workflow-does-not-exist",
          "trx_does_not_exist"
        ).catch((e) => e)

        expect(error.response.status).toBe(404)
      })

      // AC4: no authenticated admin, no cancel.
      it("should return 401 when the request is not authenticated", async () => {
        const { workflowId } = buildRunningWorkflow()
        const transactionId = "trx_cancel_unauth_" + unique()
        await workflowOrcModule.run(workflowId, { transactionId })

        const error = await cancel(workflowId, transactionId, {}).catch(
          (e) => e
        )

        expect(error.response.status).toBe(401)
        // The unauthenticated call must not have cancelled anything.
        expect((await getExecution(workflowId, transactionId)).state).toBe(
          TransactionState.INVOKING
        )
      })
    })

    describe("Workflow Orchestrator module subscribe", function () {
      it("should subscribe to a workflow and receive the response when it finishes (1)", async () => {
        const step1 = createStep({ name: "step1" }, async () => {
          return new StepResponse("step1")
        })
        const step2 = createStep({ name: "step2" }, async () => {
          await setTimeout(1000)
          return new StepResponse("step2")
        })

        const workflowId =
          "workflow" + Math.random().toString(36).substring(2, 15)
        createWorkflow(workflowId, function (input) {
          step1()
          step2().config({
            async: true,
          })
          return new WorkflowResponse("workflow")
        })

        const step1_1 = createStep({ name: "step1_1" }, async () => {
          return new StepResponse("step1_1")
        })
        const step2_1 = createStep({ name: "step2_1" }, async () => {
          await setTimeout(1000)
          return new StepResponse("step2_1")
        })

        const workflow2Id =
          "workflow_2" + Math.random().toString(36).substring(2, 15)
        createWorkflow(workflow2Id, function (input) {
          step1_1()
          step2_1().config({
            async: true,
          })
          return new WorkflowResponse("workflow_2")
        })

        const transactionId =
          "trx_123" + Math.random().toString(36).substring(2, 15)
        const transactionId2 =
          "trx_124" + Math.random().toString(36).substring(2, 15)

        const onWorkflowFinishSpy = jest.fn()

        const onWorkflowFinishPromise = new Promise<void>((resolve) => {
          void workflowOrcModule.subscribe({
            workflowId: workflowId,
            transactionId,
            subscriber: (event) => {
              console.log("event", event)
              if (event.eventType === "onFinish") {
                onWorkflowFinishSpy()
                workflowOrcModule.run(workflow2Id, {
                  transactionId: transactionId2,
                })
                resolve()
              }
            },
          })
        })

        const onWorkflow2FinishSpy = jest.fn()

        const workflow2FinishPromise = new Promise<void>((resolve) => {
          void workflowOrcModule.subscribe({
            workflowId: workflow2Id,
            subscriber: (event) => {
              console.log("event", event)
              if (event.eventType === "onFinish") {
                onWorkflow2FinishSpy()
                resolve()
              }
            },
          })
        })

        workflowOrcModule.run(workflowId, {
          transactionId,
        })

        await onWorkflowFinishPromise
        await workflow2FinishPromise

        expect(onWorkflowFinishSpy).toHaveBeenCalledTimes(1)
        expect(onWorkflow2FinishSpy).toHaveBeenCalledTimes(1)
      })
    })
  },
})
