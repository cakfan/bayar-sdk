import type {
	ChargeRequest,
	ChargeResult,
	RefundRequest,
	RefundResult,
	WebhookEvent,
} from "./types";

export interface PaymentProvider {
	createCharge(
		req: ChargeRequest,
		opts: { idempotencyKey: string },
	): Promise<ChargeResult>;

	getCharge(chargeId: string): Promise<ChargeResult>;

	refund(
		req: RefundRequest,
		opts: { idempotencyKey: string },
	): Promise<RefundResult>;

	parseWebhook(payload: unknown, headers: Headers): WebhookEvent;

	capturePayment?(chargeId: string): Promise<ChargeResult>;
}
