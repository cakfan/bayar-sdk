import { describe, expect, test } from "bun:test";
import { createPaymentRoutes } from "../src/middleware";
import {
	MOCK_SIGNATURE_HEADER,
	MOCK_SIGNATURE_TOKEN,
	MockPaymentProvider,
} from "./mock-provider";

function makeApp() {
	const provider = new MockPaymentProvider();
	const app = createPaymentRoutes({
		providers: { mock: provider },
		defaultProvider: "mock",
	});
	return { app, provider };
}

function validChargeBody(referenceId = "order-1"): Record<string, unknown> {
	return {
		amount: 10000,
		currency: "IDR",
		paymentMethod: { type: "qris" },
		referenceId,
	};
}

async function postJson(
	app: ReturnType<typeof makeApp>["app"],
	path: string,
	body: unknown,
	extraHeaders: Record<string, string> = {},
): Promise<Response> {
	return await app.request(path, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"idempotency-key": "idem-1",
			...extraHeaders,
		},
		body: JSON.stringify(body),
	});
}

describe("POST /charges", () => {
	test("body valid → 201 dengan ChargeResult", async () => {
		const { app } = makeApp();
		const res = await postJson(app, "/charges", validChargeBody("order-ok"));
		expect(res.status).toBe(201);
		const data = (await res.json()) as {
			chargeId: string;
			referenceId: string;
			normalizedStatus: string;
		};
		expect(data.chargeId).toBe("mock-charge-1");
		expect(data.referenceId).toBe("order-ok");
		expect(data.normalizedStatus).toBe("pending");
	});

	test("tanpa header Idempotency-Key → 400 VALIDATION_ERROR", async () => {
		const { app } = makeApp();
		const res = await app.request("/charges", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(validChargeBody()),
		});
		expect(res.status).toBe(400);
		const data = (await res.json()) as {
			error: { code: string };
		};
		expect(data.error.code).toBe("VALIDATION_ERROR");
	});

	test("body bukan JSON → 400 VALIDATION_ERROR", async () => {
		const { app } = makeApp();
		const res = await app.request("/charges", {
			method: "POST",
			headers: { "idempotency-key": "idem-1" },
			body: "not-json",
		});
		expect(res.status).toBe(400);
	});

	test("body invalid (amount negatif) → 400 VALIDATION_ERROR", async () => {
		const { app } = makeApp();
		const res = await postJson(app, "/charges", {
			...validChargeBody(),
			amount: -5,
		});
		expect(res.status).toBe(400);
		const data = (await res.json()) as {
			error: { code: string };
		};
		expect(data.error.code).toBe("VALIDATION_ERROR");
	});

	test("body invalid (paymentMethod type tidak dikenal) → 400", async () => {
		const { app } = makeApp();
		const res = await postJson(app, "/charges", {
			...validChargeBody(),
			paymentMethod: { type: "crypto" },
		});
		expect(res.status).toBe(400);
	});

	test("idempotency key sama + payload beda → 409 DUPLICATE_IDEMPOTENCY_KEY", async () => {
		const { app } = makeApp();
		const first = await postJson(app, "/charges", validChargeBody("order-a"));
		expect(first.status).toBe(201);
		const second = await postJson(app, "/charges", validChargeBody("order-b"));
		expect(second.status).toBe(409);
		const data = (await second.json()) as { error: { code: string } };
		expect(data.error.code).toBe("DUPLICATE_IDEMPOTENCY_KEY");
	});

	test("defaultProvider tidak dikonfigurasi → 500 UNKNOWN", async () => {
		const provider = new MockPaymentProvider();
		const app = createPaymentRoutes({
			providers: { mock: provider },
		});
		const res = await postJson(app, "/charges", validChargeBody());
		expect(res.status).toBe(500);
		const data = (await res.json()) as { error: { code: string } };
		expect(data.error.code).toBe("UNKNOWN");
	});
});

describe("GET /charges/:id", () => {
	test("charge ada → 200 dengan ChargeResult", async () => {
		const { app } = makeApp();
		await postJson(app, "/charges", validChargeBody("order-get"));
		const res = await app.request("/charges/mock-charge-1", {
			method: "GET",
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as { chargeId: string };
		expect(data.chargeId).toBe("mock-charge-1");
	});

	test("charge tidak ada → 404 CHARGE_NOT_FOUND", async () => {
		const { app } = makeApp();
		const res = await app.request("/charges/mock-charge-unknown", {
			method: "GET",
		});
		expect(res.status).toBe(404);
		const data = (await res.json()) as { error: { code: string } };
		expect(data.error.code).toBe("CHARGE_NOT_FOUND");
	});
});

describe("POST /charges/:id/refund", () => {
	async function markPaid(
		app: ReturnType<typeof makeApp>["app"],
	): Promise<void> {
		await postJson(app, "/charges", validChargeBody("order-refund"));
		const res = await app.request("/webhooks/mock", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				[MOCK_SIGNATURE_HEADER]: MOCK_SIGNATURE_TOKEN,
			},
			body: JSON.stringify({
				eventId: "evt-paid-1",
				chargeId: "mock-charge-1",
				status: "SUCCEEDED",
			}),
		});
		expect(res.status).toBe(200);
	}

	test("charge pending → 422 REFUND_NOT_ALLOWED", async () => {
		const { app } = makeApp();
		await postJson(app, "/charges", validChargeBody("order-refund-pending"));
		const res = await postJson(app, "/charges/mock-charge-1/refund", {
			amount: 5000,
		});
		expect(res.status).toBe(422);
		const data = (await res.json()) as { error: { code: string } };
		expect(data.error.code).toBe("REFUND_NOT_ALLOWED");
	});

	test("tanpa header Idempotency-Key → 400", async () => {
		const { app } = makeApp();
		await postJson(app, "/charges", validChargeBody("order-refund-nokey"));
		const res = await app.request("/charges/mock-charge-1/refund", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ amount: 5000 }),
		});
		expect(res.status).toBe(400);
	});

	test("charge paid → 200 dengan RefundResult", async () => {
		const { app } = makeApp();
		await markPaid(app);
		const res = await postJson(app, "/charges/mock-charge-1/refund", {
			amount: 5000,
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as {
			refundId: string;
			chargeId: string;
			amount: number;
		};
		expect(data.refundId).toBe("mock-refund-mock-charge-1");
		expect(data.chargeId).toBe("mock-charge-1");
		expect(data.amount).toBe(5000);
	});
});

describe("POST /webhooks/:provider", () => {
	test("signature valid → 200 dengan WebhookEvent", async () => {
		const { app } = makeApp();
		const res = await app.request("/webhooks/mock", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				[MOCK_SIGNATURE_HEADER]: MOCK_SIGNATURE_TOKEN,
			},
			body: JSON.stringify({
				eventId: "evt-1",
				chargeId: "mock-charge-1",
				status: "SUCCEEDED",
			}),
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as {
			id: string;
			normalizedStatus: string;
		};
		expect(data.id).toBe("evt-1");
		expect(data.normalizedStatus).toBe("paid");
	});

	test("signature invalid → 401 WEBHOOK_SIGNATURE_INVALID", async () => {
		const { app } = makeApp();
		const res = await app.request("/webhooks/mock", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				[MOCK_SIGNATURE_HEADER]: "wrong-token-xxxx",
			},
			body: JSON.stringify({
				eventId: "evt-bad",
				chargeId: "mock-charge-1",
				status: "SUCCEEDED",
			}),
		});
		expect(res.status).toBe(401);
		const data = (await res.json()) as { error: { code: string } };
		expect(data.error.code).toBe("WEBHOOK_SIGNATURE_INVALID");
	});

	test("provider tidak dikenal → 404", async () => {
		const { app } = makeApp();
		const res = await app.request("/webhooks/unknown", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(404);
	});
});
