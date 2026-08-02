import { PaymentSDKError } from "./errors";

const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

export function assertIdempotencyKey(key: string): void {
	if (key.trim().length === 0) {
		throw new PaymentSDKError({
			code: "INVALID_REQUEST",
			provider: "core",
			message: "idempotencyKey is required and must not be empty",
		});
	}

	if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
		throw new PaymentSDKError({
			code: "INVALID_REQUEST",
			provider: "core",
			message: `idempotencyKey must be at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
		});
	}
}
