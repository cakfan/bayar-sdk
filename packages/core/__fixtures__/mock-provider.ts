import type { PaymentProvider } from "../src/contract";
import { PaymentSDKError } from "../src/errors";
import type {
	ChargeRequest,
	ChargeResult,
	PaymentStatus,
	RefundRequest,
	RefundResult,
	WebhookEvent,
} from "../src/types";

export const MOCK_SIGNATURE_HEADER = "x-mock-signature";
export const MOCK_SIGNATURE_TOKEN = "mock-signature-token-xxxx";

const RAW_TO_NORMALIZED: Record<string, PaymentStatus> = {
	pending: "pending",
	paid: "paid",
	settlement: "paid",
	capture: "paid",
	failed: "failed",
	expired: "expired",
	cancelled: "cancelled",
	refunded: "refunded",
	partially_refunded: "partially_refunded",
	disputed: "disputed",
};

function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i += 1) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

let chargeCounter = 0;

interface IdempotencyEntry<T> {
	fingerprint: string;
	result: T;
}

export class MockPaymentProvider implements PaymentProvider {
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

		chargeCounter += 1;
		const charge: ChargeResult = {
			provider: "mock",
			chargeId: `mock-charge-${chargeCounter}`,
			referenceId: req.referenceId,
			status: "pending",
			normalizedStatus: "pending",
			amount: req.amount,
			currency: req.currency,
			paymentMethod: req.paymentMethod.type,
			createdAt: new Date().toISOString(),
			rawResponse: { id: `mock-charge-${chargeCounter}` },
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
			createdAt: new Date().toISOString(),
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
		if (
			!constantTimeEqual(
				headers.get(MOCK_SIGNATURE_HEADER) ?? "",
				MOCK_SIGNATURE_TOKEN,
			)
		) {
			throw new PaymentSDKError({
				code: "WEBHOOK_SIGNATURE_INVALID",
				provider: "mock",
				message: "Webhook signature is invalid",
			});
		}

		const data = payload as {
			eventId: string;
			chargeId: string;
			rawStatus: string;
			amount?: number;
			timestamp?: string;
		};
		const normalizedStatus = RAW_TO_NORMALIZED[data.rawStatus] ?? "unknown";

		const charge = this.charges.get(data.chargeId);
		if (
			charge &&
			!(charge.normalizedStatus === "paid" && normalizedStatus === "pending")
		) {
			this.charges.set(data.chargeId, {
				...charge,
				status: data.rawStatus,
				normalizedStatus,
			});
		}

		return {
			id: data.eventId,
			provider: "mock",
			type: "payment.status",
			chargeId: data.chargeId,
			status: data.rawStatus,
			normalizedStatus,
			amount: data.amount,
			timestamp: data.timestamp ?? new Date().toISOString(),
			rawPayload: payload,
		};
	}
}
