# @bayar-sdk/midtrans

Adapter Midtrans (Core API v1/v2) untuk `@bayar-sdk/core`. Provider ini mengikuti
contract `PaymentProvider` dan lolos `runProviderContractTests()`.

## Instalasi

```bash
bun add @bayar-sdk/core @bayar-sdk/midtrans
```

## Quick start

```ts
import { MidtransProvider } from "@bayar-sdk/midtrans";
import type { ChargeRequest, RefundRequest } from "@bayar-sdk/core";

const provider = new MidtransProvider({
	serverKey: "server-key-anda",
	httpClient: { fetch }, // inject httpClient agar mudah di-mock/test
	environment: "sandbox", // atau "production" (default: sandbox)
});

const req: ChargeRequest = {
	amount: 50000, // integer minor unit (Rp50.000)
	currency: "IDR",
	method: "virtual_account",
	paymentDetails: {
		bank: "bca",
	},
	metadata: { orderId: "order-123" },
};

const result = await provider.createCharge(req, {
	idempotencyKey: "idem-001", // wajib
});
console.log(result.chargeId, result.actions);
```

### Cek status charge

```ts
const charge = await provider.getCharge(result.chargeId);
console.log(charge.normalizedStatus); // "pending" | "paid" | ...
```

### Refund (full & partial)

```ts
const refundReq: RefundRequest = {
	chargeId: result.chargeId,
	// amount: 50000, // opsional — isi untuk partial refund
};

const refund = await provider.refund(refundReq, {
	idempotencyKey: "idem-refund-001", // wajib
});
console.log(refund.refundId, refund.normalizedStatus);
```

Refund hanya diizinkan saat charge berstatus `paid`; selain itu provider melempar
`PaymentSDKError` dengan kode `REFUND_NOT_ALLOWED`.

### Webhook

```ts
// Contoh handler Hono:
app.post("/webhook/midtrans", async (c) => {
	const event = await provider.parseWebhook(await c.req.json(), c.req.raw.headers);
	// Signature SHA512 sudah diverifikasi sebelum event dikembalikan.
	console.log(event.normalizedStatus);
	return c.text("ok");
});
```

## Metode pembayaran yang didukung (v1)

| Metode SDK            | `payment_type` Midtrans |
| --------------------- | ----------------------- |
| `virtual_account`     | `bank_transfer`         |
| `qris`                | `qris`                  |
| `wallet` (GoPay)      | `gopay`                 |
| `card` (token-based)  | `credit_card`           |

Bank virtual account yang didukung: `bca`, `bni`, `bri`, `permata`, `mandiri`,
`cimb`, `danamon`, `bsi`, `seabank`, `saqu` (input dinormalisasi ke lowercase;
bank lain melempar `INVALID_REQUEST`).

## Keterbatasan

- **Card** menerima `token` hasil snap/3DS — raw card data (PAN/CVV) tidak pernah
  diproses di repo ini.
- `capturePayment()` tidak didukung (Midtrans Core API memisahkan capture hanya
  untuk card authorize) — melempar `CAPTURE_NOT_SUPPORTED`.
- Idempotency dikelola in-memory per instance provider — untuk multi-instance,
  integrasikan dengan storage eksternal (di luar scope v1).
- Semua amount dalam integer minor unit (IDR); string `gross_amount` Midtrans
  di-parse tanpa `parseFloat`.
