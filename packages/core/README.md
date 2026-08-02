# @bayar-sdk/core

Contract inti multi-provider payment gateway untuk `bayar-sdk`. Semua tipe publik,
error, dan aturan idempotency didefinisikan di package ini — adapter provider
(`@bayar-sdk/midtrans`, `@bayar-sdk/xendit`) hanya mengimplementasikan contract-nya.
Dependency selalu satu arah: provider → core, core tidak pernah import provider.

## Instalasi

```bash
bun add @bayar-sdk/core
```

## Contract `PaymentProvider`

```ts
interface PaymentProvider {
	createCharge(req, opts: { idempotencyKey }): Promise<ChargeResult>;
	getCharge(chargeId: string): Promise<ChargeResult>;
	refund(req, opts: { idempotencyKey }): Promise<RefundResult>;
	parseWebhook(payload: unknown, headers: Headers): Promise<WebhookEvent>;
	capturePayment?(chargeId: string): Promise<ChargeResult>; // opsional
}
```

`capturePayment` opsional — provider yang tidak mendukungnya melempar
`CAPTURE_NOT_SUPPORTED`.

## Tipe utama

### `ChargeRequest`

```ts
interface ChargeRequest {
	amount: number; // integer minor unit, contoh 50000 = Rp50.000
	currency: string;
	paymentMethod: PaymentMethodInput;
	referenceId: string; // id transaksi di aplikasi consumer
	customer?: { name?; email?; phone? };
	description?: string;
	metadata?: Record<string, string>;
}
```

`paymentMethod` adalah discriminated union:

```ts
type PaymentMethodInput =
	| { type: "virtual_account"; bank: string }
	| { type: "qris" }
	| { type: "ewallet"; channel: string }
	| { type: "card"; token: string };
```

`card` menerima **token hasil tokenisasi client-side** — raw card data (PAN/CVV)
tidak pernah diproses di repo ini.

### `PaymentStatus` (state machine)

`pending` → `paid` | `failed` | `expired` | `cancelled`, lalu dari `paid` bisa
`refunded` / `partially_refunded` / `disputed`. Nilai `unknown` untuk status
provider yang belum dikenal. Tidak ada transisi `paid → pending`.

## Idempotency

`createCharge` dan `refund` **wajib** menerima `idempotencyKey`. `assertIdempotencyKey()`
melempar `INVALID_REQUEST` untuk key kosong atau > 128 karakter. Provider
menyimpan hasil per key; key sama + payload sama dikembalikan idempotent, key
sama + payload beda → `DUPLICATE_IDEMPOTENCY_KEY`.

## Error `PaymentSDKError`

Semua error provider dinormalisasi ke satu class:

```ts
class PaymentSDKError extends Error {
	code: PaymentErrorCode;
	provider: string;
	providerErrorCode?: string;
	retryable: boolean;
}
```

| `code`                       | retryable |
| ---------------------------- | --------- |
| `INVALID_REQUEST`            | no        |
| `AUTH_FAILED`                | no        |
| `INSUFFICIENT_BALANCE`       | no        |
| `CHARGE_DECLINED`            | no        |
| `CHARGE_NOT_FOUND`           | no        |
| `DUPLICATE_IDEMPOTENCY_KEY`  | no        |
| `REFUND_EXCEEDS_CHARGE_AMOUNT` | no      |
| `REFUND_NOT_ALLOWED`         | no        |
| `CAPTURE_NOT_SUPPORTED`      | no        |
| `WEBHOOK_SIGNATURE_INVALID`  | no        |
| `PROVIDER_RATE_LIMITED`      | yes       |
| `PROVIDER_UNAVAILABLE`       | yes       |
| `UNKNOWN`                    | no        |

Helper: `isPaymentSDKError(err)` (duck-typing — aman walau ada dua salinan
package), `isRetryable(err)`.

## Webhook

Provider wajib memverifikasi signature di dalam `parseWebhook()` **sebelum**
mengembalikan `WebhookEvent`; signature invalid melempar
`WEBHOOK_SIGNATURE_INVALID`. Payload yang tidak lolos verifikasi tidak pernah
menjadi event.

## Testing utilities

`@bayar-sdk/core/testing` menyediakan `runProviderContractTests()` — satu suite
contract yang memastikan adapter mematuhi `PaymentProvider`, termasuk status
state machine dan idempotency. Provider baru wajib lolos suite ini.

## Dokumen

- [PRD](https://github.com/cakfan/bayar-sdk/blob/main/PRD.md) — apa yang dibangun & scope v1.
- [ARCHITECTURE](https://github.com/cakfan/bayar-sdk/blob/main/ARCHITECTURE.md) — keputusan teknis & state machine.
- [ROADMAP](https://github.com/cakfan/bayar-sdk/blob/main/ROADMAP.md) — progress per fase.
- [CONTRIBUTING](https://github.com/cakfan/bayar-sdk/blob/main/CONTRIBUTING.md) — cara berkontribusi & release.
