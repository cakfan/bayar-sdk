import { PaymentSDKError } from "@bayar-sdk/core";
import { MidtransProvider } from "@bayar-sdk/midtrans";

export async function refundDemo(
	serverKey: string,
	chargeId: string,
): Promise<void> {
	const provider = new MidtransProvider({
		serverKey,
		httpClient: { fetch },
		environment: "sandbox",
	});

	try {
		const refund = await provider.refund(
			{ chargeId },
			{ idempotencyKey: `idem-refund-${Date.now()}` },
		);
		console.log("refundId:", refund.refundId);
		console.log("normalizedStatus:", refund.normalizedStatus);
	} catch (err) {
		if (err instanceof PaymentSDKError && err.code === "REFUND_NOT_ALLOWED") {
			console.log("refund ditolak (charge belum paid):", err.message);
			console.log(
				"Refund hanya boleh untuk charge berstatus paid (state machine §8).",
			);
			return;
		}
		throw err;
	}
}
