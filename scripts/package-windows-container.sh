#!/usr/bin/env bash
set -euo pipefail
# Local-only fallback for Linux hosts without a complete Wine installation.
# Pinned official electron-builder image; no GitHub jobs or host credentials.
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
build_cache="${XDG_CACHE_HOME:-$HOME/.cache}/electron-builder"
mkdir -p "$build_cache"
exec podman run --rm --security-opt label=disable \
  --volume "$repo_dir:/project" \
  --volume "$build_cache:/root/.cache/electron-builder" \
  --workdir /project --env USE_SYSTEM_WINE=true \
  --env CSC_IDENTITY_AUTO_DISCOVERY=false --entrypoint npm \
  docker.io/electronuserland/builder@sha256:41ae540902461b6cbc988987db79547fcc10cda04d2a6c6367504f59d4b37c64 \
  run desktop:package:windows
