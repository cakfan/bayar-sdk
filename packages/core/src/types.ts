export interface ChargeRequest {
	amount: number;
	currency: string;
	paymentMethod: PaymentMethodInput;
	referenceId: string;
	customer?: {
		name?: string;
		email?: string;
		phone?: string;
	};
	description?: string;
	metadata?: Record<string, string>;
}

export type PaymentMethodInput =
	| { type: "virtual_account"; bank: string }
	| { type: "qris" }
	| { type: "ewallet"; channel: string }
	| { type: "card"; token: string };

export type PaymentStatus =
	| "pending"
	| "paid"
	| "failed"
	| "expired"
	| "cancelled"
	| "refunded"
	| "partially_refunded"
	| "disputed"
	| "unknown";

export type PaymentAction =
	| { type: "va_number"; value: string }
	| { type: "qr_string"; value: string }
	| { type: "redirect_url"; value: string };

export interface ChargeResult {
	provider: string;
	chargeId: string;
	referenceId: string;
	status: string;
	normalizedStatus: PaymentStatus;
	amount: number;
	currency: string;
	paymentMethod: PaymentMethodInput["type"];
	actions?: PaymentAction[];
	expiresAt?: string;
	createdAt: string;
	rawResponse: unknown;
}

export interface RefundRequest {
	chargeId: string;
	amount?: number;
	reason?: string;
}

export interface RefundResult {
	provider: string;
	refundId: string;
	chargeId: string;
	amount: number;
	status: string;
	normalizedStatus: "pending" | "succeeded" | "failed";
	createdAt: string;
	rawResponse: unknown;
}

export interface WebhookEvent {
	id: string;
	provider: string;
	type: string;
	chargeId: string;
	status: string;
	normalizedStatus: PaymentStatus;
	amount?: number;
	timestamp: string;
	rawPayload: unknown;
}
