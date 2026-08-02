# @bayar-sdk/example-node-basic

Contoh pemakaian langsung `MidtransProvider` (tanpa HTTP layer) untuk operasi inti:
`createCharge`, `getCharge`, `refund`, dan `parseWebhook`.

## Prasyarat

- [Bun](https://bun.sh) ≥ 1.3
- Package `@bayar-sdk/*` sudah di-build: jalankan `bun run build` dari root repo.

## Menjalankan

```bash
bun install        # dari root repo
bun run build      # dari root repo — bangun dist semua package
bun start          # dari folder ini
```

Tanpa env var, script menjalankan **demo webhook** (payload dummy + signature
dihitung lokal, tidak butuh akun Midtrans) lalu berhenti:

```
== Demo parseWebhook (payload dummy, tanpa key asli) ==
webhook event: { ... }
normalizedStatus: paid
```

Untuk menjalankan `createCharge`/`getCharge`/`refund` yang memanggil API
Midtrans sandbox, isi `MIDTRANS_SERVER_KEY` di file `.env` **root repo**
(sudah di-gitignore). `bun start` otomatis memuat `.env` root lewat
`bun --env-file=../../.env`, jadi cukup:

```bash
# .env (root repo)
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxx

# lalu dari folder ini:
bun start
```

Cara lain (tanpa `.env`):

```powershell
$env:MIDTRANS_SERVER_KEY = "SB-Mid-server-xxxx"; bun start
```

> `MIDTRANS_SERVER_KEY` adalah sandbox key dari dashboard Midtrans (Basic auth).
> Jangan pernah commit key asli. Key dummy di `src/webhook.ts` hanya untuk demo
> verifikasi signature, bukan kredensial.

## Catatan

- Amount selalu **integer minor unit** (Rp50.000 → `50000`).
- Idempotency key wajib untuk `createCharge` dan `refund`.
- Refund pada charge berstatus `pending` melempar `PaymentSDKError`
  `REFUND_NOT_ALLOWED` — contoh menangkap dan mencetak pesannya (lihat state
  machine di `ARCHITECTURE.md` §8).
- Contoh membuat charge dengan **virtual account** (`bank: "bca"`, aktif default
  di sandbox). Untuk metode lain, ganti `paymentMethod` — mis. QRIS
  `{ type: "qris" }` perlu channel diaktifkan dulu di dashboard lewat halaman
  **"+Payment Method"** (`dashboard.midtrans.com/new_payment_method`, biasanya
  butuh GoPay aktif; untuk Core API kadang perlu request manual ke
  `support@midtrans.com`). Kalau belum aktif, Midtrans membalas `402` dan SDK
  menormalkannya menjadi `PaymentSDKError` `INVALID_REQUEST`.
- Webhook Midtrans: signature diverifikasi dengan SHA512 di dalam
  `parseWebhook()` sebelum event dikembalikan.
