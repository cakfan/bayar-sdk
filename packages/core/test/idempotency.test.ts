import { describe, expect, test } from "bun:test";
import { PaymentSDKError } from "../src/errors";
import { assertIdempotencyKey } from "../src/idempotency";

describe("assertIdempotencyKey", () => {
	test("accepts a valid key", () => {
		expect(() => assertIdempotencyKey("charge-2024-abc")).not.toThrow();
	});

	test("accepts a key at max length", () => {
		expect(() => assertIdempotencyKey("k".repeat(128))).not.toThrow();
	});

	test("rejects an empty string", () => {
		expect(() => assertIdempotencyKey("")).toThrow(PaymentSDKError);
	});

	test("rejects a whitespace-only string", () => {
		expect(() => assertIdempotencyKey("   ")).toThrow(PaymentSDKError);
	});

	test("rejects a string longer than max length", () => {
		expect(() => assertIdempotencyKey("k".repeat(129))).toThrow(
			PaymentSDKError,
		);
	});

	test("throws PaymentSDKError with code INVALID_REQUEST", () => {
		let err: unknown;
		try {
			assertIdempotencyKey("");
		} catch (e) {
			err = e;
		}
		expect(err).toBeInstanceOf(PaymentSDKError);
		expect(err).toMatchObject({ code: "INVALID_REQUEST", provider: "core" });
	});
});
