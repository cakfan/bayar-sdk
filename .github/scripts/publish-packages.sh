#!/usr/bin/env bash
# Publish semua package bayar-sdk ke npm dalam urutan dependency:
# core -> midtrans -> xendit -> hono. Melewati package yang versinya sudah ada
# di registry (idempotent). Trusted Publishing (OIDC) dipakai oleh workflow;
# untuk simulasi lokal tanpa menulis ke registry, jalankan dengan --dry-run.
set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
	DRY_RUN=true
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PACKAGES=(core provider-midtrans provider-xendit hono)

for pkg in "${PACKAGES[@]}"; do
	DIR="packages/$pkg"
	if [[ ! -f "$DIR/package.json" ]]; then
		echo "::error::package.json tidak ditemukan di $DIR"
		exit 1
	fi

	NAME="$(node -p "require('./$DIR/package.json').name")"
	VERSION="$(node -p "require('./$DIR/package.json').version")"
	FULL="$NAME@$VERSION"

	if [[ "$DRY_RUN" != "true" ]]; then
		EXISTING="$(npm view "$FULL" version 2>/dev/null || true)"
		if [[ -n "$EXISTING" ]]; then
			echo "skip $FULL (sudah ada di registry)"
			continue
		fi
	fi

	echo "publish $FULL${DRY_RUN:+ (dry-run)}"
	if [[ "$DRY_RUN" == "true" ]]; then
		(cd "$DIR" && npm publish --dry-run --access public)
	else
		(cd "$DIR" && npm publish --provenance --access public)
	fi
done

echo "done."
