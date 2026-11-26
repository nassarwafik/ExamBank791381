# «ابنِ الشبكة» — build-the-network exercises in book 791381

Status: implemented on branch `claude/pensive-turing-s0rnhp`. Builds on N1/N2 (`docs/enterprise-network-lab-tool-design.md`).

## 1. What the learner does

In every exercise the learner starts from an **empty network** in the book's network lab («مختبر الشبكات»), adds the devices, connects
the cables and configures them through the simulator's own device surfaces (router / switch CLI, PC IP Configuration and Command Prompt,
access point, server services). «تحقّق من شبكتي» sends the network to the server, which marks every goal ✓ / ✕.

## 2. The activity: `simulation` / `network-build` v1 (a new family)

Not a new version of `network-lab` (that family judges a **fixed** topology given by the author); here the topology itself is the answer.

| Part | Visibility | Content |
|---|---|---|
| `task` | public (served) | `intro`, `goals` (one per check, same ids / order), `kinds` (device kinds the builder offers) |
| `checks` | private | build checks and networkTopology@2 checks, on the ids the builder gives (pc1, sw1, r1, ap1, lap1, srv1) |
| `feedback` | private | right / wrong messages, hints (after a wrong check), explanation (after a right one) |
| `solution` | private | `{ config, actions }` — a network that reaches every goal; its config is the key's `reference` |

Build checks: `build.device` {deviceId, deviceKind}, `build.link` {a, b} (a direct cable, any ports), `build.count` {deviceKind, min, max?}.

## 3. The judge (`src/learning/lab/networkBuildJudge.ts`, shared with the API)

One source, generated for the API by `scripts/build-shared-finalization.mjs` (drift-guarded); `api/src/lib/learning-network-build.js`
wraps it; `learning-check.js`, `learning-study.js` and the attempt route (`api/src/functions/learning-study.js`, 384 KB bound) call it.

- **Key first (fail closed):** kinds, unique ids, valid build checks, the reference is a valid networkTopology@2 config of the offered
  kinds, and the simulator checks are a valid answer key **on the reference**. Otherwise `unavailable` → 503 retryable, nothing written
  (AGENTS.md §10). An evaluation that throws is `unavailable` too.
- **The learner's network:** validated as a networkTopology@2 envelope (an invalid one → wrong, `NETWORK_INVALID`); a kind the task does
  not offer → wrong, `KIND_NOT_ALLOWED`; the actions are replayed **once** (`prepareSmartSimEvaluation`); actions that do not replay →
  every simulator goal false, `ACTIONS_INVALID`.
- **Per goal:** build checks on the topology; each simulator check evaluated alone on the prepared state, so a goal naming a device the
  learner did not build is simply not reached. Right only when every goal is reached. The reply carries booleans and the issue code only.
- Any state, score or verdict sent by the browser is ignored.

## 4. The builder's plain mode

`NetworkLabTool` with `exercise={{ kinds }}`: only the offered kinds (never the hub), networkTopology@2 ports (no serial), no IPv6 form,
no lab router commands, no examples and no file; the view is replayed by `replayNet2Cached` — **the same replay the server judges**, so
what works on screen is what is judged. The network is a per-exercise browser draft (`eb.networkBuild.v1.<blockId>`); the shell's
«إعادة تعيين» empties it. The builder is loaded lazily by `src/learning/lab/NetworkBuildActivity.tsx`.

## 5. Content: module `791381-m29` «ابنِ الشبكة» (order 29, after the final summary)

A practice module, not a book section (`origin: "teacher-enrichment"`; each page's `source` is the book page of its topic, with a note).
Publishable like every module, never auto-published.

| Page | Exercise | Kinds | Book topic (PDF) |
|---|---|---|---|
| l01-p01 | شبكة محلية بسويتش | switch, pc | أجهزة الشبكات (48) |
| l01-p02 | قسمان على سويتش واحد (VLAN) | switch, pc | VLAN (121) |
| l02-p01 | راوتر يصل شبكتين | router, switch, pc | الراوتر (52) |
| l02-p02 | Router on a Stick | router, switch, pc | Trunk و RoaS (146) |
| l03-p01 | الراوتر يوزّع العناوين (DHCP) | router, switch, pc | DHCP (170) |
| l03-p02 | شبكة لاسلكية محميّة | ap, switch, pc, laptop | Wi-Fi (159) |
| l03-p03 | خادم ويب واسم موقع (HTTP و DNS) | switch, pc, server | البروتوكولات (87) |

**Study Strength (owner decision 2026-11-26): «ابنِ الشبكة» is the book's 29th study module, worth 20 points** like every module
(round(completed / 7 × 20)); a right network is recorded once. `STUDY_MODULE_COUNT` 28 → 29 (`STUDY_MAX_TOTAL` 560 → 580). No student's
points decrease: the 28 book modules and their eligible counts are unchanged (475). Learning Practice (1440) + the 28 book modules (560)
still fill the 2000-point path exactly; the 29th module adds up to 20 raw points beyond the capped path, like exams, games and projects.

## 5b. Content: module `791381s-m37` «ابنِ الشبكة» in the summary booklet (owner decision 2026-11-26)

A practice module after the booklet's last section (order 37), seven exercises a step deeper than m29, each on a booklet section:

| Page | Exercise | Kinds | Booklet topic (PDF) |
|---|---|---|---|
| l01-p01 | VLAN على سويتشين بـ Trunk | switch, pc | Trunk (54) |
| l01-p02 | Native VLAN على الـ Trunk (+ allowed list) | switch, pc | Native / Tagged (48) |
| l01-p03 | VTP — Server وClient | switch, pc | VTP (51) |
| l02-p01 | حماية المنافذ Port Security | switch, pc | Port Security (70) |
| l02-p02 | احمِ الراوتر بكلمات المرور | router, switch, pc | حماية أجهزة Cisco (73) |
| l03-p01 | خادم DHCP في الشبكة (a Server device) | switch, pc, server | DHCP (66) |
| l03-p02 | خادم ويب في المنطقة العازلة DMZ | router, switch, pc, server | DMZ (59) |

- **Book lock:** the printed booklet is unchanged (202 pages, 32 drawings, same fingerprints). The owner chose a new module, so the lock
  gains only the empty order entry `"791381s-m37": []`. The module follows the booklet's rule for added blocks: activities and «توضيح»
  callouts only.
- **Study Strength:** one more study module (20 points). The study index of m00–m36 is unchanged (only additions), so no student loses
  points. The overview shows a ninth group «ابنِ الشبكة» in the booklet's neutral tone.
- **Authoring:** both modules use `src/learning/content/networkBuildAuthoring.ts`; m29's generated data is byte-identical after the refactor.

## 6. Evidence

- `src/learning/lab/networkBuild.contract.test.ts` — every authored exercise: the empty network reaches no goal, the solution reaches
  every goal, the bare solution topology never passes; served body = task only; judge per goal; issues; untrusted keys → unavailable;
  validator.
- `api/tests/learning-network-build.test.js` — the real attempt route on the real generated indexes (wrong / right / once / forged /
  kinds / 503 / 413 / 403 / teacher), and for the booklet's m37 (a VTP network completed once).
- `src/learning/lab/NetworkBuildActivity.test.tsx` — the plain builder, the check seam, verdict clearing, failure ≠ wrong, draft + reset.
- Pins updated honestly: the activity registry (26 → 27), the 791381 module count (28 → 29), the m29 «unknown id» sentinels (now m30), and
  the study footprint (237 pages, 482 eligible, 29 study modules, 580 maximum).

## 7. Not in scope

Hub, serial WAN, static / dynamic routing, ACL, NAT and IPv6 stay lab-only (N2) — they are not networkTopology@2 features, so the server
cannot judge them yet. A later phase could move the lab extensions into the shared finalization and add exercises for them.
