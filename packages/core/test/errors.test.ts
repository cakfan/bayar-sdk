import { describe, expect, test } from "bun:test";
import { isPaymentSDKError, isRetryable, PaymentSDKError } from "../src/errors";

describe("PaymentSDKError", () => {
	test("defaults retryable to false for business errors", () => {
		const err = new PaymentSDKError({
			code: "CHARGE_DECLINED",
			provider: "midtrans",
		});
		expect(err.retryable).toBe(false);
	});

	test("defaults retryable to true for transient errors", () => {
		for (const code of [
			"PROVIDER_RATE_LIMITED",
			"PROVIDER_UNAVAILABLE",
		] as const) {
			const err = new PaymentSDKError({ code, provider: "midtrans" });
			expect(err.retryable).toBe(true);
		}
	});

	test("allows overriding retryable explicitly", () => {
		const err = new PaymentSDKError({
			code: "CHARGE_DECLINED",
			provider: "midtrans",
			retryable: true,
		});
		expect(err.retryable).toBe(true);
	});

	test("exposes code, provider and providerErrorCode", () => {
		const err = new PaymentSDKError({
			code: "AUTH_FAILED",
			provider: "midtrans",
			providerErrorCode: "401",
			message: "Invalid server key",
		});
		expect(err.code).toBe("AUTH_FAILED");
		expect(err.provider).toBe("midtrans");
		expect(err.providerErrorCode).toBe("401");
		expect(err.message).toBe("Invalid server key");
		expect(err.name).toBe("PaymentSDKError");
	});

	test("falls back to a default message when not provided", () => {
		const err = new PaymentSDKError({
			code: "CHARGE_NOT_FOUND",
			provider: "xendit",
		});
		expect(err.message.length).toBeGreaterThan(0);
	});

	test("preserves the cause", () => {
		const cause = new Error("connection reset");
		const err = new PaymentSDKError({
			code: "PROVIDER_UNAVAILABLE",
			provider: "midtrans",
			cause,
		});
		expect(err.cause).toBe(cause);
	});
});

describe("isPaymentSDKError", () => {
	test("returns true for PaymentSDKError", () => {
		const err = new PaymentSDKError({ code: "UNKNOWN", provider: "midtrans" });
		expect(isPaymentSDKError(err)).toBe(true);
	});

	test("returns false for a plain Error", () => {
		expect(isPaymentSDKError(new Error("boom"))).toBe(false);
	});

	test("returns false for non-error values", () => {
		expect(isPaymentSDKError(null)).toBe(false);
		expect(isPaymentSDKError(undefined)).toBe(false);
		expect(isPaymentSDKError("boom")).toBe(false);
		expect(isPaymentSDKError({ code: "UNKNOWN" })).toBe(false);
	});
});

describe("isRetryable", () => {
	test("is consistent with the retryable flag", () => {
		const codes = [
			"PROVIDER_RATE_LIMITED",
			"PROVIDER_UNAVAILABLE",
			"CHARGE_DECLINED",
			"INSUFFICIENT_BALANCE",
			"UNKNOWN",
		] as const;
		for (const code of codes) {
			const err = new PaymentSDKError({ code, provider: "midtrans" });
			expect(isRetryable(err)).toBe(err.retryable);
		}
	});

	test("returns false for non-PaymentSDKError values", () => {
		expect(isRetryable(new Error("boom"))).toBe(false);
		expect(isRetryable(null)).toBe(false);
	});
});
