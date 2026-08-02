import type { PaymentStatus } from "@bayar-sdk/core";
import type { WebhookFixture } from "@bayar-sdk/core/testing";
import { computeMidtransSignature } from "../src/webhook";

export const MOCK_MIDTRANS_SERVER_KEY = "mock-server-key-xxxx";

// PaymentStatus (contract) → transaction_status mentah Midtrans.
const PAYMENT_STATUS_TO_RAW: Record<PaymentStatus, string> = {
	pending: "pending",
	paid: "settlement",
	failed: "deny",
	expired: "expire",
	cancelled: "cancel",
	refunded: "refund",
	partially_refunded: "partial_refund",
	disputed: "chargeback",
	unknown: "unknown",
};

export function buildMidtransWebhookPayload(
	chargeId: string,
	status: string,
	_serverKey: string,
	signatureKey: string,
): Record<string, unknown> {
	return {
		transaction_time: "2024-02-01 09:00:00",
		transaction_status: status,
		transaction_id: `mock-event-${chargeId}`,
		status_message: "midtrans payment notification",
		status_code: "200",
		signature_key: signatureKey,
		payment_type: "qris",
		order_id: chargeId,
		merchant_id: "mock-merchant-xxxx",
		gross_amount: "10000.00",
		fraud_status: "accept",
		currency: "IDR",
	};
}

export async function buildMidtransWebhook(
	chargeId: string,
	status: PaymentStatus,
	serverKey: string,
): Promise<WebhookFixture> {
	const signatureKey = await computeMidtransSignature(
		chargeId,
		"200",
		"10000.00",
		serverKey,
	);
	return {
		payload: buildMidtransWebhookPayload(
			chargeId,
			PAYMENT_STATUS_TO_RAW[status],
			serverKey,
			signatureKey,
		),
		headers: new Headers(),
	};
}

export async function buildInvalidMidtransWebhook(
	serverKey: string,
): Promise<WebhookFixture> {
	return {
		payload: buildMidtransWebhookPayload(
			"mock-order-invalid",
			"paid",
			serverKey,
			"0".repeat(128),
		),
		headers: new Headers(),
	};
}
