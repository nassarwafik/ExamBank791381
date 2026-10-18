#!/bin/sh
# CI only — OPTIONAL authenticated login to Amazon ECR Public, where the worker base images are mirrored. Anonymous pulls
# share a per-IP data quota across GitHub-hosted runners and are refused with "429 Too Many Requests: Data limit
# exceeded"; authenticated pulls are not subject to that anonymous quota.
#
# No stored secret: GitHub's OIDC token (job permission `id-token: write`) is exchanged with AWS STS for a 15-minute
# credential of the role named by the repository VARIABLE ECR_PUBLIC_ROLE_ARN (see docs/development/ci-ecr-public-login.md).
# That role may only call ecr-public:GetAuthorizationToken and sts:GetServiceBearerToken.
#
# Fail-open by design: when the variable is unset (e.g. before the owner configures AWS), when no OIDC token is available
# (fork pull requests), or when any step fails, it prints a GitHub warning and exits 0 — the job then pulls anonymously,
# exactly as before. Credentials and the registry password are never printed: they are masked and passed via stdin.
set -u

warn() { echo "::warning title=ECR Public login skipped::$1"; exit 0; }

role="${ECR_PUBLIC_ROLE_ARN:-}"
[ -n "$role" ] || warn "ECR_PUBLIC_ROLE_ARN is not set; pulling anonymously."
[ -n "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ] && [ -n "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:-}" ] || warn "no OIDC token available (fork pull request or missing id-token permission); pulling anonymously."
command -v aws >/dev/null 2>&1 || warn "aws CLI not found; pulling anonymously."

token=$(curl -sSf -H "Authorization: bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=sts.amazonaws.com" | jq -r '.value // empty') || warn "could not obtain the OIDC token."
[ -n "$token" ] || warn "empty OIDC token."
echo "::add-mask::$token"

creds=$(aws sts assume-role-with-web-identity --role-arn "$role" --role-session-name "gha-ecr-public-${GITHUB_RUN_ID:-local}" \
  --web-identity-token "$token" --duration-seconds 900 --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' --output text) || warn "AWS STS refused the role (check the trust policy)."
AWS_ACCESS_KEY_ID=$(printf '%s' "$creds" | cut -f1)
AWS_SECRET_ACCESS_KEY=$(printf '%s' "$creds" | cut -f2)
AWS_SESSION_TOKEN=$(printf '%s' "$creds" | cut -f3)
[ -n "$AWS_ACCESS_KEY_ID" ] && [ -n "$AWS_SECRET_ACCESS_KEY" ] && [ -n "$AWS_SESSION_TOKEN" ] || warn "AWS STS returned no credentials."
echo "::add-mask::$AWS_SECRET_ACCESS_KEY"
echo "::add-mask::$AWS_SESSION_TOKEN"
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN

password=$(aws ecr-public get-login-password --region us-east-1) || warn "ecr-public get-login-password failed (check the role's permissions)."
[ -n "$password" ] || warn "empty ECR Public password."
echo "::add-mask::$password"
printf '%s' "$password" | docker login --username AWS --password-stdin public.ecr.aws >/dev/null || warn "docker login to public.ecr.aws failed."
echo "Logged in to public.ecr.aws (authenticated pulls)."
