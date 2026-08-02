import type {
	ChargeRequest,
	ChargeResult,
	PaymentAction,
	PaymentMethodInput,
	PaymentStatus,
	RefundResult,
} from "@bayar-sdk/core";
import { PaymentSDKError } from "@bayar-sdk/core";

// Nilai `bank` yang dikenal Midtrans untuk payment_type bank_transfer
// (lihat dokumentasi Core API). Semua lowercase.
export const SUPPORTED_VA_BANKS: ReadonlySet<string> = new Set([
	"bca",
	"bni",
	"bri",
	"permata",
	"mandiri",
	"cimb",
	"danamon",
	"bsi",
	"seabank",
	"saqu",
]);

export interface MidtransTransactionDetails {
	order_id: string;
	gross_amount: number;
}

export interface MidtransCustomerDetails {
	first_name?: string;
	last_name?: string;
	email?: string;
	phone?: string;
}

export type MidtransChargeBody =
	| {
			payment_type: "bank_transfer";
			transaction_details: MidtransTransactionDetails;
			bank_transfer: { bank: string };
			customer_details?: MidtransCustomerDetails;
	  }
	| {
			payment_type: "qris";
			transaction_details: MidtransTransactionDetails;
			qris: { acquirer: "gopay" | "airpay shopee" };
			customer_details?: MidtransCustomerDetails;
	  }
	| {
			payment_type: "gopay";
			transaction_details: MidtransTransactionDetails;
			gopay: { enable_callback: boolean; callback_url?: string };
			customer_details?: MidtransCustomerDetails;
	  }
	| {
			payment_type: "credit_card";
			transaction_details: MidtransTransactionDetails;
			credit_card: { token_id: string; authentication: boolean };
			customer_details?: MidtransCustomerDetails;
	  };

export function toMidtransChargeRequest(
	req: ChargeRequest,
): MidtransChargeBody {
	const transaction_details: MidtransTransactionDetails = {
		order_id: req.referenceId,
		gross_amount: req.amount,
	};
	const customer_details = req.customer
		? {
				first_name: req.customer.name,
				email: req.customer.email,
				phone: req.customer.phone,
			}
		: undefined;

	switch (req.paymentMethod.type) {
		case "virtual_account": {
			const bank = req.paymentMethod.bank.toLowerCase();
			if (!SUPPORTED_VA_BANKS.has(bank)) {
				throw new PaymentSDKError({
					code: "INVALID_REQUEST",
					provider: "midtrans",
					message: `Unsupported virtual account bank: ${req.paymentMethod.bank}`,
				});
			}
			return {
				payment_type: "bank_transfer",
				transaction_details,
				bank_transfer: { bank },
				customer_details,
			};
		}
		case "qris":
			return {
				payment_type: "qris",
				transaction_details,
				qris: { acquirer: "gopay" },
				customer_details,
			};
		case "ewallet":
			return {
				payment_type: "gopay",
				transaction_details,
				gopay: { enable_callback: true },
				customer_details,
			};
		case "card":
			return {
				payment_type: "credit_card",
				transaction_details,
				credit_card: {
					token_id: req.paymentMethod.token,
					authentication: true,
				},
				customer_details,
			};
	}
}

export interface MidtransChargeResponse {
	status_code?: string;
	transaction_id?: string;
	order_id?: string;
	gross_amount?: string | number;
	payment_type?: string;
	transaction_status?: string;
	fraud_status?: string;
	expiry_time?: string;
	transaction_time?: string;
	va_numbers?: Array<{ bank?: string; va_number?: string }>;
	permata_va_number?: string;
	bca_va_number?: string;
	qr_string?: string;
	actions?: Array<{ name?: string; method?: string; url?: string }>;
	[key: string]: unknown;
}

export interface MidtransRefundResponse {
	status_code?: string;
	transaction_id?: string;
	order_id?: string;
	gross_amount?: string | number;
	refund_amount?: string | number;
	refund_key?: string;
	transaction_status?: string;
	transaction_time?: string;
	[key: string]: unknown;
}

const TRANSACTION_STATUS_TO_PAYMENT_STATUS: Record<string, PaymentStatus> = {
	capture: "paid",
	settlement: "paid",
	pending: "pending",
	challenge: "pending",
	authorize: "pending",
	deny: "failed",
	cancel: "cancelled",
	expire: "expired",
	refund: "refunded",
	partial_refund: "partially_refunded",
	chargeback: "disputed",
	partial_chargeback: "disputed",
};

export function mapTransactionStatus(raw: string): PaymentStatus {
	return TRANSACTION_STATUS_TO_PAYMENT_STATUS[raw] ?? "unknown";
}

const PAYMENT_TYPE_TO_METHOD: Record<string, PaymentMethodInput["type"]> = {
	bank_transfer: "virtual_account",
	qris: "qris",
	gopay: "ewallet",
	credit_card: "card",
};

export function parseAmount(
	value: string | number | undefined,
): number | undefined {
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
	}
	return undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function extractActions(
	raw: MidtransChargeResponse,
): PaymentAction[] | undefined {
	const actions: PaymentAction[] = [];
	const vaNumber = raw.bca_va_number ?? raw.permata_va_number;
	if (vaNumber) {
		actions.push({ type: "va_number", value: vaNumber });
	} else {
		const firstVa = raw.va_numbers?.[0];
		if (firstVa?.va_number) {
			actions.push({ type: "va_number", value: firstVa.va_number });
		}
	}
	if (raw.qr_string) {
		actions.push({ type: "qr_string", value: raw.qr_string });
	}
	const deeplink = raw.actions?.find((action) => action.name === "deeplink");
	if (deeplink?.url) {
		actions.push({ type: "redirect_url", value: deeplink.url });
	}
	return actions.length > 0 ? actions : undefined;
}

export function fromMidtransResponse(raw: unknown): ChargeResult {
	if (
		!isObject(raw) ||
		typeof raw.order_id !== "string" ||
		typeof raw.transaction_status !== "string"
	) {
		throw new PaymentSDKError({
			code: "INVALID_REQUEST",
			provider: "midtrans",
			message: "Midtrans response is missing order_id or transaction_status",
		});
	}
	const response = raw as MidtransChargeResponse;
	const orderId = raw.order_id as string;
	const transactionStatus = raw.transaction_status as string;
	const amount = parseAmount(response.gross_amount);
	if (amount === undefined) {
		throw new PaymentSDKError({
			code: "INVALID_REQUEST",
			provider: "midtrans",
			message: "Midtrans response is missing gross_amount",
		});
	}
	const paymentMethod = PAYMENT_TYPE_TO_METHOD[response.payment_type ?? ""];
	if (paymentMethod === undefined) {
		throw new PaymentSDKError({
			code: "INVALID_REQUEST",
			provider: "midtrans",
			message: `Unsupported Midtrans payment_type: ${response.payment_type ?? "(missing)"}`,
		});
	}

	return {
		provider: "midtrans",
		chargeId: response.transaction_id ?? orderId,
		referenceId: orderId,
		status: transactionStatus,
		normalizedStatus: mapTransactionStatus(transactionStatus),
		amount,
		currency: "IDR",
		paymentMethod,
		actions: extractActions(response),
		expiresAt: response.expiry_time,
		createdAt: response.transaction_time ?? new Date().toISOString(),
		rawResponse: raw,
	};
}

function mapRefundStatus(
	raw: string | undefined,
): RefundResult["normalizedStatus"] {
	if (raw === "refund") return "succeeded";
	if (raw === "refund_pending") return "pending";
	return "failed";
}

export function fromMidtransRefundResponse(
	raw: unknown,
	chargeId: string,
): RefundResult {
	if (!isObject(raw) || typeof raw.order_id !== "string") {
		throw new PaymentSDKError({
			code: "INVALID_REQUEST",
			provider: "midtrans",
			message: "Midtrans refund response is missing order_id",
		});
	}
	const response = raw as MidtransRefundResponse;
	const orderId = raw.order_id as string;
	const amount = parseAmount(response.refund_amount ?? response.gross_amount);
	if (amount === undefined) {
		throw new PaymentSDKError({
			code: "INVALID_REQUEST",
			provider: "midtrans",
			message: "Midtrans refund response is missing refund amount",
		});
	}

	return {
		provider: "midtrans",
		refundId:
			response.refund_key ??
			response.transaction_id ??
			`midtrans-refund-${orderId}`,
		chargeId,
		amount,
		status: response.transaction_status ?? response.status_code ?? "",
		normalizedStatus: mapRefundStatus(response.transaction_status),
		createdAt: response.transaction_time ?? new Date().toISOString(),
		rawResponse: raw,
	};
}
