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

Until the steps below are done, only the retry is active.

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
