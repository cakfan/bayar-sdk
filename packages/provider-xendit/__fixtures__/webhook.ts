import type { PaymentStatus } from "@bayar-sdk/core";
import type { WebhookFixture } from "@bayar-sdk/core/testing";

export const MOCK_XENDIT_SECRET_KEY = "mock-xendit-secret-key-xxxx";
export const MOCK_XENDIT_CALLBACK_TOKEN = "mock-xendit-callback-token-xxxx";

// PaymentStatus (contract) → status mentah Xendit payment request.
const PAYMENT_STATUS_TO_RAW: Record<PaymentStatus, string> = {
	pending: "PENDING",
	paid: "SUCCEEDED",
	failed: "FAILED",
	expired: "EXPIRED",
	cancelled: "CANCELED",
	refunded: "SUCCEEDED",
	partially_refunded: "SUCCEEDED",
	disputed: "SUCCEEDED",
	unknown: "PENDING",
};

export function buildXenditWebhookPayload(
	chargeId: string,
	status: string,
	callbackToken: string,
	event = "payment.capture",
): WebhookFixture {
	return {
		payload: {
			event,
			business_id: "mock-business-xxxx",
			created: "2024-02-01T09:00:00Z",
			data: {
				id: `evt-${chargeId}`,
				payment_id: `py-${chargeId}`,
				payment_request_id: chargeId,
				reference_id: chargeId,
				status,
				amount: 10000,
				currency: "IDR",
				created: "2024-02-01T09:00:00Z",
				updated: "2024-02-01T09:00:00Z",
			},
		},
		headers: new Headers({ "x-callback-token": callbackToken }),
	};
}

export function buildXenditWebhook(
	chargeId: string,
	status: PaymentStatus,
	callbackToken: string,
): WebhookFixture {
	return buildXenditWebhookPayload(
		chargeId,
		PAYMENT_STATUS_TO_RAW[status],
		callbackToken,
	);
}

export function buildInvalidXenditWebhook(
	callbackToken: string,
): WebhookFixture {
	return buildXenditWebhookPayload(
		"mock-pr-invalid",
		"SUCCEEDED",
		`wrong-${callbackToken}`,
	);
}
