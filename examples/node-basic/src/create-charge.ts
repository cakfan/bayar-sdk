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
		paymentMethod: { type: "qris" },
		referenceId: `order-${Date.now()}`,
		customer: { name: "Demo User", email: "demo@example.com" },
	};

	const charge = await provider.createCharge(req, {
		idempotencyKey: `idem-${Date.now()}`,
	});
	console.log("chargeId:", charge.chargeId);
	console.log("normalizedStatus:", charge.normalizedStatus);

	const status = await provider.getCharge(charge.chargeId);
	console.log("getCharge status:", status.normalizedStatus);

	return charge.chargeId;
}
