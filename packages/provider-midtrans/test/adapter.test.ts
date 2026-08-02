import { describe, expect, test } from "bun:test";
import type { ChargeRequest } from "@bayar-sdk/core";
import { MockMidtransHttpClient } from "../__fixtures__/mock-client";
import {
	buildInvalidMidtransWebhook,
	buildMidtransWebhook,
	MOCK_MIDTRANS_SERVER_KEY,
} from "../__fixtures__/webhook";
import { MidtransProvider } from "../src/adapter";

function makeProvider(client: MockMidtransHttpClient): MidtransProvider {
	return new MidtransProvider({
		serverKey: MOCK_MIDTRANS_SERVER_KEY,
		httpClient: client,
	});
}

function chargeRequest(referenceId = "order-adapter-1"): ChargeRequest {
	return {
		amount: 10000,
		currency: "IDR",
		paymentMethod: { type: "qris" },
		referenceId,
	};
}

describe("MidtransProvider.createCharge", () => {
	test("POST /v2/charge dan mengembalikan ChargeResult", async () => {
		const client = new MockMidtransHttpClient();
		const provider = makeProvider(client);
		const result = await provider.createCharge(chargeRequest(), {
			idempotencyKey: "idem-1",
		});
		expect(result.provider).toBe("midtrans");
		expect(result.referenceId).toBe("order-adapter-1");
		expect(result.normalizedStatus).toBe("pending");
		expect(client.requests[0]?.url).toContain("/v2/charge");
		expect(client.requests[0]?.init?.method).toBe("POST");
	});

	test("idempotency key sama + payload sama → chargeId sama, hanya 1 request", async () => {
		const client = new MockMidtransHttpClient();
		const provider = makeProvider(client);
		const req = chargeRequest();
		const first = await provider.createCharge(req, {
			idempotencyKey: "idem-same",
		});
		const second = await provider.createCharge(req, {
			idempotencyKey: "idem-same",
		});
		expect(second.chargeId).toBe(first.chargeId);
		const chargeRequests = client.requests.filter((r) =>
			r.url.includes("/charge"),
		);
		expect(chargeRequests).toHaveLength(1);
	});

	test("idempotency key sama + payload beda → DUPLICATE_IDEMPOTENCY_KEY", async () => {
		const client = new MockMidtransHttpClient();
		const provider = makeProvider(client);
		await provider.createCharge(chargeRequest("order-a"), {
			idempotencyKey: "idem-conflict",
		});
		await expect(
			provider.createCharge(chargeRequest("order-b"), {
				idempotencyKey: "idem-conflict",
			}),
		).rejects.toMatchObject({ code: "DUPLICATE_IDEMPOTENCY_KEY" });
	});

	test("idempotency key kosong → INVALID_REQUEST", async () => {
		const provider = makeProvider(new MockMidtransHttpClient());
		await expect(
			provider.createCharge(chargeRequest(), { idempotencyKey: "" }),
		).rejects.toMatchObject({ code: "INVALID_REQUEST" });
	});

	test("response tidak sukses → error termapping", async () => {
		const client = new MockMidtransHttpClient();
		client.chargeStatusCode = 400;
		const provider = makeProvider(client);
		await expect(
			provider.createCharge(chargeRequest(), { idempotencyKey: "idem-err" }),
		).rejects.toMatchObject({
			code: "INVALID_REQUEST",
			providerErrorCode: "400",
		});
	});
});

describe("MidtransProvider.getCharge", () => {
	test("memetakan chargeId → order_id lalu GET status", async () => {
		const client = new MockMidtransHttpClient();
		const provider = makeProvider(client);
		const created = await provider.createCharge(chargeRequest("order-get"), {
			idempotencyKey: "idem-get",
		});
		const fetched = await provider.getCharge(created.chargeId);
		expect(fetched.chargeId).toBe(created.chargeId);
		expect(client.requests[1]?.url).toContain("/v2/order-get/status");
	});

	test("chargeId tidak dikenal → dipakai sebagai order_id langsung", async () => {
		const client = new MockMidtransHttpClient();
		const provider = makeProvider(client);
		const fetched = await provider.getCharge("unknown-order");
		expect(fetched.referenceId).toBe("unknown-order");
	});
});

describe("MidtransProvider.refund", () => {
	test("charge pending → REFUND_NOT_ALLOWED tanpa hit endpoint refund", async () => {
		const client = new MockMidtransHttpClient();
		client.statusTransactionStatus = "pending";
		const provider = makeProvider(client);
		const created = await provider.createCharge(
			chargeRequest("order-refund-pending"),
			{ idempotencyKey: "idem-refund-1" },
		);
		await expect(
			provider.refund(
				{ chargeId: created.chargeId },
				{ idempotencyKey: "refund-key-1" },
			),
		).rejects.toMatchObject({ code: "REFUND_NOT_ALLOWED" });
		expect(client.requests.some((r) => /\/refund/.test(r.url))).toBe(false);
	});

	test("charge paid → full refund sukses", async () => {
		const client = new MockMidtransHttpClient();
		client.statusTransactionStatus = "settlement";
		client.refundStatusCode = 200;
		client.refundBody = {
			status_code: "200",
			order_id: "order-refund-paid",
			refund_amount: "10000.00",
			refund_key: "refund-key-ok",
			transaction_status: "refund",
			transaction_time: "2024-02-01 09:00:00",
		};
		const provider = makeProvider(client);
		const created = await provider.createCharge(
			chargeRequest("order-refund-paid"),
			{ idempotencyKey: "idem-refund-2" },
		);
		const result = await provider.refund(
			{ chargeId: created.chargeId },
			{ idempotencyKey: "refund-key-2" },
		);
		expect(result.normalizedStatus).toBe("succeeded");
		expect(result.refundId).toBe("refund-key-ok");
		const refundUrl = client.requests.find((r) => /\/refund/.test(r.url));
		expect(refundUrl?.url).toBe(
			"https://api.sandbox.midtrans.com/v2/order-refund-paid/refund",
		);
	});

	test("partial refund → URL refund/partial dengan refund_key = idempotencyKey", async () => {
		const client = new MockMidtransHttpClient();
		client.statusTransactionStatus = "settlement";
		client.refundStatusCode = 200;
		client.refundBody = {
			status_code: "200",
			order_id: "order-refund-partial",
			refund_amount: "5000.00",
			refund_key: "refund-key-3",
			transaction_status: "refund",
		};
		const provider = makeProvider(client);
		const created = await provider.createCharge(
			chargeRequest("order-refund-partial"),
			{ idempotencyKey: "idem-refund-3" },
		);
		const result = await provider.refund(
			{ chargeId: created.chargeId, amount: 5000, reason: "Seperti diuji" },
			{ idempotencyKey: "refund-key-3" },
		);
		expect(result.amount).toBe(5000);
		const refundUrl = client.requests.find((r) => /\/refund/.test(r.url));
		expect(refundUrl?.url).toContain(
			"/v2/order-refund-partial/refund/partial/refund-key-3",
		);
	});

	test("idempotency refund sama + payload sama → refundId sama", async () => {
		const client = new MockMidtransHttpClient();
		client.statusTransactionStatus = "settlement";
		client.refundStatusCode = 200;
		client.refundBody = {
			status_code: "200",
			order_id: "order-refund-idem",
			refund_amount: "10000.00",
			refund_key: "refund-key-same",
			transaction_status: "refund",
		};
		const provider = makeProvider(client);
		const created = await provider.createCharge(
			chargeRequest("order-refund-idem"),
			{ idempotencyKey: "idem-refund-4" },
		);
		const req = { chargeId: created.chargeId };
		const first = await provider.refund(req, {
			idempotencyKey: "refund-key-same",
		});
		const second = await provider.refund(req, {
			idempotencyKey: "refund-key-same",
		});
		expect(second.refundId).toBe(first.refundId);
		const refundRequests = client.requests.filter((r) =>
			/\/refund/.test(r.url),
		);
		expect(refundRequests).toHaveLength(1);
	});

	test("idempotency refund sama + payload beda → DUPLICATE_IDEMPOTENCY_KEY", async () => {
		const client = new MockMidtransHttpClient();
		client.statusTransactionStatus = "settlement";
		client.refundStatusCode = 200;
		client.refundBody = {
			status_code: "200",
			order_id: "order-refund-conflict",
			refund_amount: "10000.00",
			refund_key: "refund-key-conflict",
			transaction_status: "refund",
		};
		const provider = makeProvider(client);
		const created = await provider.createCharge(
			chargeRequest("order-refund-conflict"),
			{ idempotencyKey: "idem-refund-5" },
		);
		await provider.refund(
			{ chargeId: created.chargeId, amount: 5000 },
			{
				idempotencyKey: "refund-key-conflict",
			},
		);
		await expect(
			provider.refund(
				{ chargeId: created.chargeId, amount: 9000 },
				{
					idempotencyKey: "refund-key-conflict",
				},
			),
		).rejects.toMatchObject({ code: "DUPLICATE_IDEMPOTENCY_KEY" });
	});
});

describe("MidtransProvider.parseWebhook", () => {
	test("delegasi ke parseMidtransWebhook: valid", async () => {
		const provider = makeProvider(new MockMidtransHttpClient());
		const { payload } = await buildMidtransWebhook(
			"order-wh",
			"paid",
			MOCK_MIDTRANS_SERVER_KEY,
		);
		const event = await provider.parseWebhook(payload, new Headers());
		expect(event.chargeId).toBe("order-wh");
		expect(event.normalizedStatus).toBe("paid");
	});

	test("signature invalid → WEBHOOK_SIGNATURE_INVALID", async () => {
		const provider = makeProvider(new MockMidtransHttpClient());
		const { payload } = await buildInvalidMidtransWebhook(
			MOCK_MIDTRANS_SERVER_KEY,
		);
		await expect(
			provider.parseWebhook(payload, new Headers()),
		).rejects.toMatchObject({ code: "WEBHOOK_SIGNATURE_INVALID" });
	});
});

describe("MidtransProvider.capturePayment", () => {
	test("tidak didukung → CAPTURE_NOT_SUPPORTED", async () => {
		const provider = makeProvider(new MockMidtransHttpClient());
		await expect(provider.capturePayment("charge-1")).rejects.toMatchObject({
			code: "CAPTURE_NOT_SUPPORTED",
		});
	});
});
