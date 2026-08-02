import type {
	MidtransChargeResponse,
	MidtransRefundResponse,
} from "../src/mapper";

// Fixture respons mentah Midtrans Core API (sandbox), nilai mock — bukan
// kredensial/transaksi asli. Dipakai regression test mapping response.

export const chargePendingVA: MidtransChargeResponse = {
	status_code: "201",
	transaction_id: "tx-va-pending-001",
	order_id: "order-va-pending-001",
	gross_amount: "15000.00",
	payment_type: "bank_transfer",
	transaction_status: "pending",
	fraud_status: "accept",
	va_numbers: [{ bank: "bca", va_number: "12345678901" }],
	expiry_time: "2024-02-01 09:00:00",
	transaction_time: "2024-02-01 07:00:00",
};

export const chargePendingQRIS: MidtransChargeResponse = {
	status_code: "201",
	transaction_id: "tx-qris-pending-001",
	order_id: "order-qris-pending-001",
	gross_amount: "25000",
	payment_type: "qris",
	transaction_status: "pending",
	fraud_status: "accept",
	qr_string: "QRISDATA123",
	actions: [
		{
			name: "qr-code",
			method: "GET",
			url: "https://api.midtrans.com/qris/QRISDATA123",
		},
	],
	expiry_time: "2024-02-01 09:00:00",
	transaction_time: "2024-02-01 07:00:00",
};

export const chargePendingGoPay: MidtransChargeResponse = {
	status_code: "201",
	transaction_id: "tx-gopay-pending-001",
	order_id: "order-gopay-pending-001",
	gross_amount: "35000.00",
	payment_type: "gopay",
	transaction_status: "pending",
	fraud_status: "accept",
	actions: [
		{
			name: "deeplink",
			method: "GET",
			url: "https://api.midtrans.com/gopay/deeplink-001",
		},
	],
	transaction_time: "2024-02-01 07:00:00",
};

export const chargeSuccess: MidtransChargeResponse = {
	status_code: "200",
	transaction_id: "tx-paid-001",
	order_id: "order-paid-001",
	gross_amount: "50000.00",
	payment_type: "credit_card",
	transaction_status: "settlement",
	fraud_status: "accept",
	transaction_time: "2024-02-01 07:00:00",
};

export const refundSuccess: MidtransRefundResponse = {
	status_code: "200",
	transaction_id: "tx-paid-001",
	order_id: "order-paid-001",
	gross_amount: "50000.00",
	refund_amount: "50000.00",
	refund_key: "refund-key-001",
	transaction_status: "refund",
	transaction_time: "2024-02-01 08:00:00",
};
