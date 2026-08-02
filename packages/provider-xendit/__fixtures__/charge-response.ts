import type { XenditPaymentRequest, XenditRefundResponse } from "../src/mapper";

// Fixture respons mentah Xendit Payment Request API (nilai mock, bukan
// kredensial/transaksi asli). Dipakai regression test mapping response.

export const chargePendingVA: XenditPaymentRequest = {
	payment_request_id: "pr-va-pending-001",
	reference_id: "order-va-pending-001",
	business_id: "mock-business-xxxx",
	currency: "IDR",
	request_amount: 15000,
	country: "ID",
	status: "PENDING",
	channel_code: "BCA",
	actions: [
		{
			type: "PRESENT_TO_CUSTOMER",
			descriptor: "VIRTUAL_ACCOUNT_NUMBER",
			value: "8881012345678",
		},
	],
	channel_properties: {
		expires_at: "2024-02-03T07:00:00Z",
	},
	created: "2024-02-01T07:00:00Z",
	updated: "2024-02-01T07:00:00Z",
};

export const chargePendingQRIS: XenditPaymentRequest = {
	payment_request_id: "pr-qris-pending-001",
	reference_id: "order-qris-pending-001",
	business_id: "mock-business-xxxx",
	currency: "IDR",
	request_amount: 25000,
	country: "ID",
	status: "PENDING",
	channel_code: "QRIS",
	actions: [
		{
			type: "PRESENT_TO_CUSTOMER",
			descriptor: "QR_STRING",
			value: "000201010211QRISDATA123",
		},
	],
	channel_properties: {
		expires_at: "2024-02-03T07:00:00Z",
	},
	created: "2024-02-01T07:00:00Z",
	updated: "2024-02-01T07:00:00Z",
};

export const chargePendingEwallet: XenditPaymentRequest = {
	payment_request_id: "pr-ovo-pending-001",
	reference_id: "order-ovo-pending-001",
	business_id: "mock-business-xxxx",
	currency: "IDR",
	request_amount: 35000,
	country: "ID",
	status: "REQUIRES_ACTION",
	channel_code: "OVO",
	actions: [
		{
			type: "REDIRECT_CUSTOMER",
			descriptor: "WEB_URL",
			value: "https://checkout.xendit.co/ovo/abc123",
		},
	],
	created: "2024-02-01T07:00:00Z",
	updated: "2024-02-01T07:00:00Z",
};

export const chargePaid: XenditPaymentRequest = {
	payment_request_id: "pr-paid-001",
	reference_id: "order-paid-001",
	business_id: "mock-business-xxxx",
	currency: "IDR",
	request_amount: 50000,
	country: "ID",
	status: "SUCCEEDED",
	channel_code: "CARDS",
	created: "2024-02-01T07:00:00Z",
	updated: "2024-02-01T08:00:00Z",
};

export const refundSuccess: XenditRefundResponse = {
	id: "rfd-refund-001",
	payment_request_id: "pr-paid-001",
	payment_id: "py-paid-001",
	amount: 50000,
	currency: "IDR",
	status: "SUCCEEDED",
	reason: "REQUESTED_BY_CUSTOMER",
	created: "2024-02-01T08:30:00Z",
	updated: "2024-02-01T08:30:00Z",
};
