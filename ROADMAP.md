# ROADMAP — bayar-sdk

Referensi: `PRD.md`, `ARCHITECTURE.md`, `AGENTS.md`

Setiap task dirancang jadi unit kerja kecil (idealnya satu task = satu PR, satu sesi kerja AI agent). Task diurutkan; task dengan tanda **(blocked by: X)** butuh task X selesai lebih dulu. Checklist `[ ]` diupdate manual jadi `[x]` saat task selesai dan lolos Definition of Done di `AGENTS.md` §4.

---

## Fase 0 — Setup repo & tooling

- [x] **0.1** Init monorepo: `package.json` root dengan Bun workspaces (`packages/*`), `tsconfig.base.json`, `biome.json`.
- [x] **0.2** Setup `.gitignore`, `.env.example` (kosong, hanya nama variabel: `MIDTRANS_SERVER_KEY`, `XENDIT_SECRET_KEY`, dst — tanpa nilai asli).
- [x] **0.3** Setup `.changeset/` untuk versioning per package (config awal, belum ada changeset entry).
- [x] **0.4** Buat `packages/core/package.json` kosong (nama `@bayar-sdk/core`, field `exports` dual ESM/CJS, `sideEffects: false`) — belum ada source code.
- [x] **0.5** Setup `tsup.config.ts` template yang dipakai ulang di semua package (build ke `dist/` dengan `.js`, `.cjs`, `.d.ts`).
- [x] **0.6** Setup GitHub Actions workflow `ci.yml`: lint → typecheck → test (tanpa build/publish dulu), trigger di setiap PR.

## Fase 1 — Core: types & contract

**(blocked by: 0.4)**

- [x] **1.1** Buat `packages/core/src/types.ts` — definisikan `ChargeRequest`, `PaymentMethodInput` (discriminated union), sesuai `ARCHITECTURE.md` §3.1. Tanpa logic, hanya tipe.
- [x] **1.2** Tambah ke `types.ts`: `ChargeResult`, `PaymentStatus` enum, sesuai state machine di `ARCHITECTURE.md` §8.
- [x] **1.3** Tambah ke `types.ts`: `RefundRequest`, `RefundResult`.
- [x] **1.4** Tambah ke `types.ts`: `WebhookEvent`.
- [x] **1.5** Buat `packages/core/src/contract.ts` — interface `PaymentProvider` (method `createCharge`, `getCharge`, `refund`, `parseWebhook`, `capturePayment?`), import tipe dari `types.ts`.
- [x] **1.6** Buat `packages/core/src/errors.ts` — class `PaymentSDKError` + enum `PaymentErrorCode` sesuai `ARCHITECTURE.md` §4.1. Tambah util `isPaymentSDKError(err)` dan `isRetryable(err)`.
- [x] **1.7** Buat `packages/core/src/idempotency.ts` — util `assertIdempotencyKey(key: string): void` yang throw kalau key kosong/format tidak valid.
- [x] **1.8** Buat `packages/core/src/index.ts` — re-export semua public API dari `types.ts`, `contract.ts`, `errors.ts`, `idempotency.ts`.
- [x] **1.9** Unit test untuk `idempotency.ts` (`assertIdempotencyKey` reject string kosong, reject whitespace-only, accept string valid).
- [x] **1.10** Unit test untuk `errors.ts` (`isPaymentSDKError` type guard benar, `isRetryable` konsisten dengan flag `retryable`).

## Fase 2 — Core: contract test suite

**(blocked by: 1.8)**

- [x] **2.1** Buat `packages/core/testing/contract-tests.ts` — skeleton `runProviderContractTests(factory: () => PaymentProvider)`, belum ada test case, hanya struktur (`describe` kosong per operasi: createCharge, getCharge, refund, parseWebhook).
- [x] **2.2** Isi test case createCharge: idempotency key sama + payload sama → `chargeId` identik pada mock (butuh `MockPaymentProvider` sederhana di `__fixtures__/mock-provider.ts` untuk validasi struktur suite-nya sendiri).
- [x] **2.3** Isi test case createCharge: idempotency key sama + payload beda → throw `DUPLICATE_IDEMPOTENCY_KEY`.
- [x] **2.4** Isi test case parseWebhook: signature invalid → throw `WEBHOOK_SIGNATURE_INVALID`.
- [x] **2.5** Isi test case parseWebhook: signature valid + payload identik dua kali → `WebhookEvent.id` stabil/sama.
- [x] **2.6** Isi test case refund: charge berstatus `pending` → throw `REFUND_NOT_ALLOWED`.
- [x] **2.7** Isi test case status mapping: verifikasi tidak ada transisi `paid → pending` di mock provider (test negatif, dokumentasikan ekspektasi state machine).
- [x] **2.8** Export `runProviderContractTests` dari `packages/core/testing/index.ts`, tambahkan entry `exports` di `package.json` core untuk subpath `/testing`.

## Fase 3 — Provider: Midtrans

**(blocked by: 2.8)**

- [x] **3.1** Buat `packages/provider-midtrans/package.json` (nama `@bayar-sdk/midtrans`, dependency ke `@bayar-sdk/core`).
- [x] **3.2** Buat `packages/provider-midtrans/src/mapper.ts` — fungsi `toMidtransChargeRequest(req: ChargeRequest)` untuk satu metode dulu: **Bank Transfer/VA**. Metode lain menyusul di task terpisah.
- [x] **3.3** Tambah ke `mapper.ts`: `toMidtransChargeRequest` untuk metode **QRIS**.
- [x] **3.4** Tambah ke `mapper.ts`: `toMidtransChargeRequest` untuk metode **GoPay**.
- [x] **3.5** Tambah ke `mapper.ts`: `toMidtransChargeRequest` untuk metode **Credit Card** (menerima `token`, bukan raw card data — validasi ini ada di test).
- [x] **3.6** Buat `mapper.ts`: fungsi `fromMidtransResponse(raw): ChargeResult` — mapping status mentah Midtrans → `PaymentStatus` sesuai state machine.
- [x] **3.7** Buat `packages/provider-midtrans/src/errors.ts` — mapping kode error Midtrans → `PaymentErrorCode`.
- [x] **3.8** Buat `packages/provider-midtrans/src/webhook.ts` — fungsi `verifyMidtransSignature(payload, signatureKey, serverKey)` implementasi `SHA512(order_id+status_code+gross_amount+ServerKey)` pakai `crypto.subtle`. Unit test dengan fixture signature valid & invalid.
- [x] **3.9** Lengkapi `webhook.ts`: fungsi `parseMidtransWebhook(payload, headers)` yang panggil `verifyMidtransSignature` dulu, throw kalau invalid, lalu normalisasi ke `WebhookEvent`.
- [x] **3.10** Buat `packages/provider-midtrans/src/adapter.ts` — class `MidtransProvider implements PaymentProvider`, constructor terima `{ serverKey, httpClient }`. Implement `createCharge()` (pakai mapper dari 3.2–3.6, wajib `idempotencyKey`).
- [x] **3.11** Implement `getCharge()` di `adapter.ts`.
- [x] **3.12** Implement `refund()` di `adapter.ts` (wajib `idempotencyKey`, cek status charge dulu sesuai state machine sebelum call API).
- [x] **3.13** Implement `parseWebhook()` di `adapter.ts` (delegasi ke `webhook.ts`).
- [x] **3.14** Buat `packages/provider-midtrans/src/index.ts` — export `MidtransProvider`.
- [x] **3.15** Simpan fixture response asli Midtrans (charge success, charge pending, webhook valid, webhook invalid signature) di `packages/provider-midtrans/__fixtures__/`.
- [x] **3.16** Jalankan `runProviderContractTests(() => new MidtransProvider({ serverKey: 'mock', httpClient: mockClient }))` — pastikan lolos semua, perbaiki adapter kalau ada yang gagal.
- [ ] **3.17** Tulis `packages/provider-midtrans/README.md` — cara pakai, keterbatasan (metode apa saja yang didukung v1).

## Fase 4 — Provider: Xendit

**(blocked by: 2.8, boleh paralel dengan Fase 3)**

- [x] **4.1** Buat `packages/provider-xendit/package.json` (nama `@bayar-sdk/xendit`).
- [x] **4.2** `mapper.ts`: `toXenditChargeRequest` untuk metode **Virtual Account**.
- [x] **4.3** `mapper.ts`: tambah metode **QRIS**.
- [x] **4.4** `mapper.ts`: tambah metode **E-wallet** (OVO/DANA/ShopeePay — satu fungsi, channel sebagai parameter).
- [x] **4.5** `mapper.ts`: tambah metode **Credit Card** (token-based).
- [x] **4.6** `mapper.ts`: `fromXenditResponse(raw): ChargeResult` — mapping status Xendit → `PaymentStatus`.
- [x] **4.7** `errors.ts` — mapping kode error Xendit → `PaymentErrorCode`.
- [x] **4.8** `webhook.ts` — fungsi `verifyXenditSignature(headers, expectedToken)` pakai constant-time comparison untuk `x-callback-token`. Unit test valid & invalid.
- [x] **4.9** `webhook.ts` — `parseXenditWebhook(payload, headers)`, verifikasi dulu baru normalisasi ke `WebhookEvent`.
- [x] **4.10** `adapter.ts` — class `XenditProvider implements PaymentProvider`, constructor `{ secretKey, callbackToken, httpClient }`. Implement `createCharge()`.
- [x] **4.11** Implement `getCharge()`.
- [x] **4.12** Implement `refund()` (wajib `idempotencyKey`, cek status dulu).
- [x] **4.13** Implement `parseWebhook()`.
- [x] **4.14** `index.ts` — export `XenditProvider`.
- [x] **4.15** Fixture response asli Xendit di `__fixtures__/`.
- [x] **4.16** Jalankan `runProviderContractTests()` untuk `XenditProvider`, perbaiki sampai lolos.
- [x] **4.17** Tulis `packages/provider-xendit/README.md`.

## Fase 5 — Hono middleware

**(blocked by: 3.16, 4.16)**

- [x] **5.1** Buat `packages/hono/package.json` (nama `@bayar-sdk/hono`, `hono` & `zod` sebagai peerDependencies).
- [x] **5.2** Buat zod schema untuk `ChargeRequest` di `packages/hono/src/schemas.ts`.
- [x] **5.3** Buat zod schema untuk `RefundRequest`.
- [x] **5.4** Implement route `POST /charges` di `packages/hono/src/middleware.ts` — validasi body, wajib header `Idempotency-Key`, panggil `createCharge()`, response 201.
- [x] **5.5** Implement route `GET /charges/:id`.
- [x] **5.6** Implement route `POST /charges/:id/refund` — wajib header `Idempotency-Key`.
- [x] **5.7** Implement route `POST /webhooks/:provider` — pilih adapter dari map `providers`, panggil `parseWebhook()`, response 401 kalau signature invalid.
- [x] **5.8** Implement error handler global: `PaymentSDKError` → JSON response sesuai mapping status HTTP di `ARCHITECTURE.md` §12.
- [x] **5.9** Fungsi `createPaymentRoutes({ providers, defaultProvider })` yang merakit semua route di atas jadi satu Hono sub-app.
- [x] **5.10** Integration test: mount `createPaymentRoutes` dengan `MockPaymentProvider`, test tiap route (pakai `app.request()` helper Hono).
- [x] **5.11** Tulis `packages/hono/README.md`.

## Fase 6 — Examples & dokumentasi konsumen

**(blocked by: 5.11)**

- [ ] **6.1** Buat `examples/node-basic/` — script sederhana pakai `MidtransProvider` langsung (createCharge, getCharge).
- [ ] **6.2** Tambah contoh `refund()` di `examples/node-basic/`.
- [ ] **6.3** Tambah contoh `parseWebhook()` dengan payload dummy di `examples/node-basic/`.
- [ ] **6.4** Buat `examples/hono-api/` — server Hono lengkap pakai `createPaymentRoutes` dengan Midtrans + Xendit sekaligus.
- [ ] **6.5** Update `README.md` root — quick start, tabel package, link ke semua dokumen (`PRD.md`, `ARCHITECTURE.md`).

## Fase 7 — Release automation

**(blocked by: 6.5)**

- [ ] **7.1** Buat `.github/workflows/release.yml` — trigger push ke `main`, job build semua package.
- [ ] **7.2** Tambah step publish dengan Trusted Publishing (OIDC), urutan `core` → `midtrans` → `xendit` → `hono`, skip versi yang sudah ada di registry.
- [ ] **7.3** Test dry-run release workflow di branch terpisah (tanpa publish sungguhan) untuk pastikan urutan build & publish benar.
- [ ] **7.4** Dokumentasikan proses release (cara pakai `bunx changeset`) di `README.md` atau `CONTRIBUTING.md` baru.

## Fase 8 — Provider tambahan (opsional, setelah v1 stabil)

- [ ] **8.1** Riset gap fitur untuk provider berikutnya (mis. Stripe untuk global) — dokumentasikan dulu di `PRD.md` sebelum mulai coding, ikuti pola Fase 3/4.

---

## Cara pakai roadmap ini untuk AI agent

- Kerjakan task berurutan sesuai nomor dalam satu fase, kecuali ditandai bisa paralel.
- Satu task = satu PR, ikuti `AGENTS.md` §5 (branch naming, commit message).
- Sebelum tandai task `[x]`, pastikan lolos Definition of Done di `AGENTS.md` §4.
- Fase 3 dan Fase 4 independen satu sama lain (sama-sama cuma butuh Fase 2 selesai) — bisa dikerjakan paralel oleh dua agent/kontributor berbeda tanpa saling blocking.

