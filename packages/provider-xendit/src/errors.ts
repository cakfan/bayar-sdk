import type { PaymentErrorCode } from "@bayar-sdk/core";
import { PaymentSDKError } from "@bayar-sdk/core";

function extractErrorCode(raw: unknown): string | undefined {
	if (typeof raw !== "object" || raw === null) return undefined;
	const record = raw as Record<string, unknown>;
	const errorCode = record.error_code;
	if (typeof errorCode === "string") return errorCode;
	const code = record.code;
	return typeof code === "string" ? code : undefined;
}

function extractMessage(raw: unknown): string | undefined {
	if (typeof raw !== "object" || raw === null) return undefined;
	const message = (raw as Record<string, unknown>).message;
	return typeof message === "string" ? message : undefined;
}

export function mapXenditError(
	httpStatus: number,
	raw: unknown,
): PaymentSDKError {
	const providerErrorCode = extractErrorCode(raw) ?? String(httpStatus);

	let code: PaymentErrorCode;
	switch (providerErrorCode) {
		case "API_VALIDATION_ERROR":
		case "PARAMETER_VALIDATION_ERROR":
		case "INVALID_REQUEST":
			code = "INVALID_REQUEST";
			break;
		case "DATA_NOT_FOUND":
			code = "CHARGE_NOT_FOUND";
			break;
		case "INELIGIBLE_TRANSACTION_STATUS":
		case "REFUND_IN_PROGRESS":
			code = "REFUND_NOT_ALLOWED";
			break;
		case "REFUND_AMOUNT_EXCEEDED":
			code = "REFUND_EXCEEDS_CHARGE_AMOUNT";
			break;
		case "INSUFFICIENT_BALANCE":
			code = "INSUFFICIENT_BALANCE";
			break;
		case "CARD_DECLINED":
		case "DECLINED_BY_ISSUER":
		case "DECLINED_BY_PROCESSOR":
		case "USER_DECLINED_PAYMENT":
			code = "CHARGE_DECLINED";
			break;
		case "SERVER_ERROR":
		case "CHANNEL_UNAVAILABLE":
			code = "PROVIDER_UNAVAILABLE";
			break;
		default:
			if (httpStatus === 401 || httpStatus === 403) {
				code = "AUTH_FAILED";
			} else if (httpStatus === 404) {
				code = "CHARGE_NOT_FOUND";
			} else if (httpStatus === 429) {
				code = "PROVIDER_RATE_LIMITED";
			} else if (httpStatus >= 500) {
				code = "PROVIDER_UNAVAILABLE";
			} else if (httpStatus >= 400) {
				code = "INVALID_REQUEST";
			} else {
				code = "UNKNOWN";
			}
	}

	return new PaymentSDKError({
		code,
		provider: "xendit",
		providerErrorCode,
		message: extractMessage(raw),
	});
}
