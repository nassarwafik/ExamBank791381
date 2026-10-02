#!/bin/sh
# Phase 17F-A1 — LOCAL readiness check of the running Runner, executed in EXACTLY the service's context (same user, groups,
# environment file and working directory) through a transient systemd unit, so secrets never pass through a shell or argv.
#     sudo sh runner/deploy/azure-vm/readiness.sh            → liveness + host readiness (no sandbox started)
#     sudo sh runner/deploy/azure-vm/readiness.sh --deep     → also proves the container controls in real sandboxes (all languages)
# Exit code = the preflight's (0 ready; see preflight.js EXIT for the failing check).
set -eu
mode=readiness
[ "${1:-}" = "--deep" ] && mode=verify-sandbox
exec systemd-run --quiet --pipe --wait --collect \
  -p User=smartassess-runner -p Group=smartassess-runner -p SupplementaryGroups=docker \
  -p EnvironmentFile=/etc/smartassess-runner/runner.env \
  -p Environment=HOME=/var/lib/smartassess-runner \
  -p WorkingDirectory=/opt/smartassess-runner/current/runner \
  /usr/bin/node deploy/azure-vm/preflight.js --mode="$mode" \
    --env-file=/etc/smartassess-runner/runner.env --image-manifest=/etc/smartassess-runner/images.manifest
