import { describe, expect, test } from "bun:test";
import { isRetryable, PaymentSDKError } from "@bayar-sdk/core";
import { isMidtransSuccessStatus, mapMidtransError } from "../src/errors";

describe("isMidtransSuccessStatus", () => {
	test("200, 201, 202 dianggap sukses", () => {
		expect(isMidtransSuccessStatus("200")).toBe(true);
		expect(isMidtransSuccessStatus("201")).toBe(true);
		expect(isMidtransSuccessStatus("202")).toBe(true);
	});

	test("status lain bukan sukses", () => {
		expect(isMidtransSuccessStatus("412")).toBe(false);
		expect(isMidtransSuccessStatus(undefined)).toBe(false);
	});
});

describe("mapMidtransError", () => {
	function codeOf(status: number, body?: unknown) {
		return mapMidtransError(status, body).code;
	}

	test("401/403 → AUTH_FAILED", () => {
		expect(codeOf(401)).toBe("AUTH_FAILED");
		expect(codeOf(403)).toBe("AUTH_FAILED");
	});

	test("404 → CHARGE_NOT_FOUND", () => {
		expect(codeOf(404)).toBe("CHARGE_NOT_FOUND");
	});

	test("412 → REFUND_NOT_ALLOWED", () => {
		expect(codeOf(412)).toBe("REFUND_NOT_ALLOWED");
	});

	test("429 → PROVIDER_RATE_LIMITED (retryable)", () => {
		const err = mapMidtransError(429, { status_code: "429" });
		expect(err.code).toBe("PROVIDER_RATE_LIMITED");
		expect(isRetryable(err)).toBe(true);
	});

	test("5xx → PROVIDER_UNAVAILABLE (retryable)", () => {
		const err = mapMidtransError(500, { status_code: "500" });
		expect(err.code).toBe("PROVIDER_UNAVAILABLE");
		expect(isRetryable(err)).toBe(true);
	});

	test("4xx lain → INVALID_REQUEST", () => {
		expect(codeOf(400)).toBe("INVALID_REQUEST");
	});

	test("status_code di body lebih diprioritaskan daripada HTTP status", () => {
		const err = mapMidtransError(200, { status_code: "412" });
		expect(err.code).toBe("REFUND_NOT_ALLOWED");
		expect(err.providerErrorCode).toBe("412");
	});

	test("providerErrorCode dan message ikut diisi", () => {
		const err = mapMidtransError(400, {
			status_code: "400",
			status_message: "Bad request",
		});
		expect(err).toBeInstanceOf(PaymentSDKError);
		expect(err.providerErrorCode).toBe("400");
		expect(err.message).toBe("Bad request");
		expect(err.provider).toBe("midtrans");
	});
});
