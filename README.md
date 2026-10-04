# ExamBank 791381

Arabic, right-to-left exam and training platform for a communication-networks course. One teacher manages classes,
students, assignments and exams, projects, messages and learning materials; students take exams, read and practise
course content, follow their progress, and use the app on phones as an installable PWA.

This README is for operators and developers. It contains no secret values; every variable below is configured in the
hosting environment, never in the repository.

## Architecture

| Layer | What it is | Where |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite single-page app, RTL-first | `src/` |
| API | Azure Functions v4 (Node 22, CommonJS), one module per HTTP route | `api/src/functions/`, shared logic in `api/src/lib/` |
| Storage | Azure Blob Storage, JSON documents | containers `bank` (platform data), `assets` (images), `raw` (imports) |
| Hosting | Azure Static Web Apps (static `dist/` + managed API) | `.github/workflows/`, `public/staticwebapp.config.json` |
| PWA | network-first navigations, offline page, Web Push notifications, install flows | `public/sw.js`, `public/manifest.webmanifest`, `src/pwa/` |

Platform documents are flat JSON blobs, for example `platform/users/<id>.json`, `platform/classes/<id>.json`,
`platform/assignments/<id>.json` and `platform/submissions/<assignmentId>/<studentId>.json`. Contended writes use
ETag compare-and-swap (`mutateJsonWithRetry` in `api/src/lib/platform-storage.js`); attempt writes also take a
per-assignment blob lease (`api/src/lib/assignment-lock.js`).

The service worker never caches app code or API responses. It only answers failed navigations with `offline.html`
and shows push notifications.

## Local development

Requirements: Node.js 22.12 or newer, npm.

```bash
npm ci                 # frontend dependencies
npm ci --prefix api    # API dependencies
npm run dev            # Vite dev server for the frontend
```

There is no Vite proxy for `/api`. To run the UI against a local API, use the Azure Functions Core Tools
(`npm start --prefix api`, which runs `func start`) with a local `api/local.settings.json` holding the variables below
(the file is git-ignored), behind the Azure Static Web Apps CLI. The test suite exercises API handlers in-process with
an in-memory blob container, so most work needs neither.

## Commands

| Purpose | Command |
|---|---|
| Full test suite (frontend + API, Vitest) | `npm test` |
| Typecheck | `npx tsc -b` |
| Production build: typecheck, Vite build, bundle guard | `npm run build` |
| Bundle guard only (after a build) | `npm run check:bundle` |
| Lint (oxlint; fails only on error-level findings) | `npm run lint` |

The bundle guard (`scripts/check-bundle-budget.mjs`) fails the build when the initial JavaScript graph exceeds its
gzip budget, when a heavy module leaks into the initial graph, or when learning visuals stop being lazy.

## Deployment

`.github/workflows/azure-static-web-apps-white-grass-0ce642c10.yml`:

1. **Quality Gate** (every push to `main` and every pull request): `npm ci` for app and API, `npm test`,
   `npm run build`, `npm run lint`. It never receives the deployment secret.
2. **Build and Deploy** runs only after the gate passes. Pull requests deploy to a preview environment; `main`
   deploys to production.
3. Closing a pull request removes its preview environment.

Deployment secret: `AZURE_STATIC_WEB_APPS_API_TOKEN_WHITE_GRASS_0CE642C10` (GitHub Actions secret).

`public/staticwebapp.config.json` serves `sw.js` and the manifest with `Cache-Control: no-cache`, so a new
deployment is picked up on the next launch.

## Environment variables (API)

Configured as application settings of the Static Web App's managed API. Derived from the code in `api/src`.

### Storage

| Variable | Status | Purpose |
|---|---|---|
| `AZURE_STORAGE_CONNECTION_STRING` | **required** | Blob Storage account holding the `bank`, `assets` and `raw` containers |

### Authentication and security

| Variable | Status | Purpose |
|---|---|---|
| `BUILDER_USER_CODE` | production-recommended | The teacher's login code. When set, login requires an exact match. |
| `BUILDER_PASSWORD` | **required** (or the fallback) | The teacher's password |
| `BUILDER_SESSION_SECRET` | **required** (or the fallback) | HMAC root for teacher session tokens (8 h lifetime) |
| `STUDENT_SESSION_SECRET` | production-recommended | HMAC root for student session tokens (12 h lifetime); falls back to `BUILDER_SESSION_SECRET` |
| `BUILDER_SESSION_VERSION` | optional, default `1` | Bump to revoke every teacher session at once |
| `BANK_SETUP_KEY` | fallback-compatible only | Legacy fallback for the three secrets above and for the number-conversion preview key |
| `TEACHER_DISPLAY_NAME` | optional | Display name used until the teacher sets one in their profile |

Fallback chains, exactly as the code resolves them:

| Secret | Resolution order |
|---|---|
| Teacher signing | `BUILDER_SESSION_SECRET`, then `BANK_SETUP_KEY` |
| Student signing | `STUDENT_SESSION_SECRET`, then `BUILDER_SESSION_SECRET`, then `BANK_SETUP_KEY` |
| Teacher password | `BUILDER_PASSWORD`, then `BANK_SETUP_KEY` |

**Recommended production configuration:** set `BUILDER_PASSWORD`, `BUILDER_SESSION_SECRET` and
`STUDENT_SESSION_SECRET` to three different strong random values. With only `BANK_SETUP_KEY`, one value is both the
teacher password and the root of every session signature.

To check which configuration is live, call `GET /api/health` after a deployment and search the API logs for the
event `auth.secret_configuration`. It is written once per process, only when a dedicated secret is missing, and
contains only status words per chain: `dedicated`, `shared-teacher-secret`, `fallback` or `missing`. It never
contains a value. The health response itself never includes it.

Student sessions are also revoked server-side: every student route re-loads the student and rejects the token when
the account is inactive, archived, or its `authVersion` changed (for example after a password reset). Login is
throttled per client and per identifier.

### Web Push (student message notifications)

| Variable | Status | Purpose |
|---|---|---|
| `WEB_PUSH_VAPID_PUBLIC_KEY` | optional (all three together) | VAPID public key, base64url, 65 bytes |
| `WEB_PUSH_VAPID_PRIVATE_KEY` | optional (all three together) | VAPID private key, base64url, 32 bytes |
| `WEB_PUSH_VAPID_SUBJECT` | optional (all three together) | `mailto:` address or `https://` URL |

If any of the three is missing or malformed, push is reported as unavailable and the app simply does not offer it.
A key pair can be generated with the `web-push` CLI (`generate-vapid-keys`). After a key rotation, a student's
existing subscription is detected as stale and the notifications card offers a one-click repair.

### AI providers (optional)

Used only by AI-assisted teacher features: exam generation and interpretation, question actions, imports, quality
fixes and analytics advice. When a provider key is missing, only the feature that needs it returns an error.

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY`, `OPENAI_MODEL` | OpenAI client; the model has a code default |
| `ZAI_API_KEY`, `ZAI_BASE_URL`, `ZAI_MODEL` | Z.ai (OpenAI-compatible) client; URL and model have code defaults |
| `QWEN_API_KEY`, `QWEN_BASE_URL`, `QWEN_MODEL`, `QWEN_PLUS_MODEL` | Qwen (OpenAI-compatible) client; URL and models have code defaults |

### Diagnostics

| Variable | Status | Purpose |
|---|---|---|
| `APP_VERSION` or `BUILD_VERSION` | optional | Short version token echoed by `/api/health` when it matches `[A-Za-z0-9._+-]{1,64}` |

The frontend reads no runtime environment variables.

## Operational warnings

- **Never commit secrets.** `local.settings.json` and `*.env` files are git-ignored; keep it that way.
- **Changing a signing secret logs everyone out** of that role. Bumping `BUILDER_SESSION_VERSION` logs out the teacher only.
- **Removing `BANK_SETUP_KEY`** while a dedicated variable is unset breaks login. Set the dedicated variables first,
  deploy, confirm no `auth.secret_configuration` warning, then remove the fallback.
- **Single-teacher model.** Every teacher-authenticated route sees all classes; there is no per-teacher scoping.
- **Public routes.** Only `builder-login`, `platform-login` and `health` answer without a session; `question-image`
  requires a short-lived signed URL. `api/tests/route-auth-inventory-11a.test.js` fails CI if any other route
  answers an anonymous request.
- **Storage growth.** Some dashboards list every assignment document; keep an eye on latency as history grows.

## Change workflow

The binding operating contract for every contributor and coding agent is the root `AGENTS.md`
(roles and review protocol: `docs/development/agentic-development-workflow.md`; required checks per change class:
`docs/development/validation-matrix.md`; PR body skeleton: `.github/pull_request_template.md`). In short, every change
ships as one phase on its own branch and one pull request:

1. Verify `origin/main` is at the expected SHA and the tree is clean before branching.
2. Implement, then run `npm test`, `npx tsc -b`, `npm run build` and `npm run lint` locally.
3. Open the pull request with the first line `⛔ DO NOT MERGE — INDEPENDENT REVIEW REQUIRED`.
4. Wait for the Quality Gate on the exact head commit, then an independent review.
5. Merge only on explicit approval, as a standard merge commit pinned to the reviewed head SHA. Never auto-merge.
6. After merge, confirm the push CI and a read-only production smoke check.

## Where things live

| Area | Location |
|---|---|
| App shell, login, session boot, exam builder | `src/App.tsx` |
| Teacher workspace: students, assignments, dashboard | `src/TeacherPlatform.tsx`, `src/TeacherDashboard.tsx`, `src/students/`, `src/assignments/` |
| Teacher Today Hub | `src/teacher/` |
| Student portal and exam taking | `src/StudentPortal.tsx`, `src/StudentExamPage.tsx`, `src/student/` |
| Projects and project evaluation | `src/projects/`, `api/src/lib/project-tracker/` |
| Reports and CSV export | `src/reports/` (`csv.ts` is the one CSV encoder, with the formula-injection guard) |
| Exam bank | `src/bank/`, `api/src/functions/bank-*.js` |
| Learning content, Reader, visuals | `src/learning/` |
| Messages and notifications | `src/messages/`, `src/notifications/`, `api/src/lib/message-*.js`, `api/src/lib/notification-center.js` |
| PWA: install, push, service worker | `src/pwa/`, `public/sw.js` |
| Auth | `api/src/lib/builder-auth.js`, `api/src/lib/student-auth.js`, `api/src/lib/login-throttle.js` |
| Observability (structured logs, request ids) | `api/src/lib/observability.js` |
| Design tokens and shell styles | `src/design-tokens.css`, `src/shell.css`, `src/ui/` |
| Further documentation | `docs/` |
