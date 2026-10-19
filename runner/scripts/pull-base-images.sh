#!/bin/sh
# CI only — pre-pulls every digest-pinned base image named in the worker Dockerfiles, with a bounded retry, so a transient
# registry refusal (e.g. ECR Public "429 Too Many Requests") does not fail the whole Runner job on the first attempt.
# `docker build` then finds each base locally by its digest (build-images.sh still pins by digest).
# Images are read from the FROM lines of runner/workers/*/Dockerfile; only references pinned by sha256 are accepted.
# Env: PULL_ATTEMPTS (default 4), PULL_BACKOFF_SECONDS (first wait, doubled each retry; default 20).
#
# Docker Hub fallback (owner-approved governance change, 2026-10-19). The python and eclipse-temurin bases are Docker Official
# Images mirrored on ECR Public, whose ANONYMOUS per-IP data quota ("toomanyrequests: Data limit exceeded") is shared by every
# GitHub-hosted runner and does not clear within a job. On that QUOTA refusal — and after the bounded retries of any other
# refusal — a base of the exact shape public.ecr.aws/docker/library/<name>@sha256:<digest> is pulled from Docker Hub as
# docker.io/library/<name>@sha256:<THE SAME digest>. The digest is the authority: the same sha256 is the same image, whichever
# registry serves it, and a registry without that digest simply fails the pull. The substitution is handed to the build as a
# BuildKit named context in BASE_IMAGE_CONTEXTS (appended to $GITHUB_ENV, plus a ::warning), which build-images.sh accepts only
# in that one digest-identical shape. Other registries (mcr.microsoft.com) have no fallback. The Dockerfiles are unchanged.
set -eu
cd "$(dirname "$0")/../workers"
attempts="${PULL_ATTEMPTS:-4}"
first_wait="${PULL_BACKOFF_SECONDS:-20}"
QUOTA_MESSAGE="Data limit exceeded"

images=$(sed -n 's/^FROM[[:space:]]\{1,\}\([^[:space:]]\{1,\}\).*$/\1/p' */Dockerfile | sort -u)
[ -n "$images" ] || { echo "no base images found in runner/workers/*/Dockerfile" >&2; exit 1; }

# pull_bounded IMAGE QUOTA_STOPS → 0 pulled; 1 failed after the bounded attempts; 2 refused for a registry quota (when
# QUOTA_STOPS is "yes": a quota does not clear within a job, so the remaining attempts are not spent waiting).
pull_bounded() {
  n=1
  wait="$first_wait"
  while :; do
    if err=$( { docker pull --quiet "$1" >&3; } 2>&1 ); then return 0; fi
    printf '%s\n' "$err" >&2
    case "$err" in *"$QUOTA_MESSAGE"*) [ "$2" = yes ] && return 2 ;; esac
    if [ "$n" -ge "$attempts" ]; then
      echo "pull failed after $attempts attempts: $1" >&2
      return 1
    fi
    echo "pull attempt $n of $attempts failed for $1; retrying in ${wait}s" >&2
    sleep "$wait"
    n=$((n + 1))
    wait=$((wait * 2))
  done
}

exec 3>&1                                                       # docker's own output still reaches the job log
contexts=""
for image in $images; do
  case "$image" in
    *@sha256:*) ;;
    *) echo "refusing to pull an unpinned base image: $image" >&2; exit 1 ;;
  esac
  fallback=""
  if printf '%s\n' "$image" | grep -Eq '^public\.ecr\.aws/docker/library/[a-z0-9][a-z0-9._-]*@sha256:[0-9a-f]{64}$'; then
    fallback="docker.io/library/${image#public.ecr.aws/docker/library/}"
  fi
  status=0
  pull_bounded "$image" "$([ -n "$fallback" ] && echo yes || echo no)" || status=$?
  [ "$status" -eq 0 ] && continue
  [ -n "$fallback" ] || exit 1
  echo "falling back to the Docker Hub copy of the same digest: $fallback" >&2
  pull_bounded "$fallback" no || exit 1
  contexts="${contexts:+$contexts }$image=docker-image://$fallback"
  echo "::warning title=Base image served by Docker Hub::$image was refused by ECR Public; the same digest was pulled from $fallback."
done

if [ -n "$contexts" ] && [ -n "${GITHUB_ENV:-}" ]; then
  echo "BASE_IMAGE_CONTEXTS=$contexts" >> "$GITHUB_ENV"
fi
