// @vitest-environment jsdom
import { HttpTypes } from "@medusajs/types"
import { TooltipProvider } from "@medusajs/ui"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react"
import { ReactNode } from "react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The hooks module pulls in the SDK client, which reads these globals at
// module load. Vite's `define` supplies them in the app, not in tests.
vi.hoisted(() => {
  const g = global as any
  g.__BACKEND_URL__ = "http://localhost:9000"
  g.__AUTH_TYPE__ = "session"
  g.__JWT_TOKEN_STORAGE_KEY__ = ""
})

// Spy so each test can assert on whether the cancel mutation ran. The real
// usePrompt is used on purpose, so the tests click the actual confirmation
// dialog instead of stubbing it away.
const mocks = vi.hoisted(() => ({
  cancelExecution: vi.fn(),
}))

vi.mock("../../../../../hooks/api/workflow-executions", () => ({
  useCancelWorkflowExecution: () => ({ mutateAsync: mocks.cancelExecution }),
}))

// Copy renders an icon from the built icons bundle, which does not share this
// test environment's React instance and crashes on render. It is irrelevant to
// the cancel action, so stub just that component and keep the rest of the UI
// library (including the real usePrompt) intact.
vi.mock("@medusajs/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@medusajs/ui")>()),
  Copy: () => null,
}))

// Render the menu's actions as plain buttons so the suite stays focused on
// when the action shows up and what it does.
vi.mock("../../../../../components/common/action-menu", () => ({
  ActionMenu: ({ groups }: { groups: { actions: any[] }[] }) => (
    <div>
      {groups
        .flatMap((group) => group.actions)
        .map(
          (action): ReactNode => (
            <button key={action.label} onClick={action.onClick}>
              {action.label}
            </button>
          )
        )}
    </div>
  ),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

import { WorkflowExecutionGeneralSection } from "./workflow-execution-general-section"

const CANCEL_LABEL = "workflowExecutions.cancel.label"
const CONFIRM_LABEL = "workflowExecutions.cancel.confirmText"
const KEEP_RUNNING_LABEL = "workflowExecutions.cancel.keepRunningText"

const buildExecution = (state: string) =>
  ({
    id: "wf_exec_01",
    workflow_id: "create-order",
    transaction_id: "trx_123",
    state,
    execution: { steps: {} },
  }) as unknown as HttpTypes.AdminWorkflowExecution

const renderSection = (state: string) =>
  render(
    <TooltipProvider>
      <MemoryRouter>
        <WorkflowExecutionGeneralSection execution={buildExecution(state)} />
      </MemoryRouter>
    </TooltipProvider>
  )

beforeEach(() => {
  mocks.cancelExecution.mockReset()
})

afterEach(() => {
  cleanup()
})

describe("WorkflowExecutionGeneralSection cancel action", () => {
  // Acceptance criterion 5: the button shows only while cancellable.
  it("shows Cancel while the execution is invoking", () => {
    renderSection("invoking")

    expect(screen.getByRole("button", { name: CANCEL_LABEL })).toBeTruthy()
  })

  it.each([
    "not_started",
    "waiting_to_compensate",
    "compensating",
    "done",
    "failed",
    "reverted",
  ])("hides Cancel when the execution is %s", (state) => {
    renderSection(state)

    expect(screen.queryByRole("button", { name: CANCEL_LABEL })).toBeNull()
  })

  // Acceptance criterion 5: clicking asks for confirmation first.
  it("asks for confirmation before cancelling", async () => {
    renderSection("invoking")

    fireEvent.click(screen.getByRole("button", { name: CANCEL_LABEL }))

    // The confirmation dialog is up, and nothing has been cancelled yet.
    expect(
      await screen.findByRole("button", { name: CONFIRM_LABEL })
    ).toBeTruthy()
    expect(mocks.cancelExecution).not.toHaveBeenCalled()
  })

  it("cancels the execution once the user confirms", async () => {
    renderSection("invoking")

    fireEvent.click(screen.getByRole("button", { name: CANCEL_LABEL }))
    fireEvent.click(await screen.findByRole("button", { name: CONFIRM_LABEL }))

    await vi.waitFor(() => expect(mocks.cancelExecution).toHaveBeenCalled())
  })

  it("does not cancel when the user declines the confirmation", async () => {
    renderSection("invoking")

    fireEvent.click(screen.getByRole("button", { name: CANCEL_LABEL }))
    fireEvent.click(
      await screen.findByRole("button", { name: KEEP_RUNNING_LABEL })
    )

    // The dialog's exit animation never finishes in jsdom, so the dialog can't
    // be used as the signal. Flush pending promises and timers instead, which
    // is long enough for a confirmed prompt to have called the mutation (the
    // "confirms" test above proves that path runs), then check it did not.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(mocks.cancelExecution).not.toHaveBeenCalled()
  })
})
