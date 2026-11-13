import { HttpTypes } from "@medusajs/types"
import { TransactionState, TransactionStepState } from "./types"

export const STEP_IN_PROGRESS_STATES: HttpTypes.TransactionStepState[] = [
  TransactionStepState.COMPENSATING,
  TransactionStepState.INVOKING,
]

export const STEP_SKIPPED_STATES: HttpTypes.TransactionStepState[] = [
  TransactionStepState.SKIPPED,
  TransactionStepState.SKIPPED_FAILURE,
]
export const STEP_OK_STATES: HttpTypes.TransactionStepState[] = [
  TransactionStepState.DONE,
]

export const STEP_ERROR_STATES: HttpTypes.TransactionStepState[] = [
  TransactionStepState.FAILED,
  TransactionStepState.REVERTED,
  TransactionStepState.TIMEOUT,
  TransactionStepState.DORMANT,
]
export const STEP_INACTIVE_STATES: HttpTypes.TransactionStepState[] = [
  TransactionStepState.NOT_STARTED,
]

export const TRANSACTION_OK_STATES: HttpTypes.TransactionState[] = [
  TransactionState.DONE,
]
export const TRANSACTION_ERROR_STATES: HttpTypes.TransactionState[] = [
  TransactionState.FAILED,
  TransactionState.REVERTED,
]
// The only states in which an execution can be cancelled. This must stay in
// sync with the cancel route in the API (packages/medusa), which rejects any
// other state with a 400. `invoking` covers both running steps and executions
// parked on an async step.
export const TRANSACTION_CANCELLABLE_STATES: HttpTypes.TransactionState[] = [
  TransactionState.INVOKING,
]

export const TRANSACTION_IN_PROGRESS_STATES: HttpTypes.TransactionState[] = [
  TransactionState.INVOKING,
  TransactionState.WAITING_TO_COMPENSATE,
  TransactionState.COMPENSATING,
]
