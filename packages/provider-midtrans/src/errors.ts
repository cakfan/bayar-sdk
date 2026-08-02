import type { PaymentErrorCode } from "@bayar-sdk/core";
import { PaymentSDKError } from "@bayar-sdk/core";

const SUCCESS_STATUS_CODES = new Set(["200", "201", "202"]);

export function isMidtransSuccessStatus(
	statusCode: string | undefined,
): boolean {
	return statusCode !== undefined && SUCCESS_STATUS_CODES.has(statusCode);
}

function extractStatus(raw: unknown): string | undefined {
	if (typeof raw !== "object" || raw === null) return undefined;
	const statusCode = (raw as Record<string, unknown>).status_code;
	return typeof statusCode === "string" ? statusCode : undefined;
}

function extractMessage(raw: unknown): string | undefined {
	if (typeof raw !== "object" || raw === null) return undefined;
	const message = (raw as Record<string, unknown>).status_message;
	return typeof message === "string" ? message : undefined;
}

export function mapMidtransError(
	httpStatus: number,
	raw: unknown,
): PaymentSDKError {
	const providerErrorCode = extractStatus(raw) ?? String(httpStatus);

	let code: PaymentErrorCode;
	switch (providerErrorCode) {
		case "401":
		case "403":
			code = "AUTH_FAILED";
			break;
		case "404":
			code = "CHARGE_NOT_FOUND";
			break;
		case "412":
			code = "REFUND_NOT_ALLOWED";
			break;
		case "429":
			code = "PROVIDER_RATE_LIMITED";
			break;
		default:
			if (/^5\d\d$/.test(providerErrorCode)) {
				code = "PROVIDER_UNAVAILABLE";
			} else if (/^4\d\d$/.test(providerErrorCode)) {
				code = "INVALID_REQUEST";
			} else {
				code = "UNKNOWN";
			}
	}

	return new PaymentSDKError({
		code,
		provider: "midtrans",
		providerErrorCode,
		message: extractMessage(raw),
	});
}
