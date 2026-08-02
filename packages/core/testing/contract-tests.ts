/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import type { PaymentProvider } from "../src/contract";
import type { ChargeRequest, PaymentStatus } from "../src/types";

export interface WebhookFixture {
	payload: unknown;
	headers: Headers;
}

export interface ContractTestOptions {
	webhook: {
		valid: WebhookFixture;
		invalid: WebhookFixture;
		build: (
			chargeId: string,
			status: PaymentStatus,
		) => WebhookFixture | Promise<WebhookFixture>;
	};
}

function buildChargeRequest(referenceId: string): ChargeRequest {
	return {
		amount: 10000,
		currency: "IDR",
		paymentMethod: { type: "virtual_account", bank: "BCA" },
		referenceId,
	};
}

export function runProviderContractTests(
	factory: () => PaymentProvider,
	options: ContractTestOptions,
): void {
	describe("contract: createCharge", () => {
		test("idempotency key sama + payload sama → chargeId identik", async () => {
			const provider = factory();
			const req = buildChargeRequest("contract-ref-idem-same");
			const idempotencyKey = "contract-idem-same";
			const first = await provider.createCharge(req, { idempotencyKey });
			const second = await provider.createCharge(req, { idempotencyKey });
			expect(second.chargeId).toBe(first.chargeId);
			expect(second.referenceId).toBe(req.referenceId);
		});

		test("idempotency key sama + payload beda → DUPLICATE_IDEMPOTENCY_KEY", async () => {
			const provider = factory();
			const idempotencyKey = "contract-idem-conflict";
			await provider.createCharge(buildChargeRequest("contract-ref-idem-1"), {
				idempotencyKey,
			});
			await expect(
				provider.createCharge(buildChargeRequest("contract-ref-idem-2"), {
					idempotencyKey,
				}),
			).rejects.toMatchObject({ code: "DUPLICATE_IDEMPOTENCY_KEY" });
		});
	});

	describe("contract: getCharge", () => {
		test("mengembalikan charge yang sudah dibuat", async () => {
			const provider = factory();
			const created = await provider.createCharge(
				buildChargeRequest("contract-ref-get"),
				{ idempotencyKey: "contract-idem-get" },
			);
			const fetched = await provider.getCharge(created.chargeId);
			expect(fetched.chargeId).toBe(created.chargeId);
		});
	});

	describe("contract: refund", () => {
		test("charge berstatus pending → REFUND_NOT_ALLOWED", async () => {
			const provider = factory();
			const charge = await provider.createCharge(
				buildChargeRequest("contract-ref-refund"),
				{ idempotencyKey: "contract-idem-refund" },
			);
			await expect(
				provider.refund(
					{ chargeId: charge.chargeId },
					{ idempotencyKey: "contract-refund-key" },
				),
			).rejects.toMatchObject({ code: "REFUND_NOT_ALLOWED" });
		});
	});

	describe("contract: parseWebhook", () => {
		test("signature invalid → WEBHOOK_SIGNATURE_INVALID", async () => {
			const provider = factory();
			const { payload, headers } = options.webhook.invalid;
			await expect(
				provider.parseWebhook(payload, headers),
			).rejects.toMatchObject({ code: "WEBHOOK_SIGNATURE_INVALID" });
		});

		test("signature valid + payload sama dua kali → WebhookEvent.id stabil", async () => {
			const provider = factory();
			const { payload, headers } = options.webhook.valid;
			const first = await provider.parseWebhook(payload, headers);
			const second = await provider.parseWebhook(payload, headers);
			expect(second.id).toBe(first.id);
			expect(second.id.length).toBeGreaterThan(0);
		});
	});

	describe("contract: state machine", () => {
		test("tidak ada transisi paid → pending (state machine §8)", async () => {
			const provider = factory();
			const charge = await provider.createCharge(
				buildChargeRequest("contract-ref-state"),
				{ idempotencyKey: "contract-idem-state" },
			);

			const paidWebhook = await options.webhook.build(charge.chargeId, "paid");
			await provider.parseWebhook(paidWebhook.payload, paidWebhook.headers);
			const afterPaid = await provider.getCharge(charge.chargeId);
			expect(afterPaid.normalizedStatus).toBe("paid");

			const pendingWebhook = await options.webhook.build(
				charge.chargeId,
				"pending",
			);
			await provider.parseWebhook(
				pendingWebhook.payload,
				pendingWebhook.headers,
			);
			const afterPendingAttempt = await provider.getCharge(charge.chargeId);
			expect(afterPendingAttempt.normalizedStatus).toBe("paid");
		});
	});
}
