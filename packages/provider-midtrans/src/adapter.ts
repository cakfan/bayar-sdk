import type {
	ChargeRequest,
	ChargeResult,
	PaymentProvider,
	RefundRequest,
	RefundResult,
	WebhookEvent,
} from "@bayar-sdk/core";
import { assertIdempotencyKey, PaymentSDKError } from "@bayar-sdk/core";
import { isMidtransSuccessStatus, mapMidtransError } from "./errors";
import {
	fromMidtransRefundResponse,
	fromMidtransResponse,
	toMidtransChargeRequest,
} from "./mapper";
import { parseMidtransWebhook } from "./webhook";

export interface HttpClient {
	fetch(url: string, init?: RequestInit): Promise<Response>;
}

const SANDBOX_BASE_URL = "https://api.sandbox.midtrans.com/v2";
const PRODUCTION_BASE_URL = "https://api.midtrans.com/v2";

interface IdempotencyEntry {
	fingerprint: string;
	result: ChargeResult | RefundResult;
}

export interface MidtransProviderOptions {
	serverKey: string;
	httpClient: HttpClient;
	environment?: "sandbox" | "production";
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

export class MidtransProvider implements PaymentProvider {
	private readonly serverKey: string;
	private readonly httpClient: HttpClient;
	private readonly baseUrl: string;
	private readonly chargeIdempotency = new Map<string, IdempotencyEntry>();
	private readonly refundIdempotency = new Map<string, IdempotencyEntry>();
	private readonly orderIdByChargeId = new Map<string, string>();

	constructor(options: MidtransProviderOptions) {
		this.serverKey = options.serverKey;
		this.httpClient = options.httpClient;
		this.baseUrl =
			options.environment === "production"
				? PRODUCTION_BASE_URL
				: SANDBOX_BASE_URL;
	}

	private authHeaders(idempotencyKey?: string): Record<string, string> {
		const headers: Record<string, string> = {
			"content-type": "application/json",
			authorization: `Basic ${btoa(`${this.serverKey}:`)}`,
		};
		if (idempotencyKey !== undefined) {
			headers["idempotency-key"] = idempotencyKey;
		}
		return headers;
	}

	private async request(
		url: string,
		init: RequestInit,
	): Promise<Record<string, unknown> | undefined> {
		const response = await this.httpClient.fetch(url, init);
		const raw = await readJson(response);
		if (!response.ok || !isMidtransSuccessStatus(raw?.status_code as string)) {
			throw mapMidtransError(response.status, raw);
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
					provider: "midtrans",
					message: "Idempotency key already used with a different payload",
				});
			}
			return cached.result as ChargeResult;
		}

		const raw = await this.request(`${this.baseUrl}/charge`, {
			method: "POST",
			headers: this.authHeaders(opts.idempotencyKey),
			body: JSON.stringify(toMidtransChargeRequest(req)),
		});

		const result = fromMidtransResponse(raw);
		this.orderIdByChargeId.set(result.chargeId, result.referenceId);
		this.chargeIdempotency.set(opts.idempotencyKey, {
			fingerprint,
			result,
		});
		return result;
	}

	async getCharge(chargeId: string): Promise<ChargeResult> {
		const orderId = this.orderIdByChargeId.get(chargeId) ?? chargeId;
		const raw = await this.request(
			`${this.baseUrl}/${encodeURIComponent(orderId)}/status`,
			{
				method: "GET",
				headers: this.authHeaders(),
			},
		);
		return fromMidtransResponse(raw);
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
					provider: "midtrans",
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
				provider: "midtrans",
				message: "Refund amount must be a positive integer in minor units",
			});
		}

		const charge = await this.getCharge(req.chargeId);
		if (charge.normalizedStatus !== "paid") {
			throw new PaymentSDKError({
				code: "REFUND_NOT_ALLOWED",
				provider: "midtrans",
				message: "Refund is only allowed for paid charges",
			});
		}

		if (req.amount !== undefined && req.amount > charge.amount) {
			throw new PaymentSDKError({
				code: "REFUND_EXCEEDS_CHARGE_AMOUNT",
				provider: "midtrans",
				message: "Refund amount exceeds charge amount",
			});
		}

		const orderId = charge.referenceId;
		const partial = req.amount !== undefined;
		const url = partial
			? `${this.baseUrl}/${encodeURIComponent(orderId)}/refund/partial/${encodeURIComponent(opts.idempotencyKey)}`
			: `${this.baseUrl}/${encodeURIComponent(orderId)}/refund`;
		const payload = partial
			? {
					refund_amount: req.amount,
					...(req.reason ? { reason: req.reason } : {}),
				}
			: req.reason
				? { reason: req.reason }
				: {};

		const raw = await this.request(url, {
			method: "POST",
			headers: this.authHeaders(opts.idempotencyKey),
			body: JSON.stringify(payload),
		});

		const result = fromMidtransRefundResponse(raw, req.chargeId);
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
		return parseMidtransWebhook(payload, this.serverKey, headers);
	}

	async capturePayment(_chargeId: string): Promise<ChargeResult> {
		throw new PaymentSDKError({
			code: "CAPTURE_NOT_SUPPORTED",
			provider: "midtrans",
			message: "Midtrans Core API does not support separate capture",
		});
	}
}
