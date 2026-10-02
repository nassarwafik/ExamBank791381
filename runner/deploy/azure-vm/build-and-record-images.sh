#!/bin/sh
# Phase 17F-A1 — operator wrapper (run as root on the Runner VM): builds the three official worker images with the ONE existing
# build pipeline (runner/scripts/build-images.sh: digest-pinned bases, `docker build --network none`), runs the real-Docker
# security + official suites against them (TEST keys generated inside the tests), and records the image IDs to the manifest the
# preflight verifies at every start.
#     sudo sh runner/deploy/azure-vm/build-and-record-images.sh [/etc/smartassess-runner/images.manifest] [--skip-tests]
set -eu
here=$(cd "$(dirname "$0")" && pwd)
runner=$(cd "$here/../.." && pwd)
manifest=/etc/smartassess-runner/images.manifest
skip_tests=0
for arg in "$@"; do
  case "$arg" in
    --skip-tests) skip_tests=1 ;;
    /*) manifest=$arg ;;
    *) echo "usage: build-and-record-images.sh [/absolute/manifest/path] [--skip-tests]" >&2; exit 2 ;;
  esac
done

sh "$runner/scripts/build-images.sh"
if [ "$skip_tests" -eq 0 ]; then
  # The official suite drives the real API handlers and needs the API dependencies (npm ci --prefix api) on this host.
  npm --prefix "$runner" run test:docker:security
  if [ -d "$runner/../api/node_modules" ]; then npm --prefix "$runner" run test:docker:official; else echo "skipping test:docker:official (no api/node_modules — run it in CI / staging)"; fi
  leftovers=$(docker ps -aq --filter label=smartassess.coding-runner=1)
  if [ -n "$leftovers" ]; then echo "FAIL: sandbox containers left behind" >&2; exit 1; fi
fi
umask 077
tmp="$manifest.tmp.$$"
node "$here/record-images.js" > "$tmp"
mv "$tmp" "$manifest"
chmod 0644 "$manifest"
echo "image manifest written: $manifest"
