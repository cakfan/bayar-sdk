import {
	computeMidtransSignature,
	MidtransProvider,
} from "@bayar-sdk/midtrans";

// Key dummy — bukan kredensial asli (AGENTS.md: jangan commit secret).
// Cukup untuk demo verifikasi signature webhook tanpa akun Midtrans asli.
const DUMMY_SERVER_KEY = "mock-server-key-xxxx";

export async function webhookDemo(): Promise<void> {
	const provider = new MidtransProvider({
		serverKey: DUMMY_SERVER_KEY,
		httpClient: { fetch },
		environment: "sandbox",
	});

	const orderId = "order-123";
	const statusCode = "200";
	const grossAmount = "50000.00";

	// Signature dihitung sesuai spec Midtrans: SHA512(order_id + status_code + gross_amount + ServerKey).
	const signatureKey = await computeMidtransSignature(
		orderId,
		statusCode,
		grossAmount,
		DUMMY_SERVER_KEY,
	);

	const payload = {
		transaction_id: "tx-123",
		order_id: orderId,
		status_code: statusCode,
		gross_amount: grossAmount,
		transaction_status: "settlement",
		transaction_time: "2024-01-01 00:00:00",
		signature_key: signatureKey,
	};

	const event = await provider.parseWebhook(payload, new Headers());
	console.log("webhook event:", JSON.stringify(event, null, 2));
	console.log("normalizedStatus:", event.normalizedStatus);
}
