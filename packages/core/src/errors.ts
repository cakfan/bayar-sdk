export type PaymentErrorCode =
	| "INVALID_REQUEST"
	| "AUTH_FAILED"
	| "INSUFFICIENT_BALANCE"
	| "CHARGE_DECLINED"
	| "CHARGE_NOT_FOUND"
	| "DUPLICATE_IDEMPOTENCY_KEY"
	| "REFUND_EXCEEDS_CHARGE_AMOUNT"
	| "REFUND_NOT_ALLOWED"
	| "CAPTURE_NOT_SUPPORTED"
	| "WEBHOOK_SIGNATURE_INVALID"
	| "PROVIDER_RATE_LIMITED"
	| "PROVIDER_UNAVAILABLE"
	| "UNKNOWN";

const RETRYABLE_CODES: ReadonlySet<PaymentErrorCode> = new Set([
	"PROVIDER_RATE_LIMITED",
	"PROVIDER_UNAVAILABLE",
]);

const DEFAULT_MESSAGES: Record<PaymentErrorCode, string> = {
	INVALID_REQUEST: "Invalid request",
	AUTH_FAILED: "Authentication failed",
	INSUFFICIENT_BALANCE: "Insufficient balance",
	CHARGE_DECLINED: "Charge declined by provider",
	CHARGE_NOT_FOUND: "Charge not found",
	DUPLICATE_IDEMPOTENCY_KEY:
		"Duplicate idempotency key with a different payload",
	REFUND_EXCEEDS_CHARGE_AMOUNT: "Refund amount exceeds charge amount",
	REFUND_NOT_ALLOWED: "Refund is not allowed for this charge",
	CAPTURE_NOT_SUPPORTED: "Capture is not supported by this provider",
	WEBHOOK_SIGNATURE_INVALID: "Webhook signature is invalid",
	PROVIDER_RATE_LIMITED: "Provider is rate limited",
	PROVIDER_UNAVAILABLE: "Provider is unavailable",
	UNKNOWN: "Unknown error",
};

export interface PaymentSDKErrorOptions {
	code: PaymentErrorCode;
	provider: string;
	message?: string;
	providerErrorCode?: string;
	retryable?: boolean;
	cause?: unknown;
}

export class PaymentSDKError extends Error {
	readonly code: PaymentErrorCode;
	readonly provider: string;
	readonly providerErrorCode?: string;
	readonly retryable: boolean;

	constructor(options: PaymentSDKErrorOptions) {
		super(options.message ?? DEFAULT_MESSAGES[options.code], {
			cause: options.cause,
		});
		this.name = "PaymentSDKError";
		this.code = options.code;
		this.provider = options.provider;
		this.providerErrorCode = options.providerErrorCode;
		this.retryable = options.retryable ?? RETRYABLE_CODES.has(options.code);
	}
}

export function isPaymentSDKError(err: unknown): err is PaymentSDKError {
	return err instanceof PaymentSDKError;
}

export function isRetryable(err: unknown): boolean {
	return isPaymentSDKError(err) && err.retryable;
}
