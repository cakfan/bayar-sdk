import { describe, expect, test } from "bun:test";
import {
	MOCK_SIGNATURE_HEADER,
	MOCK_SIGNATURE_TOKEN,
	MockPaymentProvider,
} from "../__fixtures__/mock-provider";
import {
	buildInvalidMockWebhook,
	buildMockWebhook,
} from "../__fixtures__/webhook-fixtures";
import { runProviderContractTests } from "../testing";

runProviderContractTests(() => new MockPaymentProvider(), {
	webhook: {
		valid: buildMockWebhook("mock-charge-valid", "paid"),
		invalid: buildInvalidMockWebhook(),
		build: buildMockWebhook,
	},
});

describe("mock provider guards (ARCHITECTURE.md §8)", () => {
	test("status terminal tidak bisa berubah (failed → paid ditolak)", async () => {
		const provider = new MockPaymentProvider();
		const charge = await provider.createCharge(
			{
				amount: 10000,
				currency: "IDR",
				paymentMethod: { type: "qris" },
				referenceId: "ref-terminal",
			},
			{ idempotencyKey: "idem-terminal" },
		);

		const failedWebhook = buildMockWebhook(charge.chargeId, "failed");
		await provider.parseWebhook(failedWebhook.payload, failedWebhook.headers);
		expect((await provider.getCharge(charge.chargeId)).normalizedStatus).toBe(
			"failed",
		);

		const paidWebhook = buildMockWebhook(charge.chargeId, "paid");
		await provider.parseWebhook(paidWebhook.payload, paidWebhook.headers);
		expect((await provider.getCharge(charge.chargeId)).normalizedStatus).toBe(
			"failed",
		);
	});

	test("payload webhook malformed → INVALID_REQUEST", async () => {
		const provider = new MockPaymentProvider();
		const headers = new Headers({
			[MOCK_SIGNATURE_HEADER]: MOCK_SIGNATURE_TOKEN,
		});
		await expect(provider.parseWebhook(null, headers)).rejects.toMatchObject({
			code: "INVALID_REQUEST",
		});
		await expect(provider.parseWebhook({}, headers)).rejects.toMatchObject({
			code: "INVALID_REQUEST",
		});
	});
});
