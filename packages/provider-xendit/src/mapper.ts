import type {
	ChargeRequest,
	ChargeResult,
	PaymentAction,
	PaymentMethodInput,
	PaymentStatus,
	RefundResult,
} from "@bayar-sdk/core";
import { PaymentSDKError } from "@bayar-sdk/core";

// Kanal VA yang didukung Xendit (kode lowercase kanonik → channel code
// `bank_code` Payment Request API). Ini subset dari dokumentasi Xendit.
export const XENDIT_VA_BANK_CODES: ReadonlyMap<string, string> = new Map([
	["bca", "BCA"],
	["bni", "BNI"],
	["bri", "BRI"],
	["mandiri", "MANDIRI"],
	["permata", "PERMATA"],
	["cimb", "CIMB"],
	["bsi", "BSI"],
	["danamon", "DANAMON"],
	["seabank", "SEABANK"],
	["saqu", "SAQU"],
]);

// Kanal e-wallet yang didukung (channel lowercase → `channel_code` Xendit).
// Catatan: GoPay memakai `GOJEK` sebagai channel code di Xendit.
export const XENDIT_EWALLET_CHANNELS: ReadonlyMap<string, string> = new Map([
	["ovo", "OVO"],
	["dana", "DANA"],
	["shopeepay", "SHOPEEPAY"],
	["gopay", "GOJEK"],
	["linkaja", "LINKAJA"],
]);

export type XenditPaymentMethod =
	| {
			type: "VIRTUAL_ACCOUNT";
			reusability: "ONE_TIME_USE";
			virtual_account: { bank_code: string };
	  }
	| {
			type: "QR_CODE";
			reusability: "ONE_TIME_USE";
			qr_code: { type: "DYNAMIC" };
	  }
	| {
			type: "EWALLET";
			reusability: "ONE_TIME_USE";
			ewallet: { channel_code: string };
	  }
	| {
			type: "CARD";
			reusability: "ONE_TIME_USE";
			card: { token_id: string };
	  };

export interface XenditChargeBody {
	reference_id: string;
	amount: number;
	currency: string;
	country?: string;
	type: "PAY";
	capture_method: "AUTOMATIC";
	payment_method: XenditPaymentMethod;
	description?: string;
	metadata?: Record<string, string>;
}

function invalidRequest(message: string): PaymentSDKError {
	return new PaymentSDKError({
		code: "INVALID_REQUEST",
		provider: "xendit",
		message,
	});
}

export function toXenditChargeRequest(req: ChargeRequest): XenditChargeBody {
	const currency = req.currency.toUpperCase();
	const base = {
		reference_id: req.referenceId,
		amount: req.amount,
		currency,
		...(currency === "IDR" ? { country: "ID" } : {}),
		type: "PAY" as const,
		capture_method: "AUTOMATIC" as const,
		description: req.description,
		metadata: req.metadata,
	};

	switch (req.paymentMethod.type) {
		case "virtual_account": {
			const bank = req.paymentMethod.bank.toLowerCase();
			const bankCode = XENDIT_VA_BANK_CODES.get(bank);
			if (bankCode === undefined) {
				throw invalidRequest(
					`Unsupported virtual account bank: ${req.paymentMethod.bank}`,
				);
			}
			return {
				...base,
				payment_method: {
					type: "VIRTUAL_ACCOUNT",
					reusability: "ONE_TIME_USE",
					virtual_account: { bank_code: bankCode },
				},
			};
		}
		case "qris":
			return {
				...base,
				payment_method: {
					type: "QR_CODE",
					reusability: "ONE_TIME_USE",
					qr_code: { type: "DYNAMIC" },
				},
			};
		case "ewallet": {
			const channel = req.paymentMethod.channel.toLowerCase();
			const channelCode = XENDIT_EWALLET_CHANNELS.get(channel);
			if (channelCode === undefined) {
				throw invalidRequest(
					`Unsupported e-wallet channel: ${req.paymentMethod.channel}`,
				);
			}
			return {
				...base,
				payment_method: {
					type: "EWALLET",
					reusability: "ONE_TIME_USE",
					ewallet: { channel_code: channelCode },
				},
			};
		}
		case "card":
			return {
				...base,
				payment_method: {
					type: "CARD",
					reusability: "ONE_TIME_USE",
					card: { token_id: req.paymentMethod.token },
				},
			};
	}
}

export interface XenditPaymentRequest {
	payment_request_id?: string;
	id?: string;
	reference_id?: string;
	currency?: string;
	amount?: string | number;
	country?: string;
	status?: string;
	payment_method?: {
		type?: string;
		[key: string]: unknown;
	};
	actions?: Array<{
		type?: string;
		descriptor?: string;
		value?: string;
		[key: string]: unknown;
	}>;
	channel_properties?: {
		expires_at?: string;
		[key: string]: unknown;
	};
	expires_at?: string;
	created?: string;
	updated?: string;
	[key: string]: unknown;
}

export interface XenditRefundResponse {
	id?: string;
	payment_request_id?: string;
	amount?: string | number;
	currency?: string;
	status?: string;
	reason?: string;
	reference_id?: string;
	created?: string;
	updated?: string;
	[key: string]: unknown;
}

const PAYMENT_REQUEST_STATUS_TO_PAYMENT_STATUS: Record<string, PaymentStatus> =
	{
		PENDING: "pending",
		REQUIRES_ACTION: "pending",
		AUTHORIZED: "pending",
		AWAITING_CAPTURE: "pending",
		SUCCEEDED: "paid",
		FAILED: "failed",
		CANCELED: "cancelled",
		VOIDED: "cancelled",
		EXPIRED: "expired",
	};

export function mapPaymentRequestStatus(raw: string): PaymentStatus {
	return PAYMENT_REQUEST_STATUS_TO_PAYMENT_STATUS[raw] ?? "unknown";
}

const PAYMENT_METHOD_TYPE_TO_METHOD: Record<
	string,
	PaymentMethodInput["type"]
> = {
	VIRTUAL_ACCOUNT: "virtual_account",
	QR_CODE: "qris",
	EWALLET: "ewallet",
	CARD: "card",
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
	raw: XenditPaymentRequest,
): PaymentAction[] | undefined {
	const actions: PaymentAction[] = [];
	for (const action of raw.actions ?? []) {
		const value = action.value;
		if (typeof value !== "string" || value.length === 0) continue;
		if (action.type === "PRESENT_TO_CUSTOMER") {
			if (action.descriptor === "VIRTUAL_ACCOUNT_NUMBER") {
				actions.push({ type: "va_number", value });
			} else if (action.descriptor === "QR_STRING") {
				actions.push({ type: "qr_string", value });
			}
		} else if (action.type === "REDIRECT_CUSTOMER") {
			actions.push({ type: "redirect_url", value });
		}
	}
	return actions.length > 0 ? actions : undefined;
}

export function fromXenditResponse(raw: unknown): ChargeResult {
	if (
		!isObject(raw) ||
		(typeof raw.payment_request_id !== "string" &&
			typeof raw.id !== "string") ||
		typeof raw.reference_id !== "string" ||
		typeof raw.status !== "string"
	) {
		throw invalidRequest(
			"Xendit response is missing payment_request_id, reference_id or status",
		);
	}
	const response = raw as XenditPaymentRequest;
	const amount = parseAmount(response.amount);
	if (amount === undefined) {
		throw invalidRequest("Xendit response is missing amount");
	}

	const paymentMethodType = response.payment_method?.type;
	const paymentMethod =
		paymentMethodType === undefined
			? undefined
			: PAYMENT_METHOD_TYPE_TO_METHOD[paymentMethodType];
	if (paymentMethod === undefined) {
		throw invalidRequest(
			`Unsupported Xendit payment_method type: ${paymentMethodType ?? "(missing)"}`,
		);
	}

	return {
		provider: "xendit",
		chargeId: response.payment_request_id ?? (response.id as string),
		referenceId: response.reference_id as string,
		status: response.status as string,
		normalizedStatus: mapPaymentRequestStatus(response.status as string),
		amount,
		currency: response.currency ?? "IDR",
		paymentMethod,
		actions: extractActions(response),
		expiresAt: response.channel_properties?.expires_at ?? response.expires_at,
		createdAt: response.created ?? new Date().toISOString(),
		rawResponse: raw,
	};
}

const XENDIT_REFUND_STATUS_TO_NORMALIZED: Record<
	string,
	RefundResult["normalizedStatus"]
> = {
	SUCCEEDED: "succeeded",
	PENDING: "pending",
	FAILED: "failed",
	CANCELLED: "failed",
};

function mapRefundStatus(
	raw: string | undefined,
): RefundResult["normalizedStatus"] {
	return XENDIT_REFUND_STATUS_TO_NORMALIZED[raw ?? ""] ?? "failed";
}

export function fromXenditRefundResponse(
	raw: unknown,
	chargeId: string,
): RefundResult {
	if (!isObject(raw) || typeof raw.id !== "string") {
		throw invalidRequest("Xendit refund response is missing id");
	}
	const response = raw as XenditRefundResponse;
	const amount = parseAmount(response.amount);
	if (amount === undefined) {
		throw invalidRequest("Xendit refund response is missing amount");
	}

	return {
		provider: "xendit",
		refundId: response.id as string,
		chargeId,
		amount,
		status: response.status ?? "",
		normalizedStatus: mapRefundStatus(response.status),
		createdAt: response.created ?? new Date().toISOString(),
		rawResponse: raw,
	};
}
