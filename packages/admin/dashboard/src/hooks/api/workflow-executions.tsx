import {
  QueryKey,
  UseMutationOptions,
  UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query"
import { sdk } from "../../lib/client"
import { queryClient } from "../../lib/query-client"
import { queryKeysFactory } from "../../lib/query-key-factory"
import { HttpTypes } from "@medusajs/types"
import { FetchError } from "@medusajs/js-sdk"

const WORKFLOW_EXECUTIONS_QUERY_KEY = "workflow_executions" as const
export const workflowExecutionsQueryKeys = queryKeysFactory(
  WORKFLOW_EXECUTIONS_QUERY_KEY
)

export const useWorkflowExecutions = (
  query?: HttpTypes.AdminGetWorkflowExecutionsParams,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminGetWorkflowExecutionsParams,
      FetchError,
      HttpTypes.AdminWorkflowExecutionListResponse,
      QueryKey
    >,
    "queryKey" | "queryFn"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.admin.workflowExecution.list(query),
    queryKey: workflowExecutionsQueryKeys.list(query),
    ...options,
  })

  return { ...data, ...rest }
}

export const useWorkflowExecution = (
  id: string,
  options?: Omit<
    UseQueryOptions<
      HttpTypes.AdminWorkflowExecutionResponse,
      FetchError,
      HttpTypes.AdminWorkflowExecutionResponse,
      QueryKey
    >,
    "queryKey" | "queryFn"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.admin.workflowExecution.retrieve(id),
    queryKey: workflowExecutionsQueryKeys.detail(id),
    ...options,
  })

  return { ...data, ...rest }
}

/**
 * Cancels a running workflow execution.
 *
 * `id` is the execution's own id (what the detail page is keyed by, and what
 * `useWorkflowExecution` takes). The API route addresses an execution by
 * workflow id + transaction id, so those are passed separately.
 *
 * On success the detail query and the list queries are invalidated, which makes
 * the detail page refetch and show the new state and compensated steps.
 */
export const useCancelWorkflowExecution = (
  id: string,
  workflowId: string,
  transactionId: string,
  options?: UseMutationOptions<
    HttpTypes.AdminWorkflowExecutionResponse,
    FetchError,
    void
  >
) => {
  return useMutation({
    mutationFn: () =>
      sdk.admin.workflowExecution.cancel(workflowId, transactionId),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({
        queryKey: workflowExecutionsQueryKeys.detail(id),
      })
      queryClient.invalidateQueries({
        queryKey: workflowExecutionsQueryKeys.lists(),
      })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
