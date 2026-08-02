import { describe, expect, test } from "bun:test";
import { isRetryable } from "@bayar-sdk/core";
import { mapXenditError } from "../src/errors";

describe("mapXenditError", () => {
	test("401 → AUTH_FAILED", () => {
		const err = mapXenditError(401, {
			error_code: "UNAUTHORIZED",
			message: "Missing or invalid API key",
		});
		expect(err.code).toBe("AUTH_FAILED");
		expect(err.provider).toBe("xendit");
		expect(err.providerErrorCode).toBe("UNAUTHORIZED");
		expect(err.message).toBe("Missing or invalid API key");
	});

	test("404 DATA_NOT_FOUND → CHARGE_NOT_FOUND", () => {
		const err = mapXenditError(404, {
			error_code: "DATA_NOT_FOUND",
			message: "Resource not found",
		});
		expect(err.code).toBe("CHARGE_NOT_FOUND");
	});

	test("400 REFUND_AMOUNT_EXCEEDED → REFUND_EXCEEDS_CHARGE_AMOUNT", () => {
		const err = mapXenditError(400, {
			error_code: "REFUND_AMOUNT_EXCEEDED",
			message: "Refund amount exceeded",
		});
		expect(err.code).toBe("REFUND_EXCEEDS_CHARGE_AMOUNT");
	});

	test("400 INELIGIBLE_TRANSACTION_STATUS → REFUND_NOT_ALLOWED", () => {
		const err = mapXenditError(400, {
			error_code: "INELIGIBLE_TRANSACTION_STATUS",
			message: "Not refundable",
		});
		expect(err.code).toBe("REFUND_NOT_ALLOWED");
	});

	test("400 INSUFFICIENT_BALANCE → INSUFFICIENT_BALANCE, tidak retryable", () => {
		const err = mapXenditError(400, {
			error_code: "INSUFFICIENT_BALANCE",
		});
		expect(err.code).toBe("INSUFFICIENT_BALANCE");
		expect(isRetryable(err)).toBe(false);
	});

	test("CARD_DECLINED → CHARGE_DECLINED", () => {
		const err = mapXenditError(400, {
			error_code: "CARD_DECLINED",
		});
		expect(err.code).toBe("CHARGE_DECLINED");
	});

	test("429 → PROVIDER_RATE_LIMITED, retryable", () => {
		const err = mapXenditError(429, {
			error_code: "RATE_LIMIT",
		});
		expect(err.code).toBe("PROVIDER_RATE_LIMITED");
		expect(isRetryable(err)).toBe(true);
	});

	test("500 → PROVIDER_UNAVAILABLE, retryable", () => {
		const err = mapXenditError(500, {
			error_code: "SERVER_ERROR",
		});
		expect(err.code).toBe("PROVIDER_UNAVAILABLE");
		expect(isRetryable(err)).toBe(true);
	});

	test("400 tanpa error_code dikenal → INVALID_REQUEST", () => {
		const err = mapXenditError(400, {
			message: "Bad request",
		});
		expect(err.code).toBe("INVALID_REQUEST");
		expect(err.providerErrorCode).toBe("400");
	});

	test("kode tidak dikenal status 2xx → UNKNOWN", () => {
		const err = mapXenditError(200, undefined);
		expect(err.code).toBe("UNKNOWN");
	});
});
