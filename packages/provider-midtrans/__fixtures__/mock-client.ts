import type { HttpClient } from "../src/adapter";

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

export interface MockChargeResponse {
	transaction_id?: string;
	order_id?: string;
	gross_amount?: string | number;
	payment_type?: string;
	transaction_status?: string;
	[key: string]: unknown;
}

export class MockMidtransHttpClient implements HttpClient {
	requests: Array<{ url: string; init?: RequestInit }> = [];
	chargeStatus = "pending";
	statusTransactionStatus = "settlement";
	refundStatusCode = 412;
	refundBody: unknown = {
		status_code: "412",
		status_message: "Refund is not allowed for this transaction",
	};
	chargeStatusCode = 200;

	private chargeCounter = 0;
	private readonly orderToTx = new Map<string, string>();

	async fetch(url: string, init?: RequestInit): Promise<Response> {
		this.requests.push({ url, init });
		const method = (init?.method ?? "GET").toUpperCase();
		const pathname = new URL(url).pathname;

		if (method === "POST" && pathname.endsWith("/charge")) {
			this.chargeCounter += 1;
			const body = JSON.parse(String(init?.body)) as {
				transaction_details?: { order_id?: string; gross_amount?: number };
				payment_type?: string;
			};
			const orderId = body.transaction_details?.order_id ?? "mock-order";
			const txId = `mock-midtrans-tx-${this.chargeCounter}`;
			this.orderToTx.set(orderId, txId);
			if (this.chargeStatusCode !== 200) {
				return jsonResponse(this.chargeStatusCode, {
					status_code: String(this.chargeStatusCode),
					status_message: "Mock charge error",
				});
			}
			return jsonResponse(200, {
				status_code: "201",
				transaction_id: txId,
				order_id: orderId,
				gross_amount: String(
					body.transaction_details?.gross_amount ?? "10000.00",
				),
				payment_type: body.payment_type,
				transaction_status: this.chargeStatus,
				transaction_time: "2024-01-01T00:00:00.000Z",
			});
		}

		const statusMatch = pathname.match(/^\/v2\/([^/]+)\/status$/);
		if (statusMatch && method === "GET") {
			const orderId = decodeURIComponent(statusMatch[1] as string);
			return jsonResponse(200, {
				status_code: "200",
				transaction_id:
					this.orderToTx.get(orderId) ?? `mock-midtrans-tx-${orderId}`,
				order_id: orderId,
				gross_amount: "10000.00",
				payment_type: "qris",
				transaction_status: this.statusTransactionStatus,
				transaction_time: "2024-01-01T00:00:00.000Z",
			});
		}

		if (method === "POST" && /\/refund/.test(pathname)) {
			return jsonResponse(this.refundStatusCode, this.refundBody);
		}

		return jsonResponse(404, {
			status_code: "404",
			status_message: "Transaction not found",
		});
	}
}
