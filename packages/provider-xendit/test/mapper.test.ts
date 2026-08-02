import { describe, expect, test } from "bun:test";
import type { ChargeRequest } from "@bayar-sdk/core";
import { PaymentSDKError } from "@bayar-sdk/core";
import {
	chargePaid,
	chargePendingEwallet,
	chargePendingQRIS,
	chargePendingVA,
	refundSuccess,
} from "../__fixtures__/charge-response";
import {
	fromXenditRefundResponse,
	fromXenditResponse,
	mapPaymentRequestStatus,
	toXenditChargeRequest,
} from "../src/mapper";

function baseRequest(overrides: Partial<ChargeRequest> = {}): ChargeRequest {
	return {
		amount: 10000,
		currency: "IDR",
		paymentMethod: { type: "virtual_account", bank: "BCA" },
		referenceId: "order-001",
		...overrides,
	};
}

describe("toXenditChargeRequest", () => {
	test("virtual_account → channel_code bank uppercase", () => {
		const body = toXenditChargeRequest(
			baseRequest({
				paymentMethod: { type: "virtual_account", bank: "bca" },
			}),
		);
		expect(body.channel_code).toBe("BCA");
		expect(body.channel_properties).toEqual({});
		expect(body.payment_token_id).toBeUndefined();
		expect(body.reference_id).toBe("order-001");
		expect(body.request_amount).toBe(10000);
		expect(body.currency).toBe("IDR");
		expect(body.country).toBe("ID");
		expect(body.capture_method).toBe("AUTOMATIC");
		expect(JSON.stringify(body)).not.toContain("payment_method");
	});

	test("virtual_account bank tidak dikenal → INVALID_REQUEST", () => {
		expect(() =>
			toXenditChargeRequest(
				baseRequest({
					paymentMethod: { type: "virtual_account", bank: "xyz" },
				}),
			),
		).toThrow(PaymentSDKError);
	});

	test("qris → channel_code QRIS dengan qr_string_type DYNAMIC", () => {
		const body = toXenditChargeRequest(
			baseRequest({ paymentMethod: { type: "qris" } }),
		);
		expect(body.channel_code).toBe("QRIS");
		expect(body.channel_properties).toEqual({ qr_string_type: "DYNAMIC" });
	});

	test("ewallet channel dipetakan ke channel_code Xendit", () => {
		const ovo = toXenditChargeRequest(
			baseRequest({ paymentMethod: { type: "ewallet", channel: "OVO" } }),
		);
		expect(ovo.channel_code).toBe("OVO");

		const dana = toXenditChargeRequest(
			baseRequest({ paymentMethod: { type: "ewallet", channel: "DANA" } }),
		);
		expect(dana.channel_code).toBe("DANA");

		const shopeepay = toXenditChargeRequest(
			baseRequest({
				paymentMethod: { type: "ewallet", channel: "shopeepay" },
			}),
		);
		expect(shopeepay.channel_code).toBe("SHOPEEPAY");
	});

	test("ewallet channel tidak dikenal → INVALID_REQUEST", () => {
		expect(() =>
			toXenditChargeRequest(
				baseRequest({ paymentMethod: { type: "ewallet", channel: "jago" } }),
			),
		).toThrow(PaymentSDKError);
	});

	test("card → payment_token_id, bukan raw card data", () => {
		const body = toXenditChargeRequest(
			baseRequest({ paymentMethod: { type: "card", token: "token-abc-123" } }),
		);
		expect(body.channel_code).toBe("CARDS");
		expect(body.payment_token_id).toBe("token-abc-123");
		expect(body.channel_properties).toBeUndefined();
		expect(JSON.stringify(body)).not.toContain("card_number");
		expect(JSON.stringify(body)).not.toContain("cvv");
	});

	test("metadata diteruskan apa adanya", () => {
		const body = toXenditChargeRequest(
			baseRequest({ metadata: { order_key: "abc" } }),
		);
		expect(body.metadata).toEqual({ order_key: "abc" });
	});
});

describe("fromXenditResponse", () => {
	test("VA pending → pending + action va_number", () => {
		const result = fromXenditResponse(chargePendingVA);
		expect(result.provider).toBe("xendit");
		expect(result.chargeId).toBe("pr-va-pending-001");
		expect(result.referenceId).toBe("order-va-pending-001");
		expect(result.normalizedStatus).toBe("pending");
		expect(result.paymentMethod).toBe("virtual_account");
		expect(result.amount).toBe(15000);
		expect(result.currency).toBe("IDR");
		expect(result.expiresAt).toBe("2024-02-03T07:00:00Z");
		expect(result.actions).toEqual([
			{ type: "va_number", value: "8881012345678" },
		]);
	});

	test("QRIS → action qr_string", () => {
		const result = fromXenditResponse(chargePendingQRIS);
		expect(result.paymentMethod).toBe("qris");
		expect(result.actions).toEqual([
			{ type: "qr_string", value: "000201010211QRISDATA123" },
		]);
	});

	test("ewallet REQUIRES_ACTION → pending + action redirect_url", () => {
		const result = fromXenditResponse(chargePendingEwallet);
		expect(result.normalizedStatus).toBe("pending");
		expect(result.paymentMethod).toBe("ewallet");
		expect(result.actions).toEqual([
			{
				type: "redirect_url",
				value: "https://checkout.xendit.co/ovo/abc123",
			},
		]);
	});

	test("SUCCEEDED → paid", () => {
		const result = fromXenditResponse(chargePaid);
		expect(result.normalizedStatus).toBe("paid");
		expect(result.paymentMethod).toBe("card");
	});

	test("response tanpa id → INVALID_REQUEST", () => {
		expect(() =>
			fromXenditResponse({ reference_id: "o-1", status: "PENDING" }),
		).toThrow(PaymentSDKError);
	});

	test("response tanpa status → INVALID_REQUEST", () => {
		expect(() =>
			fromXenditResponse({
				id: "pr-1",
				reference_id: "o-1",
			}),
		).toThrow(PaymentSDKError);
	});

	test("channel_code tidak dikenal → INVALID_REQUEST", () => {
		expect(() =>
			fromXenditResponse({
				id: "pr-1",
				reference_id: "o-1",
				status: "PENDING",
				request_amount: 10000,
				channel_code: "PAYLATER",
			}),
		).toThrow(PaymentSDKError);
	});

	test("request_amount berupa string tetap integer minor unit", () => {
		const result = fromXenditResponse({
			id: "pr-1",
			reference_id: "o-1",
			status: "PENDING",
			request_amount: "15000",
			channel_code: "QRIS",
		});
		expect(result.amount).toBe(15000);
	});
});

describe("mapPaymentRequestStatus", () => {
	test("status aktif → pending", () => {
		expect(mapPaymentRequestStatus("PENDING")).toBe("pending");
		expect(mapPaymentRequestStatus("REQUIRES_ACTION")).toBe("pending");
		expect(mapPaymentRequestStatus("AUTHORIZED")).toBe("pending");
	});

	test("SUCCEEDED → paid", () => {
		expect(mapPaymentRequestStatus("SUCCEEDED")).toBe("paid");
	});

	test("FAILED/CANCELED/EXPIRED", () => {
		expect(mapPaymentRequestStatus("FAILED")).toBe("failed");
		expect(mapPaymentRequestStatus("CANCELED")).toBe("cancelled");
		expect(mapPaymentRequestStatus("EXPIRED")).toBe("expired");
	});

	test("status tidak dikenal → unknown", () => {
		expect(mapPaymentRequestStatus("weird")).toBe("unknown");
	});
});

describe("fromXenditRefundResponse", () => {
	test("refund sukses → succeeded", () => {
		const result = fromXenditRefundResponse(refundSuccess, "pr-paid-001");
		expect(result.normalizedStatus).toBe("succeeded");
		expect(result.refundId).toBe("rfd-refund-001");
		expect(result.amount).toBe(50000);
		expect(result.chargeId).toBe("pr-paid-001");
	});

	test("refund pending → pending", () => {
		const result = fromXenditRefundResponse(
			{ id: "rfd-1", status: "PENDING", amount: 5000 },
			"pr-1",
		);
		expect(result.normalizedStatus).toBe("pending");
	});

	test("refund gagal → failed", () => {
		const result = fromXenditRefundResponse(
			{ id: "rfd-2", status: "FAILED", amount: 5000 },
			"pr-1",
		);
		expect(result.normalizedStatus).toBe("failed");
	});

	test("refund CANCELLED → failed", () => {
		const result = fromXenditRefundResponse(
			{ id: "rfd-3", status: "CANCELLED", amount: 5000 },
			"pr-1",
		);
		expect(result.normalizedStatus).toBe("failed");
	});

	test("refund status tidak dikenal → failed", () => {
		const result = fromXenditRefundResponse(
			{ id: "rfd-4", status: "WEIRD", amount: 5000 },
			"pr-1",
		);
		expect(result.normalizedStatus).toBe("failed");
	});
});
