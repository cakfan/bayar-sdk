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
	test("virtual_account → VIRTUAL_ACCOUNT dengan bank_code uppercase", () => {
		const body = toXenditChargeRequest(
			baseRequest({
				paymentMethod: { type: "virtual_account", bank: "bca" },
			}),
		);
		expect(body.payment_method.type).toBe("VIRTUAL_ACCOUNT");
		if (body.payment_method.type === "VIRTUAL_ACCOUNT") {
			expect(body.payment_method.virtual_account.bank_code).toBe("BCA");
		}
		expect(body.reference_id).toBe("order-001");
		expect(body.amount).toBe(10000);
		expect(body.currency).toBe("IDR");
		expect(body.country).toBe("ID");
		expect(body.capture_method).toBe("AUTOMATIC");
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

	test("qris → QR_CODE tipe DYNAMIC", () => {
		const body = toXenditChargeRequest(
			baseRequest({ paymentMethod: { type: "qris" } }),
		);
		expect(body.payment_method.type).toBe("QR_CODE");
		if (body.payment_method.type === "QR_CODE") {
			expect(body.payment_method.qr_code.type).toBe("DYNAMIC");
		}
	});

	test("ewallet channel dipetakan ke channel_code Xendit", () => {
		const ovo = toXenditChargeRequest(
			baseRequest({ paymentMethod: { type: "ewallet", channel: "OVO" } }),
		);
		expect(ovo.payment_method.type).toBe("EWALLET");
		if (ovo.payment_method.type === "EWALLET") {
			expect(ovo.payment_method.ewallet.channel_code).toBe("OVO");
		}

		const dana = toXenditChargeRequest(
			baseRequest({ paymentMethod: { type: "ewallet", channel: "DANA" } }),
		);
		if (dana.payment_method.type === "EWALLET") {
			expect(dana.payment_method.ewallet.channel_code).toBe("DANA");
		}

		const shopeepay = toXenditChargeRequest(
			baseRequest({
				paymentMethod: { type: "ewallet", channel: "shopeepay" },
			}),
		);
		if (shopeepay.payment_method.type === "EWALLET") {
			expect(shopeepay.payment_method.ewallet.channel_code).toBe("SHOPEEPAY");
		}
	});

	test("ewallet channel tidak dikenal → INVALID_REQUEST", () => {
		expect(() =>
			toXenditChargeRequest(
				baseRequest({ paymentMethod: { type: "ewallet", channel: "jago" } }),
			),
		).toThrow(PaymentSDKError);
	});

	test("card → CARD memakai token_id, bukan raw card data", () => {
		const body = toXenditChargeRequest(
			baseRequest({ paymentMethod: { type: "card", token: "token-abc-123" } }),
		);
		expect(body.payment_method.type).toBe("CARD");
		if (body.payment_method.type === "CARD") {
			expect(body.payment_method.card.token_id).toBe("token-abc-123");
		}
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

	test("payment_method type tidak dikenal → INVALID_REQUEST", () => {
		expect(() =>
			fromXenditResponse({
				id: "pr-1",
				reference_id: "o-1",
				status: "PENDING",
				amount: 10000,
				payment_method: { type: "PAYLATER" },
			}),
		).toThrow(PaymentSDKError);
	});

	test("amount berupa string tetap integer minor unit", () => {
		const result = fromXenditResponse({
			id: "pr-1",
			reference_id: "o-1",
			status: "PENDING",
			amount: "15000",
			payment_method: { type: "QR_CODE" },
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
});
