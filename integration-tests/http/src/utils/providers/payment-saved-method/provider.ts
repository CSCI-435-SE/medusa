import crypto from "crypto"
import {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import {
  AbstractPaymentProvider,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"

export const SAVED_PAYMENT_METHOD_ID = "pm_saved_card"
export const DECLINED_PAYMENT_METHOD_ID = "pm_declined"

/**
 * A test payment provider that simulates a provider with saved payment
 * methods, like Stripe.
 *
 * - When authorized without a `payment_method` in its data, the customer is
 *   considered to have entered a card, which is returned as `payment_method`
 *   along with the session's `setup_future_usage`.
 * - When authorized with `payment_method: "pm_declined"`, such as an
 *   off-session renewal charge, the payment is declined.
 */
export class SavedMethodPaymentProvider extends AbstractPaymentProvider {
  static identifier = "saved-method"

  constructor(cradle: Record<string, unknown>, config = {}) {
    // @ts-ignore - AbstractPaymentProvider has protected constructor
    super(cradle, config)
  }

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    return { data: { ...input.data }, id: crypto.randomUUID() }
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const paymentMethod = input.data?.payment_method ?? SAVED_PAYMENT_METHOD_ID

    if (paymentMethod === DECLINED_PAYMENT_METHOD_ID) {
      return {
        data: { ...input.data },
        status: PaymentSessionStatus.ERROR,
      }
    }

    return {
      data: {
        ...input.data,
        payment_method: paymentMethod,
        setup_future_usage: input.data?.setup_future_usage ?? null,
      },
      status: PaymentSessionStatus.AUTHORIZED,
    }
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    return { data: input.data ?? {} }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    return { data: input.data ?? {} }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: input.data ?? {} }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data ?? {} }
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    return { status: PaymentSessionStatus.AUTHORIZED }
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    return {}
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    return { data: input.data ?? {} }
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    return { action: PaymentActions.NOT_SUPPORTED }
  }
}

export default SavedMethodPaymentProvider
