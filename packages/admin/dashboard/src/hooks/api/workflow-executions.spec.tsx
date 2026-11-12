// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  // The SDK client reads these globals at module load.
  const g = global as any
  g.__BACKEND_URL__ = "http://localhost:9000"
  g.__AUTH_TYPE__ = "session"
  g.__JWT_TOKEN_STORAGE_KEY__ = ""

  return { cancel: vi.fn(), invalidateQueries: vi.fn() }
})

vi.mock("../../lib/client", () => ({
  sdk: { admin: { workflowExecution: { cancel: mocks.cancel } } },
}))

// The hook invalidates through the app-wide query client, so spy on that one.
vi.mock("../../lib/query-client", () => ({
  queryClient: { invalidateQueries: mocks.invalidateQueries },
}))

import {
  useCancelWorkflowExecution,
  workflowExecutionsQueryKeys,
} from "./workflow-executions"

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
)

beforeEach(() => {
  mocks.cancel.mockReset()
  mocks.invalidateQueries.mockReset()
})

describe("useCancelWorkflowExecution", () => {
  it("cancels by workflow id and transaction id", async () => {
    mocks.cancel.mockResolvedValue({ workflow_execution: {} })
    const { result } = renderHook(
      () => useCancelWorkflowExecution("wf_exec_01", "create-order", "trx_123"),
      { wrapper }
    )

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(mocks.cancel).toHaveBeenCalledWith("create-order", "trx_123")
  })

  // Acceptance criterion 6: after cancelling, the detail page refreshes.
  it("refreshes the detail query and the lists after a successful cancel", async () => {
    mocks.cancel.mockResolvedValue({ workflow_execution: {} })
    const { result } = renderHook(
      () => useCancelWorkflowExecution("wf_exec_01", "create-order", "trx_123"),
      { wrapper }
    )

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: workflowExecutionsQueryKeys.detail("wf_exec_01"),
    })
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: workflowExecutionsQueryKeys.lists(),
    })
  })

  it("does not refresh anything when the cancel fails", async () => {
    mocks.cancel.mockRejectedValue(new Error("Cannot cancel"))
    const { result } = renderHook(
      () => useCancelWorkflowExecution("wf_exec_01", "create-order", "trx_123"),
      { wrapper }
    )

    await act(async () => {
      await result.current.mutateAsync().catch(() => {})
    })

    expect(mocks.invalidateQueries).not.toHaveBeenCalled()
  })
})
