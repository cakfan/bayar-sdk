import { describe, expect, test } from "bun:test";
import {
	buildInvalidXenditWebhook,
	buildXenditWebhook,
	buildXenditWebhookPayload,
	MOCK_XENDIT_CALLBACK_TOKEN,
} from "../__fixtures__/webhook";
import {
	mapWebhookNormalizedStatus,
	parseXenditWebhook,
	verifyXenditSignature,
	type XenditWebhookPayload,
} from "../src/webhook";

describe("verifyXenditSignature", () => {
	test("token cocok → true", () => {
		const headers = new Headers({
			"x-callback-token": MOCK_XENDIT_CALLBACK_TOKEN,
		});
		expect(verifyXenditSignature(headers, MOCK_XENDIT_CALLBACK_TOKEN)).toBe(
			true,
		);
	});

	test("token beda → false", () => {
		const headers = new Headers({
			"x-callback-token": "another-token-xxxx",
		});
		expect(verifyXenditSignature(headers, MOCK_XENDIT_CALLBACK_TOKEN)).toBe(
			false,
		);
	});

	test("header tidak ada → false", () => {
		expect(
			verifyXenditSignature(new Headers(), MOCK_XENDIT_CALLBACK_TOKEN),
		).toBe(false);
	});
});

describe("parseXenditWebhook", () => {
	test("signature valid + payload valid → WebhookEvent", async () => {
		const { payload, headers } = buildXenditWebhook(
			"pr-order-1",
			"paid",
			MOCK_XENDIT_CALLBACK_TOKEN,
		);
		const event = await parseXenditWebhook(
			payload,
			headers,
			MOCK_XENDIT_CALLBACK_TOKEN,
		);
		expect(event.provider).toBe("xendit");
		expect(event.type).toBe("payment.capture");
		expect(event.chargeId).toBe("pr-order-1");
		expect(event.status).toBe("SUCCEEDED");
		expect(event.normalizedStatus).toBe("paid");
		expect(event.amount).toBe(10000);
	});

	test("signature invalid → WEBHOOK_SIGNATURE_INVALID", async () => {
		const { payload, headers } = buildInvalidXenditWebhook(
			MOCK_XENDIT_CALLBACK_TOKEN,
		);
		await expect(
			parseXenditWebhook(payload, headers, MOCK_XENDIT_CALLBACK_TOKEN),
		).rejects.toMatchObject({ code: "WEBHOOK_SIGNATURE_INVALID" });
	});

	test("payload tanpa data.payment_request_id → INVALID_REQUEST", async () => {
		const { headers } = buildXenditWebhookPayload(
			"pr-1",
			"SUCCEEDED",
			MOCK_XENDIT_CALLBACK_TOKEN,
		);
		await expect(
			parseXenditWebhook(
				{ event: "payment.capture", data: { status: "SUCCEEDED" } },
				headers,
				MOCK_XENDIT_CALLBACK_TOKEN,
			),
		).rejects.toMatchObject({ code: "INVALID_REQUEST" });
	});

	test("payload valid dua kali → id stabil", async () => {
		const { payload, headers } = buildXenditWebhook(
			"pr-order-idem",
			"paid",
			MOCK_XENDIT_CALLBACK_TOKEN,
		);
		const first = await parseXenditWebhook(
			payload,
			headers,
			MOCK_XENDIT_CALLBACK_TOKEN,
		);
		const second = await parseXenditWebhook(
			payload,
			headers,
			MOCK_XENDIT_CALLBACK_TOKEN,
		);
		expect(second.id).toBe(first.id);
	});

	test("data.id tidak ada → fallback hash deterministik", async () => {
		const { headers } = buildXenditWebhookPayload(
			"pr-noid",
			"SUCCEEDED",
			MOCK_XENDIT_CALLBACK_TOKEN,
		);
		const payload = {
			event: "payment.capture",
			created: "2024-02-01T09:00:00Z",
			data: {
				payment_request_id: "pr-noid",
				status: "SUCCEEDED",
				amount: 10000,
			},
		};
		const first = await parseXenditWebhook(
			payload,
			headers,
			MOCK_XENDIT_CALLBACK_TOKEN,
		);
		const second = await parseXenditWebhook(
			payload,
			headers,
			MOCK_XENDIT_CALLBACK_TOKEN,
		);
		expect(second.id).toBe(first.id);
		expect(first.id.startsWith("sdk:")).toBe(true);
	});
});

describe("mapWebhookNormalizedStatus", () => {
	test("payment.capture SUCCEEDED → paid", () => {
		const { payload } = buildXenditWebhookPayload(
			"pr-1",
			"SUCCEEDED",
			MOCK_XENDIT_CALLBACK_TOKEN,
		);
		expect(mapWebhookNormalizedStatus(payload as XenditWebhookPayload)).toBe(
			"paid",
		);
	});

	test("payment.failure FAILED → failed", () => {
		const { payload } = buildXenditWebhookPayload(
			"pr-1",
			"FAILED",
			MOCK_XENDIT_CALLBACK_TOKEN,
			"payment.failure",
		);
		expect(mapWebhookNormalizedStatus(payload as XenditWebhookPayload)).toBe(
			"failed",
		);
	});

	test("refund.succeeded SUCCEEDED → refunded", () => {
		const { payload } = buildXenditWebhookPayload(
			"pr-1",
			"SUCCEEDED",
			MOCK_XENDIT_CALLBACK_TOKEN,
			"refund.succeeded",
		);
		expect(mapWebhookNormalizedStatus(payload as XenditWebhookPayload)).toBe(
			"refunded",
		);
	});
});
