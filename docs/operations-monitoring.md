# Monitoring and alerts — runbook (D3)

What the platform reports by itself, and the alert rules the **repository owner** turns on. Agents never change Azure settings
(`AGENTS.md` §2, §11). Every Azure step below is the owner's.

## 1. What already reports (no setup)

| Signal | Where | What it tells you |
|---|---|---|
| **Production health probe** | GitHub → Actions → *Production health* (`production-health.yml`, every 30 min) | The API answers `/api/health`; the home page is served with the app shell, the Content-Security-Policy and the security headers. A failed run means the site is down, or a deployment lost the policy or headers. |
| **API request events** | API logs: one JSON line per request (`http.request.completed` / `http.request.failed`, with `route`, `status`, `durationMs`, `requestId`) | Errors and slow routes. Every response carries `X-Request-ID`, so a teacher's error report can be matched to its log line. |
| **Client errors** | API logs: `client.error` (kind `runtime` / `rejection` / `render` / `chunk`) | A crash in a teacher's or student's browser. Each event has the error class, the code location in the bundle, the UI area (`app`, `exam-question`, `global`) and the build id. It never contains a message, a stack, a URL query, an answer or a name. |
| **CSP violations** | API logs: `client.csp_violation` | The browser blocked something under the D2 policy (`directive`, `blocked` origin or keyword). After a deployment this means a feature needs a policy source, or something tried to inject a script. |
| **AI throttling** | API logs: `ai.rate_limited`, `ai.rate_limit.unavailable` | A teacher session hit an AI budget (`reason` = the policy), or AI was refused because the limiter's storage failed. |

**Getting notified of a failed probe:** in GitHub → your avatar → **Settings → Notifications → Actions**, choose
**"Notify me for failed workflows only"** (email and/or web). GitHub notifies the user who last changed the schedule in the
workflow file.

## 2. Turn on Application Insights (once)

The API's JSON lines go to the Functions host log. To keep, search and alert on them:

1. Azure Portal → the **Static Web App** → **Settings → Application Insights** → **Enable** → create a new Application
   Insights resource (same region) → **Save**. If your plan does not offer it on the Static Web App, use the linked Functions
   resource the same way.
2. Wait about 10 minutes, then in the Application Insights resource → **Logs** run:

```kusto
traces
| where timestamp > ago(1h)
| extend e = parse_json(message)
| summarize count() by tostring(e.event)
| order by count_ desc
```

You should see `http.request.completed` and, after you open the site, the other events.

## 3. Alert rules (Application Insights → Alerts → Create → Alert rule → Custom log search)

Create one **action group** first (Alerts → Action groups → Create): an email to the owner. Then one rule per row. Use a
5-minute evaluation frequency unless the row says otherwise.

| Rule | Query (the `where` part; `traces \| extend e = parse_json(message)` before it) | Fire when |
|---|---|---|
| API failures | `\| where tostring(e.event) == "http.request.failed"` | count > 5 in 15 min |
| Client error spike | `\| where tostring(e.event) == "client.error" \| summarize users = dcount(tostring(e.userref))` | users > 5 in 15 min |
| A deployment broke the policy | `\| where tostring(e.event) == "client.csp_violation"` | count > 0 in 1 h (every 15 min) |
| AI abuse or a runaway loop | `\| where tostring(e.event) == "ai.rate_limited"` | count > 10 in 1 h |
| AI limiter storage failing | `\| where tostring(e.event) == "ai.rate_limit.unavailable"` | count > 0 in 15 min |

**Availability test (recommended):** Application Insights → **Availability → Add Standard test**:

- URL: `https://<your site>/api/health`;
- frequency: 5 minutes;
- test locations: 3;
- success criteria: HTTP 200;
- alert when 2 or more locations fail.

This catches an outage within minutes. The GitHub probe catches it within 30 minutes.

## 4. Useful queries

**Which client errors, where, since the last deployment:**

```kusto
traces
| where timestamp > ago(1d)
| extend e = parse_json(message)
| where tostring(e.event) == "client.error"
| summarize reports = count(), users = dcount(tostring(e.userref)) by kind = tostring(e.kind), errorName = tostring(e.errorName),
    location = tostring(e.location), area = tostring(e.area), build = tostring(e.build)
| order by users desc
```

`location` is in the minified bundle (`/assets/<chunk>-<hash>.js:line:col`). Build locally from the same commit to map it
to source.

**Slowest API routes today:**

```kusto
traces
| where timestamp > ago(1d)
| extend e = parse_json(message)
| where tostring(e.event) startswith "http.request."
| summarize p95 = percentile(todouble(e.durationMs), 95), failures = countif(toint(e.status) >= 500), requests = count() by route = tostring(e.route)
| order by p95 desc
```

**One request a teacher reported** (they can read `X-Request-ID` from the error code shown on screen):

```kusto
traces | extend e = parse_json(message) | where tostring(e.requestId) == "<id>"
```

## 5. Privacy

The events carry pseudonymous references (`userref`, a truncated SHA-256), never names, answers, prompts, tokens or messages.
That is enforced by the API's redaction (`api/src/lib/observability.js`) and by the client report allowlists
(`api/src/functions/client-error-report.js`). Application Insights retention is the owner's choice (default 90 days).
