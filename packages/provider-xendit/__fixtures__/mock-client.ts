import type { HttpClient } from "../src/adapter";

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

interface MockChargeBody {
	reference_id?: string;
	amount?: number;
	currency?: string;
	payment_method?: { type?: string; [key: string]: unknown };
	[key: string]: unknown;
}

export class MockXenditHttpClient implements HttpClient {
	requests: Array<{ url: string; init?: RequestInit }> = [];
	chargeStatus = "PENDING";
	statusStatus = "SUCCEEDED";
	chargeStatusCode = 201;
	refundStatusCode = 400;
	refundBody: unknown = {
		error_code: "INELIGIBLE_TRANSACTION_STATUS",
		message: "Payment request is not in a refundable status",
	};

	private chargeCounter = 0;
	private readonly referenceToPr = new Map<string, string>();
	private readonly prToReference = new Map<string, string>();

	private buildPaymentRequest(
		prId: string,
		body: MockChargeBody,
		status: string,
	): Record<string, unknown> {
		return {
			payment_request_id: prId,
			reference_id: body.reference_id ?? prId,
			business_id: "mock-business-xxxx",
			currency: body.currency ?? "IDR",
			amount: body.amount ?? 10000,
			country: "ID",
			status,
			payment_method: body.payment_method ?? { type: "QR_CODE" },
			actions:
				body.payment_method?.type === "QR_CODE"
					? [
							{
								type: "PRESENT_TO_CUSTOMER",
								descriptor: "QR_STRING",
								value: "000201010211MOCKQRIS",
							},
						]
					: [],
			created: "2024-02-01T07:00:00Z",
			updated: "2024-02-01T07:00:00Z",
		};
	}

	async fetch(url: string, init?: RequestInit): Promise<Response> {
		this.requests.push({ url, init });
		const method = (init?.method ?? "GET").toUpperCase();
		const pathname = new URL(url).pathname;

		if (method === "POST" && pathname.endsWith("/payment_requests")) {
			this.chargeCounter += 1;
			const body = JSON.parse(String(init?.body)) as MockChargeBody;
			const referenceId = body.reference_id ?? `mock-ref-${this.chargeCounter}`;
			const prId = `pr-mock-${this.chargeCounter}`;
			this.referenceToPr.set(referenceId, prId);
			this.prToReference.set(prId, referenceId);
			if (this.chargeStatusCode !== 201) {
				return jsonResponse(this.chargeStatusCode, {
					error_code: "API_VALIDATION_ERROR",
					message: "Mock charge error",
				});
			}
			return jsonResponse(
				201,
				this.buildPaymentRequest(prId, body, this.chargeStatus),
			);
		}

		const prMatch = pathname.match(/^\/v3\/payment_requests\/([^/]+)$/);
		if (prMatch && method === "GET") {
			const prId = decodeURIComponent(prMatch[1] as string);
			return jsonResponse(
				200,
				this.buildPaymentRequest(
					prId,
					{ reference_id: this.prToReference.get(prId) ?? prId },
					this.statusStatus,
				),
			);
		}

		if (method === "POST" && pathname.endsWith("/refunds")) {
			return jsonResponse(this.refundStatusCode, this.refundBody);
		}

		return jsonResponse(404, {
			error_code: "DATA_NOT_FOUND",
			message: "Resource not found",
		});
	}
}
