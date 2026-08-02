# bayar-sdk

Multi-provider TypeScript SDK untuk integrasi payment gateway Indonesia dengan
**satu contract yang konsisten** — ganti atau tambah provider (Midtrans, Xendit,
dst) tanpa mengubah kode bisnis.

[![npm @bayar-sdk/core](https://img.shields.io/npm/v/@bayar-sdk/core)](https://www.npmjs.com/package/@bayar-sdk/core)
[![npm @bayar-sdk/midtrans](https://img.shields.io/npm/v/@bayar-sdk/midtrans)](https://www.npmjs.com/package/@bayar-sdk/midtrans)
[![npm @bayar-sdk/xendit](https://img.shields.io/npm/v/@bayar-sdk/xendit)](https://www.npmjs.com/package/@bayar-sdk/xendit)
[![npm @bayar-sdk/hono](https://img.shields.io/npm/v/@bayar-sdk/hono)](https://www.npmjs.com/package/@bayar-sdk/hono)
[![CI](https://img.shields.io/github/actions/workflow/status/cakfan/bayar-sdk/ci.yml)](https://github.com/cakfan/bayar-sdk/actions)
[![License: MIT](https://img.shields.io/npm/l/@bayar-sdk/core)](LICENSE)

> **Unofficial** — bukan afiliasi resmi Midtrans, Xendit, atau provider lain.
> **Status: v1 in development** — Fase 1–7 selesai. Keputusan desain final di
> [`ARCHITECTURE.md`](ARCHITECTURE.md), progress per fase di
> [`ROADMAP.md`](ROADMAP.md).

---

## Kenapa bayar-sdk

Setiap payment gateway punya bentuk request/response, skema autentikasi, dan
mekanisme webhook yang berbeda. Tim yang memakai lebih dari satu provider harus
menulis ulang integration layer dari nol setiap kali ganti/tambah provider.

`bayar-sdk` menyatukan operasi payment inti — **create charge, cek status,
refund, parse webhook** — di balik satu interface `PaymentProvider`. Consumer
app cukup menukar satu baris instansiasi provider:

```ts
const provider = new MidtransProvider({ ... }); // → new XenditProvider({ ... })
```

## Fitur

- **Satu contract, banyak provider** — semua tipe publik didefinisikan di
  `@bayar-sdk/core`; adapter hanya mengimplementasikan `PaymentProvider`.
- **Idempotency wajib** untuk operasi yang memindahkan uang (`createCharge`,
  `refund`) — retry dengan key yang sama tidak pernah menghasilkan duplikat.
- **Signature webhook diverifikasi di dalam `parseWebhook()`** — payload yang
  gagal verifikasi tidak pernah jadi `WebhookEvent`.
- **Error ternormalisasi** — semua error provider dipetakan ke satu
  `PaymentSDKError` dengan `code`, `provider`, `providerErrorCode`, `retryable`.
- **Runtime-agnostic** — Web-standard API (`fetch`, `crypto.subtle`), tanpa
  dependency Node-only: Node ≥18, Bun, Deno, Cloudflare Workers.
- **Shared contract test suite** — setiap adapter baru wajib lolos
  `runProviderContractTests()` dari `@bayar-sdk/core/testing`.

## Package

| Package                | Deskripsi                                                            |
| ---------------------- | -------------------------------------------------------------------- |
| [`@bayar-sdk/core`](packages/core/README.md)     | Contract `PaymentProvider`, tipe, `PaymentSDKError`, idempotency, test suite |
| [`@bayar-sdk/midtrans`](packages/provider-midtrans/README.md) | Adapter Midtrans Core API (charge, status, refund, webhook)          |
| [`@bayar-sdk/xendit`](packages/provider-xendit/README.md)     | Adapter Xendit Payment Request API (charge, status, refund, webhook) |
| [`@bayar-sdk/hono`](packages/hono/README.md)      | Middleware Hono — ekspos provider sebagai REST routes                |

## Instalasi

```bash
bun add @bayar-sdk/core @bayar-sdk/midtrans
```

```bash
npm install @bayar-sdk/core @bayar-sdk/midtrans
# atau
pnpm add @bayar-sdk/core @bayar-sdk/midtrans
```

Untuk lapisan HTTP, tambahkan `@bayar-sdk/hono` (butuh `hono` & `zod` sebagai
peer dependency).

## Quick start

### Provider langsung

```ts
import { MidtransProvider } from "@bayar-sdk/midtrans";
import type { ChargeRequest, RefundRequest } from "@bayar-sdk/core";

const provider = new MidtransProvider({
	serverKey: process.env.MIDTRANS_SERVER_KEY,
	httpClient: { fetch }, // inject httpClient agar mudah di-mock/test
	environment: "sandbox", // atau "production" (default: sandbox)
});

// Buat charge — wajib idempotencyKey.
const req: ChargeRequest = {
	amount: 50000, // integer minor unit = Rp50.000
	currency: "IDR",
	paymentMethod: { type: "qris" },
	referenceId: "order-123",
};

const charge = await provider.createCharge(req, { idempotencyKey: "idem-001" });
console.log(charge.chargeId, charge.normalizedStatus); // "pending" | "paid" | ...
```

Refund penuh/parsial:

```ts
const refund = await provider.refund(
	{ chargeId: charge.chargeId /*, amount: 25000 */ }, // amount = partial refund
	{ idempotencyKey: "idem-refund-001" },
);
console.log(refund.refundId, refund.normalizedStatus);
```

### Webhook

```ts
app.post("/webhook/midtrans", async (c) => {
	// Signature SHA512 diverifikasi di dalam parseWebhook() sebelum event
	// dikembalikan; invalid → throw PaymentSDKError WEBHOOK_SIGNATURE_INVALID.
	const event = await provider.parseWebhook(await c.req.json(), c.req.raw.headers);
	console.log(event.normalizedStatus);
	return c.text("ok");
});
```

### Lapisan HTTP (Hono)

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
			midtrans: new MidtransProvider({ serverKey, httpClient: { fetch }, environment: "sandbox" }),
			xendit: new XenditProvider({ secretKey, callbackToken, httpClient: { fetch } }),
		},
		defaultProvider: "midtrans",
	}),
);
```

Contoh lengkap: [`examples/node-basic`](examples/node-basic/README.md) (pemakaian
provider langsung) dan [`examples/hono-api`](examples/hono-api/README.md) (server
Hono dengan Midtrans + Xendit sekaligus).

## Konsep inti

### Contract `PaymentProvider`

```ts
interface PaymentProvider {
	createCharge(req: ChargeRequest, opts: { idempotencyKey: string }): Promise<ChargeResult>;
	getCharge(chargeId: string): Promise<ChargeResult>;
	refund(req: RefundRequest, opts: { idempotencyKey: string }): Promise<RefundResult>;
	parseWebhook(payload: unknown, headers: Headers): Promise<WebhookEvent>;
	capturePayment?(chargeId: string): Promise<ChargeResult>; // opsional
}
```

`paymentMethod` adalah discriminated union:
`virtual_account` (`bank`), `qris`, `ewallet` (`channel`), `card` (`token`).
**Card menerima token hasil tokenisasi client-side** — raw card data (PAN/CVV)
tidak pernah diproses di repo ini.

### Error `PaymentSDKError`

Semua error dinormalisasi ke satu class: `code`, `provider`,
`providerErrorCode`, `retryable`. Gunakan `isPaymentSDKError(err)` untuk type
guard (aman walau ada dua salinan package) dan `isRetryable(err)` untuk
keputusan retry.

| `code` | retryable |
| --- | --- |
| `INVALID_REQUEST` | no |
| `AUTH_FAILED` | no |
| `INSUFFICIENT_BALANCE` | no |
| `CHARGE_DECLINED` | no |
| `CHARGE_NOT_FOUND` | no |
| `DUPLICATE_IDEMPOTENCY_KEY` | no |
| `REFUND_EXCEEDS_CHARGE_AMOUNT` | no |
| `REFUND_NOT_ALLOWED` | no |
| `CAPTURE_NOT_SUPPORTED` | no |
| `WEBHOOK_SIGNATURE_INVALID` | no |
| `PROVIDER_RATE_LIMITED` | yes |
| `PROVIDER_UNAVAILABLE` | yes |
| `UNKNOWN` | no |

### State machine `PaymentStatus`

`pending` → `paid` \| `failed` \| `expired` \| `cancelled`, lalu dari `paid` bisa
`refunded` / `partially_refunded` / `disputed`. Nilai `unknown` untuk status
yang belum dikenal. Tidak ada transisi yang mundur (mis. `paid → pending`).

### Idempotency

`createCharge` dan `refund` **wajib** menerima `idempotencyKey`. Key sama +
payload sama → hasil yang sama dikembalikan (idempotent). Key sama + payload
beda → `DUPLICATE_IDEMPOTENCY_KEY`.

## Routes Hono (`@bayar-sdk/hono`)

| Method | Path | Keterangan |
| --- | --- | --- |
| POST | `/charges` | Buat charge via `defaultProvider`. Wajib header `Idempotency-Key` → 201 |
| GET | `/charges/:id` | Ambil detail charge |
| POST | `/charges/:id/refund` | Refund. Wajib header `Idempotency-Key` → 200 |
| POST | `/webhooks/:provider` | Verifikasi signature + parse event |

Mapping `PaymentErrorCode` → HTTP mengikuti `ARCHITECTURE.md` §12:
`400` validasi/invalid, `401` auth/signature, `404` not found,
`409` duplikat idempotency, `422` refund/business declined, `429` rate limit,
`502` provider unavailable, `500` unknown. Semua response error berbentuk JSON
konsisten `{ error: { code, message, provider, providerErrorCode, retryable } }`.

## Matriks dukungan provider (v1)

| Metode SDK | Midtrans (`payment_type`) | Xendit (`channel_code`) |
| --- | --- | --- |
| `virtual_account` | `bank_transfer` | `BCA`, `BNI`, `BRI`, dll. |
| `qris` | `qris` | `QRIS` |
| `ewallet` | `gopay` | `OVO`, `DANA`, `SHOPEEPAY`, `GOJEK`, `LINKAJA` |
| `card` (token-based) | `credit_card` | `CARDS` |

Bank virtual account yang didukung (kedua provider): `bca`, `bni`, `bri`,
`permata`, `mandiri`, `cimb`, `danamon`, `bsi`, `seabank`, `saqu`.

Channel e-wallet Xendit: `ovo`, `dana`, `shopeepay`, `gopay`, `linkaja`.

## FAQ

**Apakah bayar-sdk siap untuk produksi?**
Belum — status `v1 in development`, semua package masih di versi `0.0.0`. Core
contract sudah stabil secara struktur dan lolos 189 unit test, tapi API publik
masih bisa berubah sebelum `1.0.0`.

**Butuh server key?**
Ya. Setiap provider memakai kunci Anda sendiri (bring-your-own-key). SDK tidak
menyimpan atau mem-proxy kunci ke server mana pun. Jangan pernah meletakkan
server key di kode client/browser.

**Runtime apa yang didukung?**
Node ≥18, Bun, Deno, dan Cloudflare Workers — semua kode memakai Web-standard
API (`fetch`, `crypto.subtle`) tanpa dependency Node-only.

**Bagaimana cara ganti provider?**
Cukup ganti instansiasi provider (dan konfigurasi webhook di dashboard
provider). Kode bisnis yang memakai `ChargeRequest`/`ChargeResult`/`PaymentSDKError`
tidak berubah.

**Bagaimana dukungan metode pembayaran di masa depan?**
Metode baru (mis. BNPL, paylater) dan provider baru mengikuti contract yang sama
sebagai package terpisah — lihat `ROADMAP.md` Fase 8.

## Dokumentasi

- [`PRD.md`](PRD.md) — apa yang dibangun & non-goals v1.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — keputusan teknis, state machine, mapping error, release.
- [`ROADMAP.md`](ROADMAP.md) — progress per fase.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — cara berkontribusi, versioning & proses release.
- [`AGENTS.md`](AGENTS.md) — aturan operasional untuk AI coding agent.

## Development

```bash
bun install            # install semua workspace (packages + examples)
bun test --workspaces  # test semua package
bun run typecheck      # tsc --noEmit semua package (+ examples)
bunx biome check .     # lint & format check
bun run build          # build dist semua package
```

## Keamanan

- Jangan pernah commit secret (API key asli, server key, callback token).
- Fixture & contoh memakai nilai dummy (`mock-server-key-xxxx`), bukan kredensial.
- Signature webhook dan auth provider selalu diverifikasi sebelum side effect.
- Tidak ada raw card data (PAN/CVV) di kode manapun di repo ini.

## Lisensi

MIT
