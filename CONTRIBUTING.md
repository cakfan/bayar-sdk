# Contributing

Terima kasih sudah ingin berkontribusi ke bayar-sdk. Dokumen ini melengkapi
`AGENTS.md` (aturan operasional untuk coding) dan `ROADMAP.md` (daftar task per
fase). Baca `PRD.md` → `ARCHITECTURE.md` → `ROADMAP.md` sebelum mulai.

## Environment

- Package manager: **Bun** (≥ 1.3). Jangan pakai `npm`/`yarn`/`pnpm` untuk
  install atau run script.
- Verifikasi lokal sebelum push/PR:

  ```bash
  bun install
  bun test --workspaces
  bun run typecheck
  bunx biome check .
  bun run build
  ```

- Satu task `ROADMAP.md` = satu PR. Branch naming: `phase-<n>/<slug-task>`.

## Proses release

Rilis dikelola lewat **Changesets** + GitHub Actions. Semua versi package
independen.

### 1. Buat perubahan & changeset

Setiap PR yang berisi perubahan perilaku publik (fix, feat, breaking change)
wajib menyertakan changeset:

```bash
bunx changeset
```

Pilih package yang berubah dan level bump (`patch`/`minor`/`major`). Tulis
ringkasan perubahan dalam bahasa yang bisa dibaca konsumen. Commit file
`.changeset/*.md` bersama PR.

> Perubahan yang murni internal (refactor tanpa ubah output, docs repo, CI)
> tidak butuh changeset.

### 2. Merge & bump versi

Saat rilis ingin dirilis:

```bash
git checkout main
bunx changeset version   # terapkan changeset → bump versi + update CHANGELOG
git add -A && git commit -m "chore: release packages"
git push origin main
```

`bunx changeset version` juga menaikkan range dependency internal antar package
(mis. `@bayar-sdk/core: ^0.1.0` → `^0.2.0`) sesuai aturan `ARCHITECTURE.md` §10.

### 3. Publish otomatis (CI)

Push ke `main` memicu `.github/workflows/release.yml`:

1. `checks` — lint (`biome`), typecheck, test workspace. Gagal → rilis batal.
2. `publish` — build semua package, lalu publish ke npm dalam urutan dependency:
   `core` → `midtrans` → `xendit` → `hono`, memakai **Trusted Publishing (OIDC)**
   + `--provenance`. Package yang versinya **sudah ada di registry akan di-skip**
   (idempotent — aman untuk re-run).

Prasyarat OIDC (dilakukan sekali, di luar repo):

- Repo di-hosting di GitHub (public/private) — repo ini: `cakfan/bayar-sdk`.
- Akun npm publisher ditautkan ke GitHub (`npm` → *Sign in with GitHub*) dan
  merepo ini diberi akses publish di halaman access token npm.
- Tidak ada `NODE_AUTH_TOKEN`/secret yang disimpan — itu poin utama OIDC.

**Jangan pernah publish dari mesin lokal.** Publish hanya lewat CI agar identity
& provenance konsisten.

### 4. Dry-run (tanpa publish sungguhan)

Dua cara:

- **Lokal:** dari root repo, jalankan simulasi penuh urutan publish:

  ```bash
  bash .github/scripts/publish-packages.sh --dry-run
  ```

  Perintah ini mem-`pack` tiap package (urutan `core` → `midtrans` → `xendit` →
  `hono`) tanpa menulis apa pun ke registry. Berguna untuk memastikan isi
  tarball (`dist/` + `exports`) benar.

- **CI:** buka *Actions → Release → Run workflow* dengan input `dry_run: true`.
  Workflow menjalankan seluruh pipeline (checks, build, publish) tapi semua
  publish diganti `--dry-run`.

## Checklist sebelum release

- [ ] `bun test --workspaces` hijau
- [ ] `bun run typecheck` hijau
- [ ] `bunx biome check .` hijau
- [ ] `bun run build` sukses
- [ ] `bash .github/scripts/publish-packages.sh --dry-run` sukses (urutan + isi tarball)
- [ ] `CHANGELOG.md` masing-masing package sudah ter-update via `bunx changeset version`
- [ ] Versi & range dependency internal sudah konsisten
