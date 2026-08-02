import { describe, expect, test } from "bun:test";
import type { ChargeRequest } from "@bayar-sdk/core";
import { PaymentSDKError } from "@bayar-sdk/core";
import {
	chargePendingGoPay,
	chargePendingQRIS,
	chargePendingVA,
	chargeSuccess,
	refundSuccess,
} from "../__fixtures__/charge-response";
import {
	fromMidtransRefundResponse,
	fromMidtransResponse,
	mapTransactionStatus,
	toMidtransChargeRequest,
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

describe("toMidtransChargeRequest", () => {
	test("virtual_account → bank_transfer dengan bank lowercase", () => {
		const body = toMidtransChargeRequest(
			baseRequest({
				paymentMethod: { type: "virtual_account", bank: "BCA" },
			}),
		);
		expect(body.payment_type).toBe("bank_transfer");
		if (body.payment_type === "bank_transfer") {
			expect(body.bank_transfer.bank).toBe("bca");
			expect(body.transaction_details.order_id).toBe("order-001");
			expect(body.transaction_details.gross_amount).toBe(10000);
		}
	});

	test("virtual_account bank tidak dikenal → INVALID_REQUEST", () => {
		expect(() =>
			toMidtransChargeRequest(
				baseRequest({
					paymentMethod: { type: "virtual_account", bank: "xyz" },
				}),
			),
		).toThrow(PaymentSDKError);
	});

	test("qris → payment_type qris", () => {
		const body = toMidtransChargeRequest(
			baseRequest({ paymentMethod: { type: "qris" } }),
		);
		expect(body.payment_type).toBe("qris");
	});

	test("ewallet → payment_type gopay", () => {
		const body = toMidtransChargeRequest(
			baseRequest({ paymentMethod: { type: "ewallet", channel: "gopay" } }),
		);
		expect(body.payment_type).toBe("gopay");
		if (body.payment_type === "gopay") {
			expect(body.gopay.enable_callback).toBe(true);
		}
	});

	test("card → credit_card memakai token, bukan raw card data", () => {
		const body = toMidtransChargeRequest(
			baseRequest({ paymentMethod: { type: "card", token: "token-abc-123" } }),
		);
		expect(body.payment_type).toBe("credit_card");
		if (body.payment_type === "credit_card") {
			expect(body.credit_card.token_id).toBe("token-abc-123");
			expect(body.credit_card.authentication).toBe(true);
			expect(JSON.stringify(body)).not.toContain("card_number");
			expect(JSON.stringify(body)).not.toContain("cvv");
		}
	});

	test("customer details dipetakan ke customer_details", () => {
		const body = toMidtransChargeRequest(
			baseRequest({
				customer: { name: "Budi", email: "budi@example.com", phone: "08123" },
			}),
		);
		expect(body.customer_details?.first_name).toBe("Budi");
		expect(body.customer_details?.email).toBe("budi@example.com");
		expect(body.customer_details?.phone).toBe("08123");
	});
});

describe("fromMidtransResponse", () => {
	test("VA pending → normalizedStatus pending + action va_number", () => {
		const result = fromMidtransResponse(chargePendingVA);
		expect(result.provider).toBe("midtrans");
		expect(result.chargeId).toBe("tx-va-pending-001");
		expect(result.referenceId).toBe("order-va-pending-001");
		expect(result.normalizedStatus).toBe("pending");
		expect(result.paymentMethod).toBe("virtual_account");
		expect(result.amount).toBe(15000);
		expect(result.actions).toEqual([
			{ type: "va_number", value: "12345678901" },
		]);
	});

	test("settlement → paid", () => {
		const result = fromMidtransResponse(chargeSuccess);
		expect(result.normalizedStatus).toBe("paid");
		expect(result.paymentMethod).toBe("card");
	});

	test("gross_amount berupa string desimal tetap integer minor unit", () => {
		const result = fromMidtransResponse(chargePendingVA);
		expect(result.amount).toBe(15000);
	});

	test("QRIS → action qr_string", () => {
		const result = fromMidtransResponse(chargePendingQRIS);
		expect(result.paymentMethod).toBe("qris");
		expect(result.actions).toEqual([
			{ type: "qr_string", value: "QRISDATA123" },
		]);
	});

	test("GoPay → action redirect_url dari deeplink", () => {
		const result = fromMidtransResponse(chargePendingGoPay);
		expect(result.paymentMethod).toBe("ewallet");
		expect(result.actions).toEqual([
			{
				type: "redirect_url",
				value: "https://api.midtrans.com/gopay/deeplink-001",
			},
		]);
	});

	test("response tanpa order_id → INVALID_REQUEST", () => {
		expect(() =>
			fromMidtransResponse({ transaction_status: "pending" }),
		).toThrow(PaymentSDKError);
	});

	test("payment_type tidak dikenal → INVALID_REQUEST", () => {
		expect(() =>
			fromMidtransResponse({
				order_id: "o-1",
				transaction_status: "pending",
				gross_amount: "10000",
				payment_type: "echannel",
			}),
		).toThrow(PaymentSDKError);
	});
});

describe("mapTransactionStatus", () => {
	test("settlement dan capture → paid", () => {
		expect(mapTransactionStatus("settlement")).toBe("paid");
		expect(mapTransactionStatus("capture")).toBe("paid");
	});

	test("refund/partial_refund/chargeback", () => {
		expect(mapTransactionStatus("refund")).toBe("refunded");
		expect(mapTransactionStatus("partial_refund")).toBe("partially_refunded");
		expect(mapTransactionStatus("chargeback")).toBe("disputed");
	});

	test("status tidak dikenal → unknown", () => {
		expect(mapTransactionStatus("weird")).toBe("unknown");
	});
});

describe("fromMidtransRefundResponse", () => {
	test("refund sukses → succeeded", () => {
		const result = fromMidtransRefundResponse(refundSuccess, "tx-paid-001");
		expect(result.normalizedStatus).toBe("succeeded");
		expect(result.refundId).toBe("refund-key-001");
		expect(result.amount).toBe(50000);
		expect(result.chargeId).toBe("tx-paid-001");
	});

	test("refund_pending → pending", () => {
		const result = fromMidtransRefundResponse(
			{
				order_id: "o-1",
				transaction_status: "refund_pending",
				refund_amount: "5000",
			},
			"tx-1",
		);
		expect(result.normalizedStatus).toBe("pending");
	});
});
