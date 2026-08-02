import { describe, expect, test } from "bun:test";
import type { ChargeRequest } from "@bayar-sdk/core";
import { MockXenditHttpClient } from "../__fixtures__/mock-client";
import {
	buildInvalidXenditWebhook,
	buildXenditWebhook,
	MOCK_XENDIT_CALLBACK_TOKEN,
	MOCK_XENDIT_SECRET_KEY,
} from "../__fixtures__/webhook";
import { XenditProvider } from "../src/adapter";

function makeProvider(client: MockXenditHttpClient): XenditProvider {
	return new XenditProvider({
		secretKey: MOCK_XENDIT_SECRET_KEY,
		callbackToken: MOCK_XENDIT_CALLBACK_TOKEN,
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

describe("XenditProvider.createCharge", () => {
	test("POST /v3/payment_requests dengan api-version dan mengembalikan ChargeResult", async () => {
		const client = new MockXenditHttpClient();
		const provider = makeProvider(client);
		const result = await provider.createCharge(chargeRequest(), {
			idempotencyKey: "idem-1",
		});
		expect(result.provider).toBe("xendit");
		expect(result.referenceId).toBe("order-adapter-1");
		expect(result.normalizedStatus).toBe("pending");
		const request = client.requests[0];
		expect(request?.url).toContain("/v3/payment_requests");
		expect(request?.init?.method).toBe("POST");
		const headers = request?.init?.headers as Headers | undefined;
		expect(headers?.get("api-version")).toBe("2024-11-11");
		expect(headers?.get("idempotency-key")).toBe("idem-1");
	});

	test("idempotency key sama + payload sama → chargeId sama, hanya 1 request", async () => {
		const client = new MockXenditHttpClient();
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
			r.url.includes("/payment_requests"),
		);
		expect(chargeRequests).toHaveLength(1);
	});

	test("idempotency key sama + payload beda → DUPLICATE_IDEMPOTENCY_KEY", async () => {
		const client = new MockXenditHttpClient();
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
		const provider = makeProvider(new MockXenditHttpClient());
		await expect(
			provider.createCharge(chargeRequest(), { idempotencyKey: "" }),
		).rejects.toMatchObject({ code: "INVALID_REQUEST" });
	});

	test("response tidak sukses → error termapping", async () => {
		const client = new MockXenditHttpClient();
		client.chargeStatusCode = 400;
		const provider = makeProvider(client);
		await expect(
			provider.createCharge(chargeRequest(), { idempotencyKey: "idem-err" }),
		).rejects.toMatchObject({
			code: "INVALID_REQUEST",
			providerErrorCode: "API_VALIDATION_ERROR",
		});
	});
});

describe("XenditProvider.getCharge", () => {
	test("mengambil payment request by id", async () => {
		const client = new MockXenditHttpClient();
		const provider = makeProvider(client);
		const created = await provider.createCharge(chargeRequest("order-get"), {
			idempotencyKey: "idem-get",
		});
		const fetched = await provider.getCharge(created.chargeId);
		expect(fetched.chargeId).toBe(created.chargeId);
		expect(client.requests[1]?.url).toContain(
			`/v3/payment_requests/${created.chargeId}`,
		);
	});

	test("chargeId tidak dikenal → dipakai apa adanya", async () => {
		const client = new MockXenditHttpClient();
		const provider = makeProvider(client);
		const fetched = await provider.getCharge("pr-unknown-1");
		expect(fetched.referenceId).toBe("pr-unknown-1");
	});
});

describe("XenditProvider.refund", () => {
	test("charge pending → REFUND_NOT_ALLOWED tanpa hit endpoint refund", async () => {
		const client = new MockXenditHttpClient();
		client.statusStatus = "PENDING";
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
		expect(client.requests.some((r) => r.url.includes("/refunds"))).toBe(false);
	});

	test("charge paid → full refund sukses", async () => {
		const client = new MockXenditHttpClient();
		client.statusStatus = "SUCCEEDED";
		client.refundStatusCode = 200;
		client.refundBody = {
			id: "rfd-refund-ok",
			payment_request_id: "pr-mock-1",
			amount: 10000,
			currency: "IDR",
			status: "SUCCEEDED",
			reason: "REQUESTED_BY_CUSTOMER",
			created: "2024-02-01T08:30:00Z",
			updated: "2024-02-01T08:30:00Z",
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
		expect(result.refundId).toBe("rfd-refund-ok");
		const refundRequest = client.requests.find((r) =>
			r.url.includes("/refunds"),
		);
		expect(refundRequest?.url).toBe("https://api.xendit.co/refunds");
		const body = JSON.parse(String(refundRequest?.init?.body)) as Record<
			string,
			unknown
		>;
		expect(body.payment_request_id).toBe(created.chargeId);
		expect(body.reason).toBe("REQUESTED_BY_CUSTOMER");
		expect(body.amount).toBeUndefined();
	});

	test("partial refund → amount dikirim", async () => {
		const client = new MockXenditHttpClient();
		client.statusStatus = "SUCCEEDED";
		client.refundStatusCode = 200;
		client.refundBody = {
			id: "rfd-refund-partial",
			payment_request_id: "pr-mock-1",
			amount: 5000,
			currency: "IDR",
			status: "SUCCEEDED",
			reason: "REQUESTED_BY_CUSTOMER",
			created: "2024-02-01T08:30:00Z",
			updated: "2024-02-01T08:30:00Z",
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
		const refundRequest = client.requests.find((r) =>
			r.url.includes("/refunds"),
		);
		const body = JSON.parse(String(refundRequest?.init?.body)) as Record<
			string,
			unknown
		>;
		expect(body.amount).toBe(5000);
		expect(body.reason).toBe("Seperti diuji");
	});

	test("idempotency refund sama + payload sama → refundId sama", async () => {
		const client = new MockXenditHttpClient();
		client.statusStatus = "SUCCEEDED";
		client.refundStatusCode = 200;
		client.refundBody = {
			id: "rfd-refund-idem",
			payment_request_id: "pr-mock-1",
			amount: 10000,
			currency: "IDR",
			status: "SUCCEEDED",
			created: "2024-02-01T08:30:00Z",
			updated: "2024-02-01T08:30:00Z",
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
			r.url.includes("/refunds"),
		);
		expect(refundRequests).toHaveLength(1);
	});

	test("idempotency refund sama + payload beda → DUPLICATE_IDEMPOTENCY_KEY", async () => {
		const client = new MockXenditHttpClient();
		client.statusStatus = "SUCCEEDED";
		client.refundStatusCode = 200;
		client.refundBody = {
			id: "rfd-refund-conflict",
			payment_request_id: "pr-mock-1",
			amount: 10000,
			currency: "IDR",
			status: "SUCCEEDED",
			created: "2024-02-01T08:30:00Z",
			updated: "2024-02-01T08:30:00Z",
		};
		const provider = makeProvider(client);
		const created = await provider.createCharge(
			chargeRequest("order-refund-conflict"),
			{ idempotencyKey: "idem-refund-5" },
		);
		await provider.refund(
			{ chargeId: created.chargeId, amount: 5000 },
			{ idempotencyKey: "refund-key-conflict" },
		);
		await expect(
			provider.refund(
				{ chargeId: created.chargeId, amount: 9000 },
				{ idempotencyKey: "refund-key-conflict" },
			),
		).rejects.toMatchObject({ code: "DUPLICATE_IDEMPOTENCY_KEY" });
	});
});

describe("XenditProvider.parseWebhook", () => {
	test("delegasi ke parseXenditWebhook: valid", async () => {
		const provider = makeProvider(new MockXenditHttpClient());
		const { payload, headers } = buildXenditWebhook(
			"pr-order-wh",
			"paid",
			MOCK_XENDIT_CALLBACK_TOKEN,
		);
		const event = await provider.parseWebhook(payload, headers);
		expect(event.chargeId).toBe("pr-order-wh");
		expect(event.normalizedStatus).toBe("paid");
	});

	test("signature invalid → WEBHOOK_SIGNATURE_INVALID", async () => {
		const provider = makeProvider(new MockXenditHttpClient());
		const { payload, headers } = buildInvalidXenditWebhook(
			MOCK_XENDIT_CALLBACK_TOKEN,
		);
		await expect(provider.parseWebhook(payload, headers)).rejects.toMatchObject(
			{ code: "WEBHOOK_SIGNATURE_INVALID" },
		);
	});
});

describe("XenditProvider.capturePayment", () => {
	test("tidak didukung → CAPTURE_NOT_SUPPORTED", async () => {
		const provider = makeProvider(new MockXenditHttpClient());
		await expect(provider.capturePayment("charge-1")).rejects.toMatchObject({
			code: "CAPTURE_NOT_SUPPORTED",
		});
	});
});
