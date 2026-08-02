import type {
	ChargeRequest,
	ChargeResult,
	PaymentProvider,
	RefundRequest,
	RefundResult,
	WebhookEvent,
} from "@bayar-sdk/core";
import { PaymentSDKError } from "@bayar-sdk/core";

export const MOCK_SIGNATURE_HEADER = "x-mock-signature";
export const MOCK_SIGNATURE_TOKEN = "mock-signature-token-xxxx";

interface IdempotencyEntry<T> {
	fingerprint: string;
	result: T;
}

export class MockPaymentProvider implements PaymentProvider {
	private counter = 0;
	private readonly charges = new Map<string, ChargeResult>();
	private readonly chargeIdempotency = new Map<
		string,
		IdempotencyEntry<ChargeResult>
	>();
	private readonly refundIdempotency = new Map<
		string,
		IdempotencyEntry<RefundResult>
	>();

	async createCharge(
		req: ChargeRequest,
		opts: { idempotencyKey: string },
	): Promise<ChargeResult> {
		const fingerprint = JSON.stringify(req);
		const existing = this.chargeIdempotency.get(opts.idempotencyKey);
		if (existing) {
			if (existing.fingerprint !== fingerprint) {
				throw new PaymentSDKError({
					code: "DUPLICATE_IDEMPOTENCY_KEY",
					provider: "mock",
					message: "Idempotency key already used with a different payload",
				});
			}
			return existing.result;
		}
		this.counter += 1;
		const charge: ChargeResult = {
			provider: "mock",
			chargeId: `mock-charge-${this.counter}`,
			referenceId: req.referenceId,
			status: "pending",
			normalizedStatus: "pending",
			amount: req.amount,
			currency: req.currency,
			paymentMethod: req.paymentMethod.type,
			createdAt: "2024-01-01T00:00:00.000Z",
			rawResponse: { id: `mock-charge-${this.counter}` },
		};
		this.charges.set(charge.chargeId, charge);
		this.chargeIdempotency.set(opts.idempotencyKey, {
			fingerprint,
			result: charge,
		});
		return charge;
	}

	async getCharge(chargeId: string): Promise<ChargeResult> {
		const charge = this.charges.get(chargeId);
		if (!charge) {
			throw new PaymentSDKError({
				code: "CHARGE_NOT_FOUND",
				provider: "mock",
				message: `Charge ${chargeId} not found`,
			});
		}
		return charge;
	}

	async refund(
		req: RefundRequest,
		opts: { idempotencyKey: string },
	): Promise<RefundResult> {
		const charge = this.charges.get(req.chargeId);
		if (!charge) {
			throw new PaymentSDKError({
				code: "CHARGE_NOT_FOUND",
				provider: "mock",
				message: `Charge ${req.chargeId} not found`,
			});
		}
		if (charge.normalizedStatus !== "paid") {
			throw new PaymentSDKError({
				code: "REFUND_NOT_ALLOWED",
				provider: "mock",
				message: "Refund is only allowed for paid charges",
			});
		}
		const fingerprint = JSON.stringify(req);
		const existing = this.refundIdempotency.get(opts.idempotencyKey);
		if (existing) {
			if (existing.fingerprint !== fingerprint) {
				throw new PaymentSDKError({
					code: "DUPLICATE_IDEMPOTENCY_KEY",
					provider: "mock",
					message: "Idempotency key already used with a different payload",
				});
			}
			return existing.result;
		}
		const refund: RefundResult = {
			provider: "mock",
			refundId: `mock-refund-${charge.chargeId}`,
			chargeId: charge.chargeId,
			amount: req.amount ?? charge.amount,
			status: "pending",
			normalizedStatus: "pending",
			createdAt: "2024-01-01T00:00:00.000Z",
			rawResponse: { id: `mock-refund-${charge.chargeId}` },
		};
		this.refundIdempotency.set(opts.idempotencyKey, {
			fingerprint,
			result: refund,
		});
		return refund;
	}

	async parseWebhook(
		payload: unknown,
		headers: Headers,
	): Promise<WebhookEvent> {
		if (headers.get(MOCK_SIGNATURE_HEADER) !== MOCK_SIGNATURE_TOKEN) {
			throw new PaymentSDKError({
				code: "WEBHOOK_SIGNATURE_INVALID",
				provider: "mock",
				message: "Webhook signature is invalid",
			});
		}
		const data = payload as {
			eventId?: string;
			chargeId?: string;
			status?: string;
		};
		if (typeof data.chargeId !== "string" || typeof data.status !== "string") {
			throw new PaymentSDKError({
				code: "INVALID_REQUEST",
				provider: "mock",
				message: "Webhook payload is malformed",
			});
		}
		const charge = this.charges.get(data.chargeId);
		if (charge) {
			const normalizedStatus = data.status === "SUCCEEDED" ? "paid" : "pending";
			this.charges.set(data.chargeId, {
				...charge,
				status: data.status,
				normalizedStatus,
			});
		}
		return {
			id: data.eventId ?? `evt-${data.chargeId}`,
			provider: "mock",
			type: "payment.status",
			chargeId: data.chargeId,
			status: data.status,
			normalizedStatus: data.status === "SUCCEEDED" ? "paid" : "pending",
			timestamp: "2024-01-01T00:00:00.000Z",
			rawPayload: payload,
		};
	}
}
