# AGENTS.md — bayar-sdk

Dokumen ini adalah aturan operasional untuk AI coding agent (atau kontributor manapun) yang mengerjakan repo ini. Baca dokumen ini **sebelum** mengerjakan task apapun dari `ROADMAP.md`.

## 0. Dokumen wajib dibaca dulu

Urutan baca sebelum menulis kode:

1. `PRD.md` — apa yang dibangun dan kenapa, termasuk scope v1 dan non-goals.
2. `ARCHITECTURE.md` — keputusan teknis final: contract types, error handling, idempotency, webhook, security model, state machine status.
3. `ROADMAP.md` — task yang sedang dikerjakan, ikuti urutan fase.

**Jangan mulai coding kalau task di roadmap bertentangan dengan `ARCHITECTURE.md`.** Kalau ada ambiguitas atau kontradiksi, stop dan tanyakan ke maintainer (jangan asumsi sendiri dan lanjut coding) — prinsip proyek ini adalah *design before development*.

## 1. Golden rules (tidak bisa dinegosiasikan)

- **Jangan pernah mengubah contract publik** (`packages/core/src/contract.ts`, `types.ts`, `errors.ts`) tanpa terlebih dulu mengusulkan perubahan di `ARCHITECTURE.md`. Contract adalah kontrak antara core dan semua provider — perubahan sepihak di satu adapter akan merusak provider lain.
- **Core tidak boleh import dari package provider manapun.** Dependency selalu satu arah: provider → core.
- **Idempotency key wajib** di setiap operasi yang memindahkan uang (`createCharge`, `refund`). Jangan buat parameter ini opsional atau beri default value diam-diam.
- **Signature webhook wajib diverifikasi di dalam `parseWebhook()`** sebelum payload dikembalikan. Jangan pernah return `WebhookEvent` dari payload yang belum lolos verifikasi, walau untuk keperluan debugging sementara.
- **Tidak ada raw card data (PAN/CVV) yang boleh lewat kode manapun di repo ini.** Kalau sebuah task tampak mengharuskan itu, berhenti dan tanyakan — kemungkinan besar ada kesalahan pemahaman scope.
- **Tidak ada API Node-only** (`fs`, `require('crypto')` gaya Node) di `packages/core` dan `packages/provider-*`. Pakai Web-standard API (`fetch`, `crypto.subtle`). Package `hono` boleh assume runtime yang Hono dukung.
- **Jangan commit secret apapun** (API key asli, server key, signature token) — bahkan di file test/fixture. Fixture pakai nilai mock/dummy yang jelas-jelas bukan kredensial asli (mis. `mock-server-key-xxxx`).
- **Satu task di `ROADMAP.md` = satu unit kerja.** Jangan gabungkan beberapa task jadi satu PR besar kecuali task tersebut memang ditandai berurutan/dependent di roadmap.

## 2. Tooling & commands

- Package manager: **Bun**. Jangan pakai `npm`/`yarn`/`pnpm` untuk install atau run script kecuali dinyatakan lain.
- Install dependency: `bun install`
- Jalankan test: `bun test` (dari root, atau `bun test` di dalam folder package tertentu untuk scoped run)
- Build satu package: `bun run build` di dalam folder package (pakai `tsup`)
- Lint/format: `bunx biome check .` (atau sesuai `biome.json` di root)
- Typecheck: `bunx tsc --noEmit` per package (pakai `tsconfig.base.json` sebagai extends)

## 3. Struktur & konvensi kode

- Ikuti struktur folder yang sudah ditetapkan di `ARCHITECTURE.md` §1. Jangan buat folder/package baru di luar itu tanpa update dokumen dulu.
- Tiap provider adapter menerima `httpClient` sebagai dependency injection di constructor — jangan hardcode `fetch` langsung di dalam method, supaya adapter mudah di-mock di test.
- Penamaan file konsisten per package: `adapter.ts` (class utama implements `PaymentProvider`), `mapper.ts` (normalisasi request/response), `errors.ts` (map error provider → `PaymentSDKError`), `webhook.ts` (verifikasi signature + parsing).
- Semua tipe publik didefinisikan di `packages/core/src/types.ts`, tidak didefinisikan ulang atau di-duplicate di provider package.
- Gunakan TypeScript strict mode. Tidak ada `any` tanpa justifikasi komentar di sebelahnya.
- Amount selalu integer minor unit. Jangan pernah pakai `number` desimal atau `parseFloat` untuk uang.

## 4. Testing — definisi selesai (Definition of Done)

Sebuah task **belum selesai** kalau:

- Kode baru tidak punya unit test untuk mapper/normalizer terkait.
- Provider adapter baru/berubah belum lolos `runProviderContractTests()` dari `@bayar-sdk/core/testing`.
- Ada perubahan di `parseWebhook()` tapi tidak ada test case untuk signature invalid (harus throw `WEBHOOK_SIGNATURE_INVALID`, bukan diam-diam lolos).
- Ada perubahan di `createCharge()`/`refund()` tapi tidak ada test untuk idempotency key sama+payload sama (harus idempotent) dan idempotency key sama+payload beda (harus throw `DUPLICATE_IDEMPOTENCY_KEY`).
- `bun test` atau `bunx tsc --noEmit` gagal di package manapun yang tersentuh perubahan.

Setiap task yang menyentuh mapping status provider wajib menguji hasilnya konsisten dengan state machine di `ARCHITECTURE.md` §8 (mis. tidak ada transisi `paid → pending`).

## 5. Git & PR workflow

- Branch naming: `phase-<n>/<slug-task>`, contoh `phase-2/midtrans-create-charge`.
- Commit message: deskriptif, present tense, merujuk nomor task roadmap kalau ada, contoh: `feat(core): add PaymentProvider contract and types (Phase 1.1)`.
- Satu PR = satu task dari `ROADMAP.md`, kecuali task eksplisit ditandai "gabung dengan task X" di roadmap.
- Sebelum membuka PR: jalankan `bun test`, `bunx tsc --noEmit`, dan `bunx biome check .` — semua harus hijau.
- Jangan publish ke npm dari lokal. Publish hanya lewat CI (lihat `ARCHITECTURE.md` §10).

## 6. Kalau ragu

Kalau sebuah task ambigu, kontradiktif dengan `ARCHITECTURE.md`, atau butuh keputusan produk baru (misal: dukungan metode pembayaran yang belum ada di `PRD.md`) — **berhenti, jangan menebak**. Tulis catatan singkat di PR description atau tanyakan langsung ke maintainer. Menebak dan lanjut coding adalah pelanggaran prinsip *design before development* proyek ini.