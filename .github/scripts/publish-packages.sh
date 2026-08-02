#!/usr/bin/env bash
# Publish semua package bayar-sdk ke npm dalam urutan dependency:
# core -> midtrans -> xendit -> hono. Melewati package yang versinya sudah ada
# di registry (idempotent). Trusted Publishing (OIDC) dipakai oleh workflow;
# untuk simulasi lokal tanpa menulis ke registry, jalankan dengan --dry-run.
#
# Opsi:
#   --dry-run   pack semua package tanpa menulis ke registry
#   --tag NAME  publish ke dist-tag npm NAME (default: latest)
#
# Saat repo dalam changesets pre mode (ada .changeset/pre.json), dist-tag
# otomatis mengikuti tag pre-release (mis. "beta") supaya versi pre-release
# tidak menimpa `latest` yang menunjuk versi stable.
set -euo pipefail

DRY_RUN=false
TAG=""
while [[ $# -gt 0 ]]; do
	case "$1" in
		--dry-run)
			DRY_RUN=true
			;;
		--tag)
			shift
			TAG="${1:-}"
			;;
		*)
			echo "::error::argumen tidak dikenal: $1"
			exit 1
			;;
	esac
	shift
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ -z "$TAG" && -f ".changeset/pre.json" ]]; then
	TAG="$(node -p "require('./.changeset/pre.json').tag || ''")"
fi

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

	echo "publish $FULL${DRY_RUN:+ (dry-run)}${TAG:+ tag=$TAG}"
	TAG_FLAG=""
	if [[ -n "$TAG" ]]; then
		TAG_FLAG="--tag $TAG"
	fi
	if [[ "$DRY_RUN" == "true" ]]; then
		(cd "$DIR" && npm publish --dry-run --access public $TAG_FLAG)
	else
		(cd "$DIR" && npm publish --provenance --access public $TAG_FLAG)
	fi
done

echo "done."
