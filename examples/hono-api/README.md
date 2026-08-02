# @bayar-sdk/example-hono-api

Server Hono lengkap yang mengekspos `MidtransProvider` dan `XenditProvider`
sekaligus lewat `createPaymentRoutes` dari `@bayar-sdk/hono`. Server jalan dengan
`Bun.serve`.

## Prasyarat

- [Bun](https://bun.sh) ≥ 1.3
- Package `@bayar-sdk/*` sudah di-build: jalankan `bun run build` dari root repo.

## Menjalankan

```bash
bun install        # dari root repo
bun run build      # dari root repo — bangun dist semua package
bun start          # dari folder ini (atau bun dev untuk auto-reload)
```

Tanpa env var, server tetap naik dengan key dummy — request API akan gagal
`401 AUTH_FAILED`, yang sekaligus mendemonstrasikan format error. Untuk charge
sunguhan, set env key asli:

```powershell
$env:MIDTRANS_SERVER_KEY = "SB-Mid-server-xxxx"
$env:XENDIT_SECRET_KEY = "xnd_xxx"
$env:XENDIT_CALLBACK_TOKEN = "xxx"
bun start
```

## Endpoint

| Method | Path                         | Keterangan                                      |
| ------ | ---------------------------- | ----------------------------------------------- |
| POST   | `/payments/charges`          | Wajib header `Idempotency-Key`. → 201           |
| GET    | `/payments/charges/:id`      | Status charge terkini.                          |
| POST   | `/payments/charges/:id/refund` | Wajib header `Idempotency-Key`. → 200         |
| POST   | `/payments/webhooks/midtrans` | Webhook Midtrans (signature diverifikasi).      |
| POST   | `/payments/webhooks/xendit`   | Webhook Xendit (signature diverifikasi).        |

## Contoh coba cepat

```bash
# create charge (QRIS) via default provider (midtrans)
curl -X POST http://localhost:3000/payments/charges \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: idem-001" \
  -d '{"amount":50000,"currency":"IDR","paymentMethod":{"type":"qris"},"referenceId":"order-123"}'

# body invalid → 400 VALIDATION_ERROR
curl -X POST http://localhost:3000/payments/charges \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: idem-002" \
  -d '{"amount":-5}'

# webhook provider tak dikenal → 404 (tanpa menyentuh provider)
curl -X POST http://localhost:3000/payments/webhooks/stripe \
  -H "Content-Type: application/json" -d '{}'
```

> Catatan hasil: dengan key dummy, semua request yang memanggil provider
> (`createCharge`, `getCharge`, `refund`) mengembalikan `401 AUTH_FAILED` karena
> Midtrans menolak key dummy saat cek ke sandbox — bukan `404 CHARGE_NOT_FOUND`.
> `404 CHARGE_NOT_FOUND` baru muncul setelah auth lolos (key asli) dan charge
> benar-benar tidak ada. `400`/`404` di atas (validasi & webhook provider tak
> dikenal) ditangani di layer middleware tanpa memanggil provider.

Dengan key dummy, `createCharge` akan mengembalikan `401 AUTH_FAILED` — format
error: `{ "error": { "code", "message", "provider", "providerErrorCode", "retryable" } }`.

## Catatan

- `Idempotency-Key` wajib untuk `POST /charges` dan `/charges/:id/refund`
  (idempotency-key sama + payload sama → hasil sama; key sama + payload beda →
  `409 DUPLICATE_IDEMPOTENCY_KEY`).
- `defaultProvider` dipakai untuk route yang tidak menyebut provider (semua route
  kecuali webhook yang menyebut `:provider` di URL).
