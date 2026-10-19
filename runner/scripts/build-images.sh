#!/bin/sh
# Phase 17B / 17C — builds the three SmartAssess coding worker images (python@1, java@1, csharp@1) on the gateway host (and in CI).
# Bases are official images pinned by sha256 digest inside each Dockerfile; RUN steps execute with --network none (the build
# itself fetches nothing from the internet besides the pinned base layers the Docker daemon pulls).
#
# CI only — BASE_IMAGE_CONTEXTS (set by scripts/pull-base-images.sh when ECR Public refused a base and Docker Hub served the
# SAME digest): space-separated BuildKit named contexts, each accepted ONLY in the exact shape
#   public.ecr.aws/docker/library/<name>@sha256:<digest>=docker-image://docker.io/library/<name>@sha256:<digest>
# (same name, same digest); anything else stops the build. Unset — the gateway host, and CI without a fallback — the builds are
# exactly the previous ones.
set -eu
cd "$(dirname "$0")/../workers"
contexts=""
for entry in ${BASE_IMAGE_CONTEXTS:-}; do
  image="${entry%%=*}"
  if ! printf '%s\n' "$image" | grep -Eq '^public\.ecr\.aws/docker/library/[a-z0-9][a-z0-9._-]*@sha256:[0-9a-f]{64}$' \
    || [ "$entry" != "$image=docker-image://docker.io/library/${image#public.ecr.aws/docker/library/}" ]; then
    echo "refusing the base-image context: $entry" >&2
    exit 1
  fi
  contexts="$contexts --build-context $entry"
done
for lang in python java csharp; do
  # shellcheck disable=SC2086 — $contexts is a list of validated, space-free words
  docker build $contexts --network none --tag "smartassess-coding-${lang}:17c-v1" --file "${lang}/Dockerfile" .
done
docker image ls --filter "reference=smartassess-coding-*" --format '{{.Repository}}:{{.Tag}} {{.ID}} {{.Size}}'
