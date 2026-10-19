# CI: authenticated pulls from ECR Public (owner setup)

## Why

The Runner workflow (`.github/workflows/coding-runner-security.yml`) builds the coding worker images from digest-pinned
official bases mirrored on **Amazon ECR Public** (`public.ecr.aws/docker/library/...`). Anonymous pulls share a per-IP
data quota with every other GitHub-hosted runner, and the job fails before any test with
`429 Too Many Requests — toomanyrequests: Data limit exceeded` (five times on 2026-10-18: PRs #356, #357, #358 and
`main`). Authenticated pulls are not subject to that anonymous quota.

## What the workflow does

1. **Log in to ECR Public (optional)** — `runner/scripts/ecr-public-login.sh`. It uses GitHub's OIDC token (job permission
   `id-token: write`) to obtain a **15-minute** AWS credential for the role in the repository **variable**
   `ECR_PUBLIC_ROLE_ARN`, then `docker login public.ecr.aws` with the password on stdin. There is **no stored secret**:
   the role ARN is not a secret and the credential expires with the job. Every value is masked in the log.
   It is **fail-open**: when the variable is unset, on a fork pull request (no OIDC token), or on any AWS error, it prints a
   warning and the job continues with anonymous pulls, exactly as before this change.
2. **Pre-pull the pinned bases with a bounded retry** — `runner/scripts/pull-base-images.sh` (4 attempts, 20 s / 40 s /
   80 s backoff; only `@sha256:` references; the build then finds each base locally by digest).

3. **Docker Hub fallback (no setup)** — owner-approved governance change of 2026-10-19 (see below). It is the only one of the three active without any AWS setup.

Until the AWS steps below are done, the retry and the Docker Hub fallback are active.

## Docker Hub fallback (same digest)

From 2026-10-18 to 2026-10-19 the anonymous ECR Public quota failed the Runner job on almost every push and pull request:
- PRs #356, #357, #358, #363, #364 and #366;
- `main` after #360 and #365.

Re-runs often failed again within the hour, because the quota is a data quota that does not clear within a job. The owner chose this fallback.

- **When:** `runner/scripts/pull-base-images.sh` falls back:
  - when ECR Public refuses a base with the quota message (`toomanyrequests: Data limit exceeded`) — at once, without spending the remaining retries;
  - or after the bounded retries of any other refusal.
- **Which bases, and from where:** only a base of the exact shape `public.ecr.aws/docker/library/<name>@sha256:<digest>` has a fallback. These are the Docker Official Images; ECR Public's `docker/library` is their mirror. The fallback pulls `docker.io/library/<name>@sha256:<the same digest>`.
- **Why it is safe:** the digest is the content address. The same sha256 is byte-for-byte the same image, whichever registry serves it, and a registry without that digest simply fails the pull. Nothing is pulled by tag.
- **How the build uses it:**
  - The substitution reaches the build as a BuildKit named context, `BASE_IMAGE_CONTEXTS`, set through `$GITHUB_ENV`. It reads `--build-context public.ecr.aws/docker/library/<name>@sha256:<d>=docker-image://docker.io/library/<name>@sha256:<d>`.
  - `runner/scripts/build-images.sh` accepts only that exact shape (same name, same digest, `docker.io/library`) and stops the build on anything else.
  - The worker Dockerfiles keep their ECR references unchanged.
- **Where it applies:**
  - The gateway host never sets `BASE_IMAGE_CONTEXTS`, so its builds are byte-identical commands to before.
  - Other registries (`mcr.microsoft.com/dotnet/sdk`) have no fallback.
- **What you see in CI:** every substitution prints `::warning title=Base image served by Docker Hub::…`, so a run that used Docker Hub is visible in the job summary.
- **Limits:**
  - Docker Hub's own anonymous pull limit applies (per IP, per hour). Two bases are at most two pulls per job.
  - If Docker Hub also refuses, the job fails, after its own bounded retries.
- **Undo:** revert the PR that introduced the fallback. The AWS login below remains the stronger fix: authenticated ECR pulls are not subject to the anonymous quota at all.

## One-time AWS setup (owner, in your AWS account — free)

Replace `<ACCOUNT_ID>` with your 12-digit AWS account id.

1. **IAM → Identity providers → Add provider** — type *OpenID Connect*, provider URL
   `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`. (Skip if it already exists.)
2. **IAM → Roles → Create role → Custom trust policy**, name e.g. `gha-exambank-ecr-public`:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
       "Action": "sts:AssumeRoleWithWebIdentity",
       "Condition": {
         "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
         "StringLike": { "token.actions.githubusercontent.com:sub": [
           "repo:nassarwafik/ExamBank791381:ref:refs/heads/main",
           "repo:nassarwafik/ExamBank791381:pull_request"
         ] }
       }
     }]
   }
   ```

3. Attach **only** this permissions policy to the role (inline):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["ecr-public:GetAuthorizationToken", "sts:GetServiceBearerToken"],
       "Resource": "*"
     }]
   }
   ```

4. **GitHub → repository Settings → Secrets and variables → Actions → Variables → New repository variable**:
   name `ECR_PUBLIC_ROLE_ARN`, value `arn:aws:iam::<ACCOUNT_ID>:role/gha-exambank-ecr-public`.

## Verify

The next run of *Coding Runner Security & Smoke Tests* shows `Logged in to public.ecr.aws (authenticated pulls).` in the
step «Log in to ECR Public». A `::warning` with a reason means it fell back to anonymous pulls; the job itself is not
failed by the login step.

## Undo

Delete the repository variable: the workflow returns to anonymous pulls (with the retry). Deleting the role or the OIDC
provider in AWS has the same effect (the login step then warns and falls back).
