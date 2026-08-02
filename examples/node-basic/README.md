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
Midtrans sandbox, set `MIDTRANS_SERVER_KEY` dulu:

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
- Webhook Midtrans: signature diverifikasi dengan SHA512 di dalam
  `parseWebhook()` sebelum event dikembalikan.
