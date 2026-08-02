import { createChargeDemo } from "./create-charge";
import { refundDemo } from "./refund";
import { webhookDemo } from "./webhook";

const serverKey = process.env.MIDTRANS_SERVER_KEY;

async function main(): Promise<void> {
	console.log("== Demo parseWebhook (payload dummy, tanpa key asli) ==");
	await webhookDemo();

	if (!serverKey) {
		console.log(
			"\nMIDTRANS_SERVER_KEY tidak diset — contoh createCharge/getCharge/refund di-skip.",
		);
		console.log(
			"Set env MIDTRANS_SERVER_KEY dengan sandbox key Midtrans untuk menjalankannya:",
		);
		console.log("  $env:MIDTRANS_SERVER_KEY='SB-Mid-server-xxxx'; bun start");
		return;
	}

	console.log("\n== Demo createCharge + getCharge ==");
	const chargeId = await createChargeDemo(serverKey);

	console.log("\n== Demo refund ==");
	await refundDemo(serverKey, chargeId);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
