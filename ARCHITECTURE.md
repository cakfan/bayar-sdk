# ARCHITECTURE — bayar-sdk

Referensi: `PRD.md`

---

## 1. Monorepo layout

```
bayar-sdk/
├── packages/
│   ├── core/                      @bayar-sdk/core
│   │   ├── src/
│   │   │   ├── types.ts           ChargeRequest, ChargeResult, RefundRequest, RefundResult, WebhookEvent
│   │   │   ├── contract.ts        interface PaymentProvider
│   │   │   ├── errors.ts          PaymentSDKError + error codes
│   │   │   ├── idempotency.ts     util validasi/generate idempotency key
│   │   │   └── index.ts
│   │   ├── testing/
│   │   │   └── contract-tests.ts  runProviderContractTests()
│   │   └── package.json
│   │
│   ├── provider-midtrans/         @bayar-sdk/midtrans
│   │   ├── src/
│   │   │   ├── adapter.ts         class MidtransProvider implements PaymentProvider
│   │   │   ├── mapper.ts          normalisasi request/response Midtrans ↔ tipe core
│   │   │   ├── webhook.ts         verifySignature() + parseWebhook()
│   │   │   ├── errors.ts          map error code Midtrans → PaymentSDKError
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── provider-xendit/           @bayar-sdk/xendit
│   │   └── (struktur sama seperti midtrans)
│   │
│   └── hono/                      @bayar-sdk/hono
│       ├── src/
│       │   ├── middleware.ts      createPaymentRoutes(providers) → Hono app
│       │   └── index.ts
│       └── package.json
│
├── examples/
│   ├── node-basic/
│   └── hono-api/
├── .changeset/
├── package.json                   workspace root
├── tsconfig.base.json
└── biome.json
```

Setiap package publish independen ke npm dengan nama scoped `@bayar-sdk/*`.

## 2. Alur data & dependency arah

```
consumer app (server-side only)
   │
   ▼
@bayar-sdk/midtrans  ──┐
@bayar-sdk/xendit    ──┼──► implements ──► @bayar-sdk/core (contract, types, errors, idempotency util)
@bayar-sdk/hono       ──┘
```

- Provider package **bergantung ke core**, tidak sebaliknya. Core tidak pernah import dari provider package manapun.
- `@bayar-sdk/hono` bergantung ke core saja (menerima instance `PaymentProvider` apapun sebagai parameter), tidak hardcode ke provider tertentu.
- Tidak ada jalur di mana SDK ini diimpor langsung ke kode client-side/browser dengan secret key — lihat §8 Security model.

## 3. Contract inti

```typescript
interface PaymentProvider {
  createCharge(
    req: ChargeRequest,
    opts: { idempotencyKey: string }
  ): Promise<ChargeResult>

  getCharge(chargeId: string): Promise<ChargeResult>

  refund(
    req: RefundRequest,
    opts: { idempotencyKey: string }
  ): Promise<RefundResult>

  parseWebhook(payload: unknown, headers: Headers): Promise<WebhookEvent>

  // Opsional: hanya provider yang mendukung auth-then-capture wajib implement.
  // Provider yang tidak mendukung melempar PaymentSDKError code CAPTURE_NOT_SUPPORTED.
  capturePayment?(chargeId: string): Promise<ChargeResult>
}
```

### 3.1 Types

```typescript
interface ChargeRequest {
  amount: number              // integer, minor unit (mis. Rupiah tanpa desimal)
  currency: string            // ISO 4217, mis. 'IDR'
  paymentMethod: PaymentMethodInput
  referenceId: string         // ID transaksi di sisi consumer, diteruskan ke provider sebagai external reference
  customer?: {
    name?: string
    email?: string
    phone?: string
  }
  description?: string
  metadata?: Record<string, string>
}

type PaymentMethodInput =
  | { type: 'virtual_account'; bank: string }
  | { type: 'qris' }
  | { type: 'ewallet'; channel: string }          // 'gopay' | 'ovo' | 'dana' | 'shopeepay' dst
  | { type: 'card'; token: string }               // token dari tokenisasi client-side, BUKAN raw card data

interface ChargeResult {
  provider: string
  chargeId: string                                 // ID transaksi di sistem provider
  referenceId: string
  status: string                                    // status mentah provider
  normalizedStatus: PaymentStatus
  amount: number
  currency: string
  paymentMethod: PaymentMethodInput['type']
  actions?: {                                       // instruksi lanjutan kalau ada (VA number, QR string, redirect URL)
    type: 'va_number' | 'qr_string' | 'redirect_url'
    value: string
  }[]
  expiresAt?: string
  createdAt: string
  rawResponse: unknown
}

type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded'
  | 'disputed'
  | 'unknown'

interface RefundRequest {
  chargeId: string
  amount?: number              // kosong = refund penuh
  reason?: string
}

interface RefundResult {
  provider: string
  refundId: string
  chargeId: string
  amount: number
  status: string
  normalizedStatus: 'pending' | 'succeeded' | 'failed'
  createdAt: string
  rawResponse: unknown
}

interface WebhookEvent {
  id: string                   // event id asli dari provider; fallback: sdk:${sha256(provider+chargeId+status+timestamp)}
  provider: string
  type: string
  chargeId: string
  status: string                // status mentah provider
  normalizedStatus: PaymentStatus
  amount?: number
  timestamp: string
  rawPayload: unknown
}
```

### 3.2 Alasan desain

- `amount` selalu integer minor unit — menghindari floating point error pada operasi uang.
- `paymentMethod` sebagai discriminated union per tipe — supaya field yang wajib per metode (mis. `bank` untuk VA, `channel` untuk e-wallet) tervalidasi di level tipe, bukan bocor jadi optional field campur aduk.
- `token` untuk kartu, bukan data kartu mentah — SDK backend ini tidak pernah menyentuh PAN/CVV (lihat §8).
- `referenceId` wajib di `ChargeRequest` (bukan opsional seperti di SDK lain) karena dipakai provider untuk deteksi duplikasi di sisi mereka selain idempotency key SDK sendiri — dua lapis proteksi terhadap double charge.

## 4. Error handling

### 4.1 Normalisasi

```typescript
class PaymentSDKError extends Error {
  code: PaymentErrorCode
  provider: string
  providerErrorCode?: string
  retryable: boolean
  cause?: unknown
}

type PaymentErrorCode =
  | 'INVALID_REQUEST'
  | 'AUTH_FAILED'
  | 'INSUFFICIENT_BALANCE'
  | 'CHARGE_DECLINED'
  | 'CHARGE_NOT_FOUND'
  | 'DUPLICATE_IDEMPOTENCY_KEY'      // idempotency key sama tapi payload beda
  | 'REFUND_EXCEEDS_CHARGE_AMOUNT'
  | 'REFUND_NOT_ALLOWED'              // charge belum settle / sudah full-refunded
  | 'CAPTURE_NOT_SUPPORTED'
  | 'WEBHOOK_SIGNATURE_INVALID'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'UNKNOWN'
```

### 4.2 Tanggung jawab per layer

- **Provider adapter**: tahu bentuk error asli providernya, map ke `PaymentErrorCode` yang tepat + isi `providerErrorCode`.
- **Core**: tidak pernah generate error provider-specific, hanya expose tipe dan util (`isRetryable(err)`, `isPaymentSDKError(err)`).
- **Consumer**: selalu bisa `catch (err) { if (err instanceof PaymentSDKError) ... }` tanpa peduli provider mana yang dipakai.

### 4.3 Retry policy

- `retryable: true` hanya untuk error kategori transient (`PROVIDER_RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, timeout jaringan).
- Error bisnis (`CHARGE_DECLINED`, `INSUFFICIENT_BALANCE`) selalu `retryable: false` — retry tidak akan mengubah hasil dan berisiko dianggap sebagai upaya charge baru kalau idempotency key ikut diganti.
- SDK **tidak** retry otomatis. Consumer app yang memutuskan strategi retry, dan **wajib** memakai idempotency key yang sama kalau retry adalah request yang sama secara logis.

## 5. Idempotency (wajib, bukan opsional)

Berbeda dari domain lain, di payment idempotency bukan best-effort — kegagalan di sini berarti duit hilang atau dobel tertarik.

- `createCharge()` dan `refund()` **mewajibkan** parameter `idempotencyKey` di level tipe (bukan optional field).
- SDK meneruskan `idempotencyKey` ke header/parameter idempotency native milik provider (Midtrans: header khusus per endpoint Core API; Xendit: header `Idempotency-key`).
- Kalau consumer memanggil ulang dengan `idempotencyKey` yang sama tapi payload request berbeda, adapter melempar `PaymentSDKError` code `DUPLICATE_IDEMPOTENCY_KEY` alih-alih diam-diam memproses sebagai request baru.
- Core menyediakan util `assertIdempotencyKey(key: string)` yang validasi format (non-empty, panjang wajar) sebelum diteruskan ke provider — mencegah consumer app lupa generate key dan asal kirim string kosong.

## 6. Webhook handling

```typescript
parseWebhook(payload: unknown, headers: Headers): Promise<WebhookEvent>
```

> `parseWebhook()` bersifat **async** karena verifikasi signature memakai Web Crypto (`crypto.subtle.digest`) yang berbasis Promise — tidak ada varian sinkron di Web-standard API. Ini berlaku untuk semua provider.

- Verifikasi signature **wajib** dan terjadi *di dalam* `parseWebhook()`, sebelum payload dikembalikan ke consumer. Tidak ada mode "skip verifikasi" — semua provider target v1 menyediakan mekanisme signature.
- Signature invalid → `parseWebhook()` reject dengan `PaymentSDKError` code `WEBHOOK_SIGNATURE_INVALID`. Consumer app **tidak pernah** menerima `WebhookEvent` dari payload yang belum tervalidasi.
- Mekanisme signature per provider (detail final ada di README masing-masing adapter):
  - **Midtrans**: `signature_key` di body notification, dihitung sebagai `SHA512(order_id + status_code + gross_amount + ServerKey)`. Adapter hitung ulang dan bandingkan dengan yang dikirim.
  - **Xendit**: header `x-callback-token` dibandingkan dengan callback verification token yang dikonfigurasi di dashboard Xendit (constant-time comparison, bukan `===` biasa, untuk menghindari timing attack).
- Hasil dinormalisasi ke `WebhookEvent` (lihat §3.1). Prioritas `id`: pakai event ID asli dari provider kalau tersedia; kalau tidak, generate hash deterministik dari field stabil (`provider + chargeId + status + timestamp`) — **bukan random UUID** — supaya retry webhook identik dari provider menghasilkan `id` yang sama dan tetap idempotent di sisi consumer.
- **Idempotency penyimpanan webhook bukan tanggung jawab SDK** — itu keputusan consumer app (mis. unique constraint `(provider, event_id)` di database mereka). SDK hanya menjamin `WebhookEvent.id` konsisten/stabil supaya bisa dipakai sebagai idempotency key oleh consumer.
- `@bayar-sdk/hono` menyediakan helper route `POST /webhooks/:provider` yang otomatis pilih adapter sesuai param URL, panggil `parseWebhook()`, dan mengembalikan 401 kalau signature invalid.

## 7. Security model

Ini adalah perbedaan paling mendasar dibanding SDK read-only/low-risk:

- **Secret key hanya dipakai server-side.** SDK core dan provider package didesain untuk dijalankan di server (Node/Bun/Deno/Workers), **tidak** untuk diimpor ke bundle client-side dengan secret key tertanam.
- **Tidak ada raw card data yang lewat SDK ini.** Untuk pembayaran kartu, tokenisasi (Midtrans Snap/3DS, Xendit tokenization) terjadi di client-side lewat script resmi provider yang di-load langsung dari domain provider (bukan lewat SDK ini). SDK hanya menerima `token` hasil tokenisasi tersebut di `ChargeRequest.paymentMethod`. Ini menjaga aplikasi consumer tidak masuk cakupan PCI-DSS SAQ yang lebih berat.
- **Public/client key (kalau ada) dipisah secara eksplisit** dari secret key di level konfigurasi adapter — constructor provider hanya menerima secret key server-side; kalau consumer butuh client key untuk script frontend, itu didokumentasikan terpisah di README, bukan diekspos lewat SDK.
- **Webhook endpoint harus idle-safe**: signature verification terjadi sebelum logic apapun dijalankan, supaya request yang gagal verifikasi tidak memicu efek samping (mis. update status order) sama sekali.

## 8. State machine status pembayaran

Berbeda dari status pengiriman yang umumnya linear, status payment punya percabangan dan **tidak semua transisi valid dua arah**:

```
pending ──► paid ──► refunded
   │          │  └──► partially_refunded
   │          └──► disputed
   ├──► expired
   ├──► cancelled
   └──► failed ──(consumer app boleh buat charge baru, TAPI ini charge baru, bukan retry status lama)
```

- `paid → pending` **tidak pernah terjadi**. Kalau provider mengirim event yang seolah begitu, adapter harus treat sebagai anomaly dan log, bukan menimpa status yang sudah final.
- `expired`, `cancelled`, `failed` adalah status akhir untuk charge tersebut — untuk mencoba lagi, consumer app membuat `createCharge()` baru dengan `referenceId` baru, bukan mengubah status charge lama.
- `refunded`/`partially_refunded` hanya valid dari status `paid`. `refund()` pada charge yang belum `paid` melempar `PaymentSDKError` code `REFUND_NOT_ALLOWED`.
- Setiap adapter wajib punya fungsi mapping status mentah provider → `PaymentStatus` yang konsisten dengan state machine ini, diuji lewat contract test suite (lihat §9).

## 9. Testing strategy

### 9.1 Level testing

| Level | Scope | Tool |
|---|---|---|
| Unit | Mapper/normalizer per provider (payload mentah → tipe core) | Bun test / Vitest |
| Contract test | Semua provider adapter lulus test suite yang sama (`shared-contract-tests`) | Bun test |
| Integration (opsional, manual) | Panggil API asli pakai API key sandbox | Terpisah dari CI, dijalankan manual |

### 9.2 Contract test suite

```typescript
import { runProviderContractTests } from '@bayar-sdk/core/testing'

runProviderContractTests(() => new MidtransProvider({ serverKey: 'mock', httpClient: mockClient }))
```

Test wajib yang dicakup suite ini (minimum, tidak lengkap):

- `createCharge()` tanpa `idempotencyKey` → TypeScript compile error (tipe wajib) — divalidasi lewat test tipe, bukan runtime.
- `createCharge()` dengan `idempotencyKey` sama + payload identik dua kali → hasil `chargeId` sama, tidak membuat charge baru (mock).
- `createCharge()` dengan `idempotencyKey` sama + payload berbeda → throw `DUPLICATE_IDEMPOTENCY_KEY`.
- `parseWebhook()` dengan signature invalid → throw `WEBHOOK_SIGNATURE_INVALID`, tidak mengembalikan `WebhookEvent`.
- `parseWebhook()` dengan signature valid → `WebhookEvent.id` stabil kalau dipanggil dua kali dengan payload identik.
- `refund()` pada charge berstatus `pending` → throw `REFUND_NOT_ALLOWED`.
- Status mapping mentah provider → `normalizedStatus` sesuai state machine §8.

### 9.3 Mock provider HTTP

- Tiap provider adapter menerima `httpClient` sebagai dependency injection (bukan hardcode `fetch` langsung), supaya mudah di-mock di test.
- Fixture response asli (JSON) dari tiap provider disimpan di `__fixtures__/` per package, dipakai untuk regression test kalau provider ubah response shape.
- Fixture webhook payload **termasuk contoh dengan signature valid dan invalid**, supaya jalur signature-rejection selalu tercakup di test, bukan cuma happy path.

### 9.4 CI

- Setiap PR: lint, typecheck, unit test, contract test — semua tanpa perlu API key asli.
- Tidak ada integration test otomatis di CI (menghindari kebutuhan simpan secret provider — apalagi secret key payment — di GitHub Actions untuk repo open source publik).

## 10. Build & release

- Build per package pakai `tsup` → output `dist/` dengan `.js` (ESM), `.cjs` (CJS), `.d.ts`.
- `package.json` tiap package: `"exports"` field dual ESM/CJS, `"sideEffects": false` untuk tree-shaking.
- Versioning lewat Changesets (independen per package): `bunx changeset` saat PR berisi perubahan yang perlu rilis → `bunx changeset version` → commit ke `main`.
- Dep internal antar package memakai range versi (`"@bayar-sdk/core": "^1.0.0"`), bukan `workspace:*`.
- Publish otomatis dari GitHub Actions (`.github/workflows/release.yml`, trigger push ke `main`) memakai Trusted Publishing (OIDC) npm — tanpa token tersimpan. Prasyarat: npm CLI ≥11.5.1, runner GitHub-hosted, `id-token: write`, field `repository` di tiap `package.json`.
- Workflow: lint → typecheck → test → build → `npm publish --provenance --access public` per package (urutan `core` → `midtrans` → `xendit` → `hono`), melewati package yang versinya sudah ada di registry.
- Jangan publish langsung dari mesin lokal — publish hanya via CI agar identity & provenance konsisten.

## 11. Runtime compatibility

- Core dan provider package **tidak boleh** pakai API spesifik Node (`fs`, `crypto` Node-only) — pakai Web-standard API (`fetch`, `crypto.subtle`) supaya jalan di Cloudflare Workers/Deno/Bun/Node ≥18 tanpa polyfill. Ini termasuk perhitungan signature (`crypto.subtle.digest` untuk SHA512/HMAC), bukan `require('crypto')` gaya Node.
- `@bayar-sdk/hono` boleh assume runtime yang Hono dukung (semuanya di atas juga kompatibel).

## 12. Hono middleware (REST contract)

`@bayar-sdk/hono` menyediakan `createPaymentRoutes()` yang mengubah satu atau lebih `PaymentProvider` menjadi Hono sub-app:

```typescript
createPaymentRoutes({
  providers: Record<string, PaymentProvider>,   // key = slug di URL, misal 'midtrans' | 'xendit'
  defaultProvider?: string,                      // dipakai kalau consumer tidak spesifikkan provider per request
})
```

- `POST /charges` — body `ChargeRequest` (zod-validated) + header `Idempotency-Key` wajib. Response `ChargeResult` HTTP 201.
- `GET /charges/:id` — ambil status charge terkini.
- `POST /charges/:id/refund` — body `RefundRequest` + header `Idempotency-Key` wajib.
- `POST /webhooks/:provider` — pilih adapter sesuai param URL, verifikasi signature, lalu proses `WebhookEvent`. Response 401 kalau signature invalid, 200 kalau valid (walau event-nya di-skip di sisi consumer).
- `PaymentSDKError` → JSON `{ error: { code, message, provider, providerErrorCode, retryable } }` dengan status HTTP: 401 (auth/signature), 404 (charge tidak ditemukan), 409 (`DUPLICATE_IDEMPOTENCY_KEY`), 422 (`REFUND_NOT_ALLOWED`/`REFUND_EXCEEDS_CHARGE_AMOUNT`), 429 (rate limit), 502 (provider unavailable), 500 (unknown). Error validasi → 400 `VALIDATION_ERROR`.
- `hono` & `zod` adalah peerDependencies.

## 13. Status

Keputusan arsitektur di dokumen ini final untuk v1. Detail implementasi (edge case per provider, mis. format exact signature Midtrans vs Xendit) boleh muncul saat coding, tapi tidak mengubah contract publik (§3, §4, §5) tanpa update dokumen ini dulu.