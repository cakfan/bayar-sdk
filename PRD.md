# PRD — bayar-sdk

> **Unofficial** multi-provider TypeScript SDK untuk integrasi payment gateway di Indonesia (dan global).
> Bukan afiliasi resmi dari Midtrans, Xendit, atau provider manapun.

---

## 1. Problem statement

Setiap payment gateway (Midtrans, Xendit, Stripe, dll) punya bentuk request/response, skema autentikasi, dan mekanisme webhook yang berbeda-beda. Tim yang mengintegrasikan lebih dari satu provider (misal Midtrans untuk lokal + Stripe untuk global, atau migrasi Xendit → Midtrans) harus menulis ulang seluruh integration layer dari nol setiap kali ganti/tambah provider.

`bayar-sdk` menyediakan **satu contract** untuk operasi payment inti — create charge, cek status, refund, parse webhook — supaya consumer app bisa ganti atau menambah provider tanpa mengubah kode bisnisnya.

## 2. Goals

- Satu interface (`PaymentProvider`) yang konsisten lintas provider untuk: membuat charge, mengambil status charge, refund, dan parsing webhook.
- Error dinormalisasi ke satu tipe stabil (`PaymentSDKError`) lintas provider.
- **Idempotency adalah bagian wajib dari contract**, bukan opsional — setiap operasi yang menggerakkan uang (create charge, refund) mewajibkan idempotency key.
- **Verifikasi signature webhook wajib** di setiap provider sebelum payload dianggap valid — tidak ada mode "skip kalau provider tidak sediakan", karena semua provider target di v1 menyediakan mekanisme signature.
- Server-side only secret key. Tidak ada pola "bring-your-own-key" di browser untuk secret key — kalau provider butuh client-side flow (tokenisasi kartu), itu dipisah eksplisit dari SDK inti.
- Runtime-agnostic: Node ≥18, Bun, Deno, Cloudflare Workers (Web-standard API, tanpa dependency Node-only di core & provider package).
- Setiap provider adapter lulus **shared contract test suite** yang sama.

## 3. Non-goals (v1)

- **Tidak** menyediakan komponen UI / checkout form. SDK ini backend-only; kalau provider butuh client-side script (Snap.js, Xendit.js), itu didokumentasikan sebagai integrasi terpisah, bukan bagian dari package inti.
- **Tidak** menyimpan atau memproses data kartu mentah (PAN, CVV) di server manapun. Tokenisasi kartu (kalau didukung) hanya lewat token yang sudah dibuat client-side oleh script resmi provider.
- **Tidak** ada auto-retry bawaan untuk charge yang gagal karena alasan bisnis (saldo tidak cukup, kartu ditolak). SDK hanya expose `retryable` flag; keputusan retry ada di consumer app.
- **Tidak** menangani rekonsiliasi keuangan, settlement report, atau pelaporan pajak.
- **Tidak** ada dukungan subscription/recurring billing di v1 — charge yang didukung adalah one-time payment.
- **Tidak** ada split payment / marketplace disbursement (dana ke banyak sub-merchant) di v1.
- Multi-currency per single charge tidak didukung di v1 — satu charge = satu currency, ditentukan oleh consumer app.

## 4. Target users

Developer/tim engineering yang membangun backend ecommerce atau aplikasi transaksional di Indonesia dan butuh:
- Integrasi cepat ke Midtrans dan/atau Xendit tanpa menulis mapper mentah-mentah.
- Kemampuan ganti provider (atau jalankan multi-provider sekaligus, misal fallback) tanpa refactor besar di kode bisnis.
- Kepastian bahwa webhook yang diterima sudah diverifikasi signature-nya sebelum dipercaya.

## 5. Scope v1

### 5.1 Provider

| Provider | Metode dicakup v1 |
|---|---|
| Midtrans | Core API: Bank Transfer/VA, QRIS, GoPay, Credit Card (charge dengan token dari Snap/3DS, bukan raw card data) |
| Xendit | Payment Request API / Invoice: Virtual Account, QRIS, E-wallet (OVO, DANA, ShopeePay), Credit Card (dengan token) |

Provider tambahan (Stripe, dll) masuk sebagai package terpisah di fase berikutnya, mengikuti contract yang sama.

### 5.2 Operasi inti (per provider, via contract)

- `createCharge()` — buat transaksi baru, wajib `idempotencyKey`.
- `getCharge()` — ambil status transaksi terkini by ID.
- `refund()` — refund penuh atau sebagian, wajib `idempotencyKey`.
- `parseWebhook()` — verifikasi signature lalu normalisasi payload jadi `WebhookEvent`.
- `capturePayment()` *(opsional per provider)* — untuk flow auth-then-capture kartu kredit, kalau provider mendukung.

### 5.3 Error handling

Semua error (HTTP error, validation, business error seperti "saldo tidak cukup") dipetakan ke satu tipe `PaymentSDKError` dengan `code`, `retryable`, `providerErrorCode` untuk audit trail.

### 5.4 Webhook

Signature verification **wajib** dan terjadi di dalam `parseWebhook()` sebelum payload dikembalikan — kalau signature invalid, method ini throw `PaymentSDKError` dengan code `WEBHOOK_SIGNATURE_INVALID`, bukan mengembalikan payload yang belum tervalidasi.

## 6. Out-of-the-box packages (rencana)

| Package | Deskripsi | Target status v1 |
|---|---|---|
| `@bayar-sdk/core` | Types, contract, errors, shared contract test suite | v1 |
| `@bayar-sdk/midtrans` | Adapter Midtrans (charge, status, refund, webhook) | v1 |
| `@bayar-sdk/xendit` | Adapter Xendit (charge, status, refund, webhook) | v1 |
| `@bayar-sdk/hono` | Middleware Hono — expose provider sebagai REST routes | v1.5 |

## 7. Success metrics (kualitatif, untuk v1)

- Consumer app bisa ganti provider default (Midtrans ↔ Xendit) hanya dengan ganti satu baris instansiasi provider, tanpa ubah kode di luar layer integrasi.
- Semua webhook yang diproses lolos verifikasi signature; tidak ada jalur di mana payload webhook dipercaya tanpa verifikasi.
- Retry request `createCharge()`/`refund()` dengan `idempotencyKey` yang sama tidak pernah menghasilkan transaksi duplikat di sisi provider.

## 8. Risiko & pertanyaan terbuka

- **Perbedaan model auth-capture antar provider**: Midtrans dan Xendit tidak sepenuhnya sama dalam mendukung flow "authorize dulu, capture belakangan" untuk kartu kredit. Perlu diputuskan apakah `capturePayment()` jadi optional method di contract (provider yang tidak dukung throw `CAPTURE_NOT_SUPPORTED`) — ini akan difinalkan di `ARCHITECTURE.md`.
- **Refund parsial vs penuh**: kedua provider mendukung, tapi field & response shape beda. Perlu mapper yang jelas per adapter.
- **Status transaksi yang bisa berubah arah** (paid → refunded → *tidak bisa* balik ke paid; pending → expired *tidak bisa* balik ke pending) — state machine ini harus didokumentasikan eksplisit supaya consumer app tidak salah asumsi soal transisi status.
- **Amount & currency**: disepakati integer minor unit (mis. sen/rupiah tanpa desimal) untuk menghindari floating point error, currency eksplisit di setiap request.

## 9. Referensi

Lihat `ARCHITECTURE.md` untuk detail keputusan teknis (struktur monorepo, contract types, error handling, idempotency, webhook, security model, testing, build & release).