# @bayar-sdk/hono

Middleware Hono untuk mengekspos `PaymentProvider` dari `@bayar-sdk/core` sebagai
REST routes. Satu sub-app Hono menangani `createCharge`, `getCharge`, `refund`,
dan `parseWebhook` dengan error format yang konsisten.

## Instalasi

```bash
bun add @bayar-sdk/core @bayar-sdk/hono hono zod
```

`hono` dan `zod` adalah `peerDependencies` — pasang sendiri sesuai versi aplikasi.

## Quick start

```ts
import { Hono } from "hono";
import { createPaymentRoutes } from "@bayar-sdk/hono";
import { MidtransProvider } from "@bayar-sdk/midtrans";
import { XenditProvider } from "@bayar-sdk/xendit";

const app = new Hono();

app.route(
	"/payments",
	createPaymentRoutes({
		providers: {
			midtrans: new MidtransProvider({
				serverKey,
				httpClient: { fetch }, // wajib — dipakai untuk semua request ke provider
				environment: "sandbox",
			}),
			xendit: new XenditProvider({
				secretKey,
				callbackToken,
				httpClient: { fetch },
			}),
		},
		defaultProvider: "midtrans",
	}),
);

export default app;
```

`providers` adalah map nama → instance `PaymentProvider`. `defaultProvider`
(opsional) dipakai untuk route yang tidak menyebut provider di path-nya.

## Routes

| Method | Path                       | Keterangan                                                          |
| ------ | -------------------------- | ------------------------------------------------------------------- |
| POST   | `/charges`                 | Buat charge via `defaultProvider`. Wajib header `Idempotency-Key`. → 201 |
| GET    | `/charges/:id`             | Ambil detail charge via `defaultProvider`.                          |
| POST   | `/charges/:id/refund`      | Refund charge via `defaultProvider`. Wajib header `Idempotency-Key`. → 200 |
| POST   | `/webhooks/:provider`      | Verifikasi signature + parse event untuk provider bernama `:provider`. |

Contoh request create charge:

```bash
curl -X POST http://localhost:3000/payments/charges \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: idem-001" \
  -d '{
    "amount": 50000,
    "currency": "IDR",
    "paymentMethod": { "type": "qris" },
    "referenceId": "order-123"
  }'
```

`paymentMethod` adalah discriminated union yang divalidasi zod: `virtual_account`
(membutuhkan `bank`), `qris`, `ewallet` (membutuhkan `channel`), atau `card`
(membutuhkan `token`). Body yang tidak valid → `400` dengan detail issue zod.

## Error format

Semua error dikembalikan sebagai JSON konsisten:

```json
{
  "error": {
    "code": "CHARGE_NOT_FOUND",
    "message": "Charge mock-charge-unknown not found",
    "provider": "mock",
    "providerErrorCode": "PAYMENT_CHANNEL_NOT_AVAILABLE",
    "retryable": false
  }
}
```

Mapping `PaymentErrorCode` → HTTP status mengikuti `ARCHITECTURE.md` §12:

| HTTP | `error.code`                                                                 |
| ---- | ---------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`, `INVALID_REQUEST`, `CAPTURE_NOT_SUPPORTED`                |
| 401  | `AUTH_FAILED`, `WEBHOOK_SIGNATURE_INVALID`                                    |
| 404  | `CHARGE_NOT_FOUND`                                                            |
| 409  | `DUPLICATE_IDEMPOTENCY_KEY`                                                   |
| 422  | `REFUND_EXCEEDS_CHARGE_AMOUNT`, `REFUND_NOT_ALLOWED`, `INSUFFICIENT_BALANCE`, `CHARGE_DECLINED` |
| 429  | `PROVIDER_RATE_LIMITED`                                                       |
| 502  | `PROVIDER_UNAVAILABLE`                                                        |
| 500  | `UNKNOWN`, dan kode lain yang belum ter-map                                   |

## Webhook

```ts
app.route("/webhooks", createPaymentRoutes({ providers, defaultProvider }));

// POST /webhooks/xendit — signature diverifikasi di parseWebhook()
// sebelum event dikembalikan; invalid → 401 WEBHOOK_SIGNATURE_INVALID.
```

`parseWebhook` dipanggil untuk provider `:provider` yang ada di map `providers`;
provider yang tidak dikenal → `404`.

## Catatan

- Idempotency key wajib untuk `POST /charges` dan `POST /charges/:id/refund`.
  Key sama + payload berbeda → `409 DUPLICATE_IDEMPOTENCY_KEY`.
- `export default app` adalah pola Hono standar. Kalau aplikasi memakai
  top-level `Bun.serve` di file yang sama, jangan `export default app` — Bun akan
  auto-serve dua kali dan memicu `EADDRINUSE` (lihat `examples/hono-api`).
- Tidak ada raw card data (PAN/CVV) di repo ini; `card` menerima token hasil
  tokenisasi di sisi client.
- Error non-`PaymentSDKError` diformat sebagai `500 UNKNOWN` — gunakan custom
  Hono `errorHandler` bila aplikasi butuh format berbeda.
