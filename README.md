# bayar-sdk

Unofficial multi-provider TypeScript SDK untuk integrasi payment gateway
(Midtrans, Xendit, dst) dengan satu contract yang konsisten. Consumer app bisa
ganti atau menambah provider tanpa mengubah kode bisnis.

**Status: v1 in development** — dokumen desain final ada di
[`ARCHITECTURE.md`](ARCHITECTURE.md); progress per fase di
[`ROADMAP.md`](ROADMAP.md).

## Package

| Package              | Deskripsi                                                              | Status |
| -------------------- | ---------------------------------------------------------------------- | ------ |
| `@bayar-sdk/core`    | Contract `PaymentProvider`, tipe, `PaymentSDKError`, idempotency       | v1     |
| `@bayar-sdk/midtrans`| Adapter Midtrans Core API (charge, status, refund, webhook)            | v1     |
| `@bayar-sdk/xendit`  | Adapter Xendit Payment Request API (charge, status, refund, webhook)   | v1     |
| `@bayar-sdk/hono`    | Middleware Hono: ekspos satu/lebih provider sebagai REST routes        | v1     |

## Instalasi

```bash
bun add @bayar-sdk/core @bayar-sdk/midtrans
```

## Quick start

Pakai provider langsung:

```ts
import { MidtransProvider } from "@bayar-sdk/midtrans";
import type { ChargeRequest } from "@bayar-sdk/core";

const provider = new MidtransProvider({
	serverKey: process.env.MIDTRANS_SERVER_KEY,
	httpClient: { fetch },
	environment: "sandbox",
});

const req: ChargeRequest = {
	amount: 50000, // integer minor unit = Rp50.000
	currency: "IDR",
	paymentMethod: { type: "qris" },
	referenceId: "order-123",
};

const charge = await provider.createCharge(req, { idempotencyKey: "idem-001" });
console.log(charge.chargeId, charge.normalizedStatus);
```

Atau lewat HTTP layer (Hono):

```ts
import { createPaymentRoutes } from "@bayar-sdk/hono";
import { MidtransProvider } from "@bayar-sdk/midtrans";
import { Hono } from "hono";

const app = new Hono();
app.route(
	"/payments",
	createPaymentRoutes({
		providers: { midtrans: new MidtransProvider({ serverKey, httpClient: { fetch } }) },
		defaultProvider: "midtrans",
	}),
);
```

Contoh lengkap ada di `examples/`:

- `examples/node-basic` — pemakaian `MidtransProvider` langsung
  (createCharge, getCharge, refund, parseWebhook).
- `examples/hono-api` — server Hono lengkap dengan Midtrans + Xendit
  sekaligus lewat `createPaymentRoutes`.

## Prinsip inti

- **Satu contract, banyak provider.** Semua tipe publik didefinisikan di
  `@bayar-sdk/core`; adapter hanya mengimplementasikan `PaymentProvider`.
- **Idempotency key wajib** untuk operasi yang memindahkan uang
  (`createCharge`, `refund`).
- **Signature webhook diverifikasi di dalam `parseWebhook()`** sebelum event
  dikembalikan — payload yang gagal verifikasi tidak pernah jadi `WebhookEvent`.
- **Tidak ada raw card data (PAN/CVV).** Card memakai token hasil tokenisasi
  client-side.
- **Amount selalu integer minor unit.** Tidak ada `parseFloat` untuk uang.
- **Error tunggal `PaymentSDKError`** dengan `code`, `provider`,
  `providerErrorCode`, `retryable` untuk audit trail.

## Development

```bash
bun install            # install semua workspace (packages + examples)
bun test               # test semua package
bun run typecheck      # tsc --noEmit semua package (+ examples)
bunx biome check .     # lint & format check
bun run build          # build dist semua package
```

- Cabang: `phase-<n>/<slug-task>` (lihat `AGENTS.md` §5).
- Satu task `ROADMAP.md` = satu PR.
- Dokumen wajib dibaca sebelum coding: `PRD.md` → `ARCHITECTURE.md` →
  `ROADMAP.md`.

## Keamanan

- Jangan pernah commit secret (API key asli, server key, callback token).
- Fixture & contoh memakai nilai dummy (`mock-server-key-xxxx`), bukan kredensial.
- Signature webhook dan auth provider selalu diverifikasi sebelum side effect.

## Lisensi

MIT
