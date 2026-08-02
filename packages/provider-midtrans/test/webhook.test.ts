import { describe, expect, test } from "bun:test";
import { PaymentSDKError } from "@bayar-sdk/core";
import {
	buildInvalidMidtransWebhook,
	buildMidtransWebhook,
	MOCK_MIDTRANS_SERVER_KEY,
} from "../__fixtures__/webhook";
import {
	computeMidtransSignature,
	parseMidtransWebhook,
	verifyMidtransSignature,
} from "../src/webhook";

describe("computeMidtransSignature", () => {
	test("deterministik untuk input yang sama", async () => {
		const a = await computeMidtransSignature(
			"order-1",
			"200",
			"10000.00",
			"mock-server-key-xxxx",
		);
		const b = await computeMidtransSignature(
			"order-1",
			"200",
			"10000.00",
			"mock-server-key-xxxx",
		);
		expect(a).toBe(b);
		expect(a).toHaveLength(128);
	});

	test("serverKey berbeda menghasilkan signature berbeda", async () => {
		const a = await computeMidtransSignature(
			"order-1",
			"200",
			"10000.00",
			"key-a",
		);
		const b = await computeMidtransSignature(
			"order-1",
			"200",
			"10000.00",
			"key-b",
		);
		expect(a).not.toBe(b);
	});
});

describe("verifyMidtransSignature", () => {
	test("signature valid → true", async () => {
		const { payload } = await buildMidtransWebhook(
			"order-1",
			"paid",
			MOCK_MIDTRANS_SERVER_KEY,
		);
		expect(
			await verifyMidtransSignature(payload, MOCK_MIDTRANS_SERVER_KEY),
		).toBe(true);
	});

	test("signature invalid → false", async () => {
		const { payload } = await buildInvalidMidtransWebhook(
			MOCK_MIDTRANS_SERVER_KEY,
		);
		expect(
			await verifyMidtransSignature(payload, MOCK_MIDTRANS_SERVER_KEY),
		).toBe(false);
	});

	test("payload bukan objek webhook → false (bukan throw)", async () => {
		expect(await verifyMidtransSignature(null, MOCK_MIDTRANS_SERVER_KEY)).toBe(
			false,
		);
	});
});

describe("parseMidtransWebhook", () => {
	test("payload valid → WebhookEvent ternormalisasi", async () => {
		const { payload } = await buildMidtransWebhook(
			"order-1",
			"paid",
			MOCK_MIDTRANS_SERVER_KEY,
		);
		const event = await parseMidtransWebhook(payload, MOCK_MIDTRANS_SERVER_KEY);
		expect(event.provider).toBe("midtrans");
		expect(event.chargeId).toBe("mock-event-order-1");
		expect(event.status).toBe("settlement");
		expect(event.normalizedStatus).toBe("paid");
		expect(event.amount).toBe(10000);
		expect(event.rawPayload).toBe(payload);
	});

	test("id stabil untuk payload identik yang diparse dua kali", async () => {
		const { payload } = await buildMidtransWebhook(
			"order-1",
			"paid",
			MOCK_MIDTRANS_SERVER_KEY,
		);
		const first = await parseMidtransWebhook(payload, MOCK_MIDTRANS_SERVER_KEY);
		const second = await parseMidtransWebhook(
			payload,
			MOCK_MIDTRANS_SERVER_KEY,
		);
		expect(second.id).toBe(first.id);
	});

	test("tanpa transaction_id → fallback id sdk: yang deterministik", async () => {
		const signatureKey = await computeMidtransSignature(
			"order-x",
			"200",
			"10000.00",
			MOCK_MIDTRANS_SERVER_KEY,
		);
		const payload = {
			order_id: "order-x",
			status_code: "200",
			gross_amount: "10000.00",
			signature_key: signatureKey,
			transaction_status: "pending",
			transaction_time: "2024-02-01 09:00:00",
		};
		const first = await parseMidtransWebhook(payload, MOCK_MIDTRANS_SERVER_KEY);
		const second = await parseMidtransWebhook(
			payload,
			MOCK_MIDTRANS_SERVER_KEY,
		);
		expect(first.id).toMatch(/^sdk:/);
		expect(second.id).toBe(first.id);
		expect(first.chargeId).toBe("order-x");
	});

	test("signature invalid → WEBHOOK_SIGNATURE_INVALID", async () => {
		const { payload } = await buildInvalidMidtransWebhook(
			MOCK_MIDTRANS_SERVER_KEY,
		);
		await expect(
			parseMidtransWebhook(payload, MOCK_MIDTRANS_SERVER_KEY),
		).rejects.toMatchObject({ code: "WEBHOOK_SIGNATURE_INVALID" });
	});

	test("payload malformed → INVALID_REQUEST", async () => {
		await expect(
			parseMidtransWebhook(null, MOCK_MIDTRANS_SERVER_KEY),
		).rejects.toMatchObject({ code: "INVALID_REQUEST" });
		await expect(
			parseMidtransWebhook({ foo: "bar" }, MOCK_MIDTRANS_SERVER_KEY),
		).rejects.toMatchObject({ code: "INVALID_REQUEST" });
	});

	test("error yang dilempar adalah PaymentSDKError", async () => {
		const { payload } = await buildInvalidMidtransWebhook(
			MOCK_MIDTRANS_SERVER_KEY,
		);
		let err: unknown;
		try {
			await parseMidtransWebhook(payload, MOCK_MIDTRANS_SERVER_KEY);
		} catch (e) {
			err = e;
		}
		expect(err).toBeInstanceOf(PaymentSDKError);
	});
});
