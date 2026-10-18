#!/bin/sh
# CI only — pre-pulls every digest-pinned base image named in the worker Dockerfiles, with a bounded retry, so a transient
# registry refusal (e.g. ECR Public "429 Too Many Requests") does not fail the whole Runner job on the first attempt.
# `docker build` then finds each base locally by its digest (build-images.sh is unchanged and still pins by digest).
# Images are read from the FROM lines of runner/workers/*/Dockerfile; only references pinned by sha256 are accepted.
# Env: PULL_ATTEMPTS (default 4), PULL_BACKOFF_SECONDS (first wait, doubled each retry; default 20).
set -eu
cd "$(dirname "$0")/../workers"
attempts="${PULL_ATTEMPTS:-4}"
first_wait="${PULL_BACKOFF_SECONDS:-20}"

images=$(sed -n 's/^FROM[[:space:]]\{1,\}\([^[:space:]]\{1,\}\).*$/\1/p' */Dockerfile | sort -u)
[ -n "$images" ] || { echo "no base images found in runner/workers/*/Dockerfile" >&2; exit 1; }

for image in $images; do
  case "$image" in
    *@sha256:*) ;;
    *) echo "refusing to pull an unpinned base image: $image" >&2; exit 1 ;;
  esac
  n=1
  wait="$first_wait"
  until docker pull --quiet "$image"; do
    if [ "$n" -ge "$attempts" ]; then
      echo "pull failed after $attempts attempts: $image" >&2
      exit 1
    fi
    echo "pull attempt $n of $attempts failed for $image; retrying in ${wait}s" >&2
    sleep "$wait"
    n=$((n + 1))
    wait=$((wait * 2))
  done
done
