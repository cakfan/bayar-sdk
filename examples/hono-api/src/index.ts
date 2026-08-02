import { createPaymentRoutes } from "@bayar-sdk/hono";
import { MidtransProvider } from "@bayar-sdk/midtrans";
import { XenditProvider } from "@bayar-sdk/xendit";
import { Hono } from "hono";

const PORT = Number(process.env.PORT ?? 3000);

// Key diambil dari env; kalau kosong, pakai dummy supaya server tetap bisa
// dinaikkan dan error mapping (401 AUTH_FAILED) bisa dicoba.
const midtransServerKey =
	process.env.MIDTRANS_SERVER_KEY ?? "mock-server-key-midtrans";
const xenditSecretKey =
	process.env.XENDIT_SECRET_KEY ?? "mock-server-key-xendit";
const xenditCallbackToken =
	process.env.XENDIT_CALLBACK_TOKEN ?? "mock-callback-token-xxxx";

const app = new Hono();

app.route(
	"/payments",
	createPaymentRoutes({
		providers: {
			midtrans: new MidtransProvider({
				serverKey: midtransServerKey,
				httpClient: { fetch },
				environment: "sandbox",
			}),
			xendit: new XenditProvider({
				secretKey: xenditSecretKey,
				callbackToken: xenditCallbackToken,
				httpClient: { fetch },
			}),
		},
		defaultProvider: "midtrans",
	}),
);

Bun.serve({ port: PORT, fetch: app.fetch });
console.log(`API listening on http://localhost:${PORT}`);
console.log("Endpoints:");
console.log(
	"  POST /payments/charges              (header Idempotency-Key wajib)",
);
console.log("  GET  /payments/charges/:id");
console.log(
	"  POST /payments/charges/:id/refund   (header Idempotency-Key wajib)",
);
console.log("  POST /payments/webhooks/:provider   (midtrans | xendit)");
