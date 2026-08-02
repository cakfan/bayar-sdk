import type { ChargeRequest } from "@bayar-sdk/core";
import { MidtransProvider } from "@bayar-sdk/midtrans";

export async function createChargeDemo(serverKey: string): Promise<string> {
	const provider = new MidtransProvider({
		serverKey,
		httpClient: { fetch },
		environment: "sandbox",
	});

	const req: ChargeRequest = {
		amount: 50000, // integer minor unit = Rp50.000
		currency: "IDR",
		// Default: virtual_account (aktif default di sandbox). Untuk QRIS
		// ({ type: "qris" }), channel harus diaktifkan dulu: di dashboard via
		// halaman "+Payment Method" (dashboard.midtrans.com/new_payment_method) —
		// umumnya butuh GoPay aktif dulu. Untuk Core API, aktivasi QRIS kadang
		// perlu request manual ke support@midtrans.com. Kalau belum, Midtrans
		// membalas 402.
		paymentMethod: { type: "virtual_account", bank: "bca" },
		referenceId: `order-${crypto.randomUUID()}`,
		customer: { name: "Demo User", email: "demo@example.com" },
	};

	const charge = await provider.createCharge(req, {
		idempotencyKey: `idem-${crypto.randomUUID()}`,
	});
	console.log("chargeId:", charge.chargeId);
	console.log("normalizedStatus:", charge.normalizedStatus);

	const status = await provider.getCharge(charge.chargeId);
	console.log("getCharge status:", status.normalizedStatus);

	return charge.chargeId;
}
