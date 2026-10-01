#!/bin/sh
# Phase 17B — builds the three SmartAssess coding worker images (python@1, java@1, csharp@1) on the gateway host (and in CI).
# Bases are official images pinned by sha256 digest inside each Dockerfile; RUN steps execute with --network none (the build
# itself fetches nothing from the internet besides the pinned base layers the Docker daemon pulls).
set -eu
cd "$(dirname "$0")/../workers"
for lang in python java csharp; do
  docker build --network none --tag "smartassess-coding-${lang}:17b-v1" --file "${lang}/Dockerfile" .
done
docker image ls --filter "reference=smartassess-coding-*" --format '{{.Repository}}:{{.Tag}} {{.ID}} {{.Size}}'
