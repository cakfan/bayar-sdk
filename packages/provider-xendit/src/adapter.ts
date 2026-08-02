import type {
	ChargeRequest,
	ChargeResult,
	PaymentProvider,
	RefundRequest,
	RefundResult,
	WebhookEvent,
} from "@bayar-sdk/core";
import { assertIdempotencyKey, PaymentSDKError } from "@bayar-sdk/core";
import { mapXenditError } from "./errors";
import {
	fromXenditRefundResponse,
	fromXenditResponse,
	toXenditChargeRequest,
} from "./mapper";
import { parseXenditWebhook } from "./webhook";

export interface HttpClient {
	fetch(url: string, init?: RequestInit): Promise<Response>;
}

// Xendit memakai satu host untuk test dan live — environment ditentukan oleh
// secret key itu sendiri (test key vs live key), bukan oleh host.
const BASE_URL = "https://api.xendit.co";
const PAYMENT_REQUESTS_API_VERSION = "2024-11-11";

interface IdempotencyEntry {
	fingerprint: string;
	result: ChargeResult | RefundResult;
}

export interface XenditProviderOptions {
	secretKey: string;
	callbackToken: string;
	httpClient: HttpClient;
}

async function readJson(
	response: Response,
): Promise<Record<string, unknown> | undefined> {
	try {
		const data = await response.json();
		return typeof data === "object" && data !== null
			? (data as Record<string, unknown>)
			: undefined;
	} catch {
		return undefined;
	}
}

function fingerprintOf(value: unknown): string {
	return JSON.stringify(value);
}

export class XenditProvider implements PaymentProvider {
	private readonly secretKey: string;
	private readonly callbackToken: string;
	private readonly httpClient: HttpClient;
	private readonly chargeIdempotency = new Map<string, IdempotencyEntry>();
	private readonly refundIdempotency = new Map<string, IdempotencyEntry>();

	constructor(options: XenditProviderOptions) {
		this.secretKey = options.secretKey;
		this.callbackToken = options.callbackToken;
		this.httpClient = options.httpClient;
	}

	private authHeaders(idempotencyKey?: string): Record<string, string> {
		const headers: Record<string, string> = {
			"content-type": "application/json",
			authorization: `Basic ${btoa(`${this.secretKey}:`)}`,
		};
		if (idempotencyKey !== undefined) {
			headers["idempotency-key"] = idempotencyKey;
		}
		return headers;
	}

	private async request(
		url: string,
		init: RequestInit,
		apiVersion?: string,
	): Promise<Record<string, unknown> | undefined> {
		const headers = new Headers(init.headers);
		if (apiVersion !== undefined) {
			headers.set("api-version", apiVersion);
		}
		const response = await this.httpClient.fetch(url, {
			...init,
			headers,
		});
		const raw = await readJson(response);
		if (!response.ok) {
			throw mapXenditError(response.status, raw);
		}
		return raw;
	}

	async createCharge(
		req: ChargeRequest,
		opts: { idempotencyKey: string },
	): Promise<ChargeResult> {
		assertIdempotencyKey(opts.idempotencyKey);
		const fingerprint = fingerprintOf(req);
		const cached = this.chargeIdempotency.get(opts.idempotencyKey);
		if (cached) {
			if (cached.fingerprint !== fingerprint) {
				throw new PaymentSDKError({
					code: "DUPLICATE_IDEMPOTENCY_KEY",
					provider: "xendit",
					message: "Idempotency key already used with a different payload",
				});
			}
			return cached.result as ChargeResult;
		}

		const raw = await this.request(
			`${BASE_URL}/v3/payment_requests`,
			{
				method: "POST",
				headers: this.authHeaders(opts.idempotencyKey),
				body: JSON.stringify(toXenditChargeRequest(req)),
			},
			PAYMENT_REQUESTS_API_VERSION,
		);

		const result = fromXenditResponse(raw);
		this.chargeIdempotency.set(opts.idempotencyKey, {
			fingerprint,
			result,
		});
		return result;
	}

	async getCharge(chargeId: string): Promise<ChargeResult> {
		const raw = await this.request(
			`${BASE_URL}/v3/payment_requests/${encodeURIComponent(chargeId)}`,
			{
				method: "GET",
				headers: this.authHeaders(),
			},
			PAYMENT_REQUESTS_API_VERSION,
		);
		return fromXenditResponse(raw);
	}

	async refund(
		req: RefundRequest,
		opts: { idempotencyKey: string },
	): Promise<RefundResult> {
		assertIdempotencyKey(opts.idempotencyKey);
		const fingerprint = fingerprintOf(req);
		const cached = this.refundIdempotency.get(opts.idempotencyKey);
		if (cached) {
			if (cached.fingerprint !== fingerprint) {
				throw new PaymentSDKError({
					code: "DUPLICATE_IDEMPOTENCY_KEY",
					provider: "xendit",
					message: "Idempotency key already used with a different payload",
				});
			}
			return cached.result as RefundResult;
		}

		if (
			req.amount !== undefined &&
			(!Number.isInteger(req.amount) || req.amount <= 0)
		) {
			throw new PaymentSDKError({
				code: "INVALID_REQUEST",
				provider: "xendit",
				message: "Refund amount must be a positive integer in minor units",
			});
		}

		const charge = await this.getCharge(req.chargeId);
		if (charge.normalizedStatus !== "paid") {
			throw new PaymentSDKError({
				code: "REFUND_NOT_ALLOWED",
				provider: "xendit",
				message: "Refund is only allowed for paid charges",
			});
		}

		if (req.amount !== undefined && req.amount > charge.amount) {
			throw new PaymentSDKError({
				code: "REFUND_EXCEEDS_CHARGE_AMOUNT",
				provider: "xendit",
				message: "Refund amount exceeds charge amount",
			});
		}

		const payload: Record<string, unknown> = {
			payment_request_id: req.chargeId,
			reason: req.reason ?? "REQUESTED_BY_CUSTOMER",
			currency: charge.currency,
		};
		if (req.amount !== undefined) {
			payload.amount = req.amount;
		}

		const raw = await this.request(`${BASE_URL}/refunds`, {
			method: "POST",
			headers: this.authHeaders(opts.idempotencyKey),
			body: JSON.stringify(payload),
		});

		const result = fromXenditRefundResponse(raw, req.chargeId);
		this.refundIdempotency.set(opts.idempotencyKey, {
			fingerprint,
			result,
		});
		return result;
	}

	async parseWebhook(
		payload: unknown,
		headers: Headers,
	): Promise<WebhookEvent> {
		return parseXenditWebhook(payload, headers, this.callbackToken);
	}

	async capturePayment(_chargeId: string): Promise<ChargeResult> {
		throw new PaymentSDKError({
			code: "CAPTURE_NOT_SUPPORTED",
			provider: "xendit",
			message: "Xendit payment requests are captured automatically",
		});
	}
}
