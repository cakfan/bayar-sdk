import type { PaymentStatus } from "../src/types";
import { MOCK_SIGNATURE_HEADER, MOCK_SIGNATURE_TOKEN } from "./mock-provider";

export function buildMockWebhook(
	chargeId: string,
	status: PaymentStatus,
): { payload: unknown; headers: Headers } {
	return {
		payload: {
			eventId: `mock-event-${chargeId}`,
			chargeId,
			rawStatus: status,
			amount: 10000,
			timestamp: "2024-01-01T00:00:00.000Z",
		},
		headers: new Headers({ [MOCK_SIGNATURE_HEADER]: MOCK_SIGNATURE_TOKEN }),
	};
}

export function buildInvalidMockWebhook(): {
	payload: unknown;
	headers: Headers;
} {
	return {
		payload: {
			eventId: "mock-event-invalid",
			chargeId: "mock-charge-invalid",
			rawStatus: "paid",
			amount: 10000,
			timestamp: "2024-01-01T00:00:00.000Z",
		},
		headers: new Headers({ [MOCK_SIGNATURE_HEADER]: "wrong-token-xxxx" }),
	};
}
