# @bayar-sdk/xendit

Adapter Xendit (Payments API / Payment Request) untuk `@bayar-sdk/core`. Provider ini
mengikuti contract `PaymentProvider` dan lolos `runProviderContractTests()`.

Dibangun di atas **Payment Request API** (`POST /v3/payment_requests`, header
`api-version: 2024-11-11`) — bukan hosted Invoice API — karena contract SDK ini
membutuhkan request body spesifik per metode pembayaran (VA, QRIS, e-wallet,
card), yang tidak bisa diekspresikan lewat satu halaman checkout Invoice.

## Instalasi

```bash
bun add @bayar-sdk/core @bayar-sdk/xendit
```

## Quick start

```ts
import { XenditProvider } from "@bayar-sdk/xendit";
import type { ChargeRequest, RefundRequest } from "@bayar-sdk/core";

const provider = new XenditProvider({
	secretKey: process.env.XENDIT_SECRET_KEY,
	callbackToken: process.env.XENDIT_CALLBACK_TOKEN,
	httpClient: { fetch }, // inject httpClient agar mudah di-mock/test
});

const req: ChargeRequest = {
	amount: 50000, // integer minor unit (Rp50.000)
	currency: "IDR",
	paymentMethod: { type: "virtual_account", bank: "BCA" },
	referenceId: "order-123",
};

const result = await provider.createCharge(req, {
	idempotencyKey: "idem-001", // wajib
});
console.log(result.chargeId, result.actions);
```

> Xendit memakai satu host (`api.xendit.co`) untuk test dan live — environment
> ditentukan oleh secret key itu sendiri (test key vs live key), bukan oleh
> host/option. Karena itu adapter tidak punya opsi `environment`.

### Cek status charge

```ts
const charge = await provider.getCharge(result.chargeId);
console.log(charge.normalizedStatus); // "pending" | "paid" | ...
```

### Refund (full & partial)

```ts
const refundReq: RefundRequest = {
	chargeId: result.chargeId,
	// amount: 25000, // opsional — isi untuk partial refund
	// reason: "REQUESTED_BY_CUSTOMER", // opsional, punya default
};

const refund = await provider.refund(refundReq, {
	idempotencyKey: "idem-refund-001", // wajib
});
console.log(refund.refundId, refund.normalizedStatus);
```

Refund hanya diizinkan saat charge berstatus `paid`; selain itu provider melempar
`PaymentSDKError` dengan kode `REFUND_NOT_ALLOWED`. `reason` di Xendit wajib —
kalau tidak diberikan, adapter memakai `REQUESTED_BY_CUSTOMER`.

### Webhook

```ts
// Contoh handler Hono:
app.post("/webhook/xendit", async (c) => {
	const event = await provider.parseWebhook(
		await c.req.json(),
		c.req.raw.headers,
	);
	// Header x-callback-token sudah diverifikasi constant-time sebelum event
	// dikembalikan. Header invalid → WEBHOOK_SIGNATURE_INVALID.
	console.log(event.normalizedStatus);
	return c.text("ok");
});
```

`parseWebhook` membaca header `x-callback-token` dan membandingkannya dengan
`callbackToken` yang dikonfigurasi di dashboard Xendit.

> **Ambil callback token di**: Dashboard Xendit → **Settings → Webhook**
> (section Callbacks) → klik **"View Webhook Verification Token"** (masukkan
> password). URL langsung: `https://dashboard.xendit.co/settings/developers#callbacks`.
> Token unik per akun dan berlaku untuk test & live.

## Metode pembayaran yang didukung (v1)

| Metode SDK           | `channel_code` Xendit |
| -------------------- | --------------------- |
| `virtual_account`    | `BCA`, `BNI`, `BRI`, `MANDIRI`, `PERMATA`, `CIMB`, `BSI`, `DANAMON`, `SEABANK`, `SAQU` |
| `qris`               | `QRIS`                |
| `ewallet`            | `OVO`, `DANA`, `SHOPEEPAY`, `GOJEK`, `LINKAJA` |
| `card` (token-based) | `CARDS`               |

Bank virtual account yang didukung: `bca`, `bni`, `bri`, `mandiri`, `permata`,
`cimb`, `bsi`, `danamon`, `seabank`, `saqu` (input dinormalisasi ke lowercase,
dipetakan ke `channel_code` Xendit uppercase; bank lain melempar `INVALID_REQUEST`).

Channel e-wallet yang didukung: `ovo`, `dana`, `shopeepay`, `gopay` (channel code
`GOJEK`), `linkaja` (channel lain melempar `INVALID_REQUEST`).

## Keterbatasan

- **Card** menerima `token` hasil tokenisasi client-side Xendit — raw card data
  (PAN/CVV) tidak pernah diproses di repo ini.
- `capturePayment()` tidak didukung (charge selalu `AUTOMATIC` capture) —
  melempar `CAPTURE_NOT_SUPPORTED`.
- Idempotency dikelola in-memory per instance provider — untuk multi-instance,
  integrasikan dengan storage eksternal (di luar scope v1).
- Semua amount dalam integer minor unit (IDR default untuk currency; `country`
  diisi `ID` hanya untuk currency `IDR`).
- Mapping error mengikuti pola error Xendit (`error_code` + HTTP status), lihat
  `src/errors.ts` untuk daftar lengkap.
