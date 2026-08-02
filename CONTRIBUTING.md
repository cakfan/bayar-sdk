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

## Versioning (semver & channel)

Versi mengikuti **SemVer** `MAJOR.MINOR.PATCH`; rilis pre-release menambah
suffix `-alpha.N`, `-beta.N`, atau `-rc.N`.

### Level bump

| Level   | Kapan                                                                                           | Contoh   |
| ------- | ----------------------------------------------------------------------------------------------- | -------- |
| `patch` | Bugfix backward-compatible                                                                      | `0.1.1`  |
| `minor` | Fitur baru backward-compatible                                                                  | `0.2.0`  |
| `major` | Perubahan breaking. Khusus repo ini: **perubahan contract publik core** (`contract.ts`, `types.ts`, `errors.ts`) selalu `major` | `1.0.0` |

- Sebelum `1.0.0`, breaking change cukup naik `minor` (`0.1.0` → `0.2.0`).
- Jangan pernah menaikkan versi `package.json` secara manual — selalu lewat
  `bunx changeset version` agar range dependency internal konsisten.

### Pre-release channel

Urutan SemVer: `alpha` < `beta` < `rc` < stable. **Changesets pre mode berlaku
global ke semua package sekaligus** — channel antar package selalu sinkron
(tidak ada core `beta` sementara midtrans `stable`).

| Channel | Kapan                                                          | Aturan                          |
| ------- | -------------------------------------------------------------- | ------------------------------- |
| `alpha` | Fitur baru, internal, belum stabil                              | API boleh berubah antar-alpha   |
| `beta`  | Feature-complete, siap diuji publik                            | API belum final                 |
| `rc`    | Feature-freeze, hanya perbaikan bug                            | perbaikan → `rc.2`, bukan `rc.1` |
| stable  | Rilis publik                                                   | —                               |

Contoh urutan rilis `0.1.0`: `0.1.0-alpha.1` → `0.1.0-beta.1` → `0.1.0-rc.1` →
`0.1.0`.

Pre-release dipublish ke **dist-tag npm sesuai channel** (mis. `beta`), bukan
`latest` — jadi `npm i @bayar-sdk/core` tetap memberi versi stable, sementara
penguji channel memakai `npm i @bayar-sdk/core@beta`.

## Proses release

Rilis dikelola lewat **Changesets** + GitHub Actions. Versi tiap package
independen, tapi channel pre-release berlaku global (lihat
[Versioning](#versioning-semver--channel) di atas).

### 0. Tentukan channel rilis

Sebelum membuat changeset, putuskan apakah ini rilis **stable** (default) atau
**pre-release** (`alpha`/`beta`/`rc`). Detail level bump & channel ada di
section [Versioning](#versioning-semver--channel) di atas.

- Stable → lanjut langsung ke langkah 1.
- Pre-release → jalankan dulu:

  ```bash
  bunx changeset pre enter beta   # alpha | beta | rc — berlaku global ke semua package
  ```

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

- **Rilis stable:** command di atas menghasilkan versi final (`0.1.1`, `0.2.0`,
  `1.0.0`).
- **Pre-release** (sedang dalam `pre enter`): hasilnya `-alpha.N`/`-beta.N`/
  `-rc.N` dan **changeset tidak di-konsumsi** — dipakai nanti saat keluar
  pre-release. Ulangi `bunx changeset version` tiap batch pre-release.
- **Kembali ke stable:** setelah pre-release selesai, keluar dari pre mode lalu
  bump lagi — changeset yang tertahan dikonsumsi jadi versi stable final:

  ```bash
  bunx changeset pre exit
  bunx changeset version
  git add -A && git commit -m "chore: release stable" && git push origin main
  ```

> Jangan pernah menaikkan versi `package.json` secara manual — selalu lewat
> `bunx changeset version` agar internal dependency range konsisten.

### 3. Publish otomatis (CI)

Push ke `main` memicu `.github/workflows/release.yml`:

1. `checks` — lint (`biome`), typecheck, test workspace. Gagal → rilis batal.
2. `publish` — build semua package, lalu publish ke npm dalam urutan dependency:
   `core` → `midtrans` → `xendit` → `hono`, memakai **Trusted Publishing (OIDC)**
   + `--provenance`. Package yang versinya **sudah ada di registry akan di-skip**
   (idempotent — aman untuk re-run).

Dist-tag otomatis: kalau repo sedang dalam pre-release mode (ada
`.changeset/pre.json`), `publish-packages.sh` mem-publish ke dist-tag channel
(`beta`, `rc`, dst) sehingga `latest` tetap menunjuk versi stable. Konsumen
memakai channel via `npm i @bayar-sdk/core@beta`.

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
