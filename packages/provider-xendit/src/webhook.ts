import type { PaymentStatus, WebhookEvent } from "@bayar-sdk/core";
import { PaymentSDKError } from "@bayar-sdk/core";
import { mapPaymentRequestStatus, parseAmount } from "./mapper";

export interface XenditWebhookPayload {
	event?: string;
	business_id?: string;
	created?: string;
	data?: {
		id?: string;
		payment_id?: string;
		payment_request_id?: string;
		reference_id?: string;
		status?: string;
		amount?: string | number;
		request_amount?: string | number;
		currency?: string;
		updated?: string;
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

function isWebhookPayload(payload: unknown): payload is XenditWebhookPayload {
	if (typeof payload !== "object" || payload === null) return false;
	const data = (payload as Record<string, unknown>).data;
	return (
		typeof data === "object" &&
		data !== null &&
		typeof (data as Record<string, unknown>).payment_request_id === "string"
	);
}

function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i += 1) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

export function verifyXenditSignature(
	headers: Headers,
	expectedToken: string,
): boolean {
	const provided = headers.get("x-callback-token");
	if (provided === null) return false;
	return constantTimeEqual(provided, expectedToken);
}

async function sha256Hex(input: string): Promise<string> {
	const data = new TextEncoder().encode(input);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

async function fallbackWebhookId(
	chargeId: string,
	status: string,
	timestamp: string,
): Promise<string> {
	const digest = await sha256Hex(`xendit${chargeId}${status}${timestamp}`);
	return `sdk:${digest}`;
}

export function mapWebhookNormalizedStatus(
	payload: XenditWebhookPayload,
): PaymentStatus {
	const event = payload.event ?? "";
	const status = payload.data?.status;
	if (event.startsWith("refund.")) {
		if (status === "SUCCEEDED") return "refunded";
		return "paid";
	}
	return mapPaymentRequestStatus(status ?? "");
}

export async function parseXenditWebhook(
	payload: unknown,
	headers: Headers,
	callbackToken: string,
): Promise<WebhookEvent> {
	if (!isWebhookPayload(payload)) {
		throw new PaymentSDKError({
			code: "INVALID_REQUEST",
			provider: "xendit",
			message: "Xendit webhook payload is malformed",
		});
	}

	if (!verifyXenditSignature(headers, callbackToken)) {
		throw new PaymentSDKError({
			code: "WEBHOOK_SIGNATURE_INVALID",
			provider: "xendit",
			message: "Xendit webhook x-callback-token is invalid",
		});
	}

	const data = payload.data;
	const status = data?.status ?? "";
	const timestamp =
		payload.created ?? data?.updated ?? new Date().toISOString();
	const id =
		data?.id ??
		data?.payment_id ??
		(await fallbackWebhookId(
			data?.payment_request_id ?? "",
			status,
			timestamp,
		));

	return {
		id,
		provider: "xendit",
		type: payload.event ?? "payment.status",
		chargeId: data?.payment_request_id ?? "",
		status,
		normalizedStatus: mapWebhookNormalizedStatus(payload),
		amount: parseAmount(data?.amount ?? data?.request_amount),
		timestamp,
		rawPayload: payload,
	};
}
