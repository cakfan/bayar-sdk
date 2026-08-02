import type { WebhookEvent } from "@bayar-sdk/core";
import { PaymentSDKError } from "@bayar-sdk/core";
import { mapTransactionStatus, parseAmount } from "./mapper";

export interface MidtransWebhookPayload {
	order_id: string;
	status_code: string;
	gross_amount: string;
	signature_key: string;
	transaction_status: string;
	transaction_id?: string;
	transaction_time?: string;
	payment_type?: string;
	[key: string]: unknown;
}

function isWebhookPayload(payload: unknown): payload is MidtransWebhookPayload {
	if (typeof payload !== "object" || payload === null) return false;
	const data = payload as Record<string, unknown>;
	return (
		typeof data.order_id === "string" &&
		typeof data.status_code === "string" &&
		typeof data.gross_amount === "string" &&
		typeof data.signature_key === "string" &&
		typeof data.transaction_status === "string"
	);
}

async function sha512Hex(input: string): Promise<string> {
	const data = new TextEncoder().encode(input);
	const digest = await crypto.subtle.digest("SHA-512", data);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

async function sha256Hex(input: string): Promise<string> {
	const data = new TextEncoder().encode(input);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i += 1) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

export async function computeMidtransSignature(
	orderId: string,
	statusCode: string,
	grossAmount: string,
	serverKey: string,
): Promise<string> {
	const plain = `${orderId}${statusCode}${grossAmount}${serverKey}`;
	return sha512Hex(plain);
}

export async function verifyMidtransSignature(
	payload: unknown,
	serverKey: string,
): Promise<boolean> {
	if (!isWebhookPayload(payload)) return false;
	const expected = await computeMidtransSignature(
		payload.order_id,
		payload.status_code,
		payload.gross_amount,
		serverKey,
	);
	return constantTimeEqual(expected, payload.signature_key);
}

async function fallbackWebhookId(
	chargeId: string,
	status: string,
	timestamp: string,
): Promise<string> {
	const digest = await sha256Hex(`midtrans${chargeId}${status}${timestamp}`);
	return `sdk:${digest}`;
}

export async function parseMidtransWebhook(
	payload: unknown,
	serverKey: string,
	_headers?: Headers,
): Promise<WebhookEvent> {
	if (!isWebhookPayload(payload)) {
		throw new PaymentSDKError({
			code: "INVALID_REQUEST",
			provider: "midtrans",
			message: "Midtrans webhook payload is malformed",
		});
	}

	const valid = await verifyMidtransSignature(payload, serverKey);
	if (!valid) {
		throw new PaymentSDKError({
			code: "WEBHOOK_SIGNATURE_INVALID",
			provider: "midtrans",
			message: "Midtrans webhook signature is invalid",
		});
	}

	const timestamp = payload.transaction_time ?? new Date().toISOString();
	const id =
		payload.transaction_id ??
		(await fallbackWebhookId(
			payload.order_id,
			payload.transaction_status,
			timestamp,
		));

	return {
		id,
		provider: "midtrans",
		type: "payment.status",
		chargeId: payload.order_id,
		status: payload.transaction_status,
		normalizedStatus: mapTransactionStatus(payload.transaction_status),
		amount: parseAmount(payload.gross_amount),
		timestamp,
		rawPayload: payload,
	};
}
