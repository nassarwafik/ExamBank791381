# Phase 18C — Network CLI Simulator Plugin v1 (`networkCli@1`)

Baseline `86f334b8d72b9896de9a30c0d9b505021e5343c1` (merges of PRs #249, #250, #251 in ancestry). Branch
`feature/18c-network-cli-simulator-v1`. The first enterprise network-device CLI assessment simulator: a deterministic
educational MANAGED SWITCH with a Cisco-style command feel, built as ONE plugin family on the 16A Question Type Registry.
It is an original SmartAssess implementation — not a network operating system, not a shell, not an emulator, and it never
executes anything on any host.

## 1. Architecture discovered (audit) and what is reused

| seam | canonical infrastructure (reused as-is) | 18C |
|---|---|---|
| simulator registry / type-version model | `src/questionTypeCatalog.ts` (`PRODUCTION_ROWS`, `effectiveQuestionTypeVersion`, `createVersionedRegistry`) | one production row `networkCli` (version 1) |
| validators | `src/questionTypeValidation.ts` → `registerTypeValidator(key, version, fn)` | `validateNetworkCliQuestion` (shared build) |
| defaults | `src/questionTypeDefaults.ts` → `registerTypeDefaults` | default switch + empty private target |
| authoring registry | `src/questionTypes/authoringRegistry.tsx` (lazy `import()`) | `editors/NetworkCliEditor` |
| student renderer registry | `src/questionTypes/studentRegistry.tsx` (lazy `import()`) | `student/NetworkCliResponse` |
| grading seam | `api/src/lib/question-type-graders.js` → `registerGrader` through `assignment-grading.gradeQuestion` | `scoreNetworkCli` (shared build) |
| persistence | the existing `Record<questionId, Answer>` autosave / pause / submit pipeline (`StudentExamPage`, `student-submission.js`) | additive `Answer` kind `networkCli` |
| answer ingest bounding | `api/src/lib/draft-answers.js` (16B-A simulation, 17A code binding) | `bindNetworkCliAnswerToQuestion` (server-side replay) |
| sanitization / private data | `api/src/lib/student-exam-sanitize.js` universal projection + canonical secret-key policy; `examPreviewModel.PREVIEW_SECRET_KEYS` | allow-list projection `projectNetworkCliConfigForStudent`; `targetState` added to both defense-in-depth lists |
| import / export / clone | `structuredExamImport.ts` (unknown fields pass through), `examBuilderState.cloneQuestionWithNewIds` (JSON deep copy), presets instantiate zero questions | tested round-trips, no new code |
| shared finalization | `scripts/build-shared-finalization.mjs` + `api/tests/shared-finalization-drift-14a.test.js` | two new `SHARED_ENTRIES`, regenerated with the canonical generator |
| test helpers | `api/tests/fixtures/coding-17c.js` (seeded assignment, request builders, memory container), 16A / 17A UI harnesses | reused in `api/tests/network-cli-18c.test.js` and `src/questionTypes/networkCli.18c.test.tsx` |
| lazy loading | `React.lazy` + literal `import()` in the registries; `scripts/check-bundle-budget.mjs` signatures | `NETCLI_SIGNATURES` guard |

**Existing Reader CLI (`src/learning/cli/`, Batch 8–10)** — a full teaching simulator (switch + router, DHCP, OSPF / EIGRP, ACL,
port-security, lines, VTP) used only by the Learning Reader (`cli-terminal@1` learning activity, never a graded question). It was
audited first and its *semantics* are adopted for the shared V1 subset (prompt suffixes, canonical short interface names, IPv4
/ mask / VLAN rules, show-table conventions). Its *code* is deliberately NOT imported by the exam plugin:

* the shared server build requires top-level pure modules under `src/` (the drift test compares a flat directory);
* a published exam revision must keep `networkCli@1` semantics forever, while the Reader grammar evolves with every content batch;
* the brief forbids routing / ACL / DHCP in V1 and the Reader's state model carries secret-named fields (`enableSecret`, `password`)
  that the universal sanitizer would strip from any public object.

`src/networkCli/readerCompat.18c.test.ts` pins the shared semantics AND the deliberate divergences (Vlan1 down by default, port
inventory, IOS-style access-VLAN auto-create, host-mask / network / broadcast address refusals). What is new: the frozen engine,
the question model, the terminal UI, the editor, the review projection and their tests.

## 2. Identity and versioning

`presentationType: "networkCli"`, `questionTypeVersion: 1` → `networkCli@1`. Catalog row: `interactive`, grading mode `auto`,
capabilities `autoGrading · partialCredit · interactive · offline`, `compoundPart: false` (V1 decision — one terminal per question
keeps the session, replay and review unambiguous), `responseKinds: ["networkCli"]`. The catalog now has **18** production types.
`networkCli@2` (or any other version) fails closed on every surface through the ONE authority `effectiveQuestionTypeVersion`:
`UNSUPPORTED_QUESTION_TYPE_VERSION` in validation / finalization, the explicit unsupported-version state in `QuestionBodyEditor`,
the safe notice in `StudentQuestionCard`, `unknownTypeResult` (score 0, manual review) on the server, `NETCLI_QUESTION_MISMATCH`
at ingest. The canonical device state itself is versioned (`state.v = 1`); `v: 2` is refused by `normalizeDeviceState`.

## 3. CLI modes and command set (V1)

| mode | prompt | entered by |
|---|---|---|
| user EXEC | `Switch>` | start · `disable` · `exit` from privileged |
| privileged EXEC | `Switch#` | `enable` / `en` · `end` · `exit` from global |
| global configuration | `Switch(config)#` | `configure terminal` / `conf t` / `config t` (+ `conf term`, `conf terminal`, `config terminal`, `configure t`) |
| interface configuration | `Switch(config-if)#` | `interface <FastEthernet 0/1-24 \| GigabitEthernet 0/1-2 \| vlan <id>>` (`int` accepted) |
| VLAN configuration | `Switch(config-vlan)#` | `vlan <id>` |

`hostname <name>` changes the prompt immediately (`BR1-SW1(config)#`). Supported commands: `enable`/`en`, `disable`,
`configure terminal` family, `exit`, `end`, `hostname`, `interface` (spellings `FastEthernet0/5`, `fa 0/5`, `f0/5`, `gigabitEthernet 0/1`,
`gi0/1`, `g0/1`, `vlan 10`), `vlan <id>`, `name <vlan-name>`, `switchport mode access | trunk`, `switchport access vlan <id>`,
`switchport trunk native vlan <id>`, `ip address <ipv4> <mask>` (`ip addr`), `shutdown`/`shut`, `no shutdown`/`no shut`,
`show running-config`/`show run` (privileged + configuration modes), `show vlan brief`/`show vlan`, `show interfaces trunk`
(`show interface trunk`, `show int trunk`), `show ip interface brief` (`show ip int brief`, `show ip int br`) — the three tables also in
user EXEC; `do <show …>` in configuration modes; `?`/`help` lists the current mode's syntax. Everything else is an explicit
refusal: `% Invalid input detected.` (unknown), `% Incomplete command.`, `% <detail>.` (invalid argument), `% This command is not
available in <mode>.` (wrong mode) and named `not-supported` families (`interface range`, `switchport trunk allowed vlan`, every
other `no …` form, `write`/`wr`/`copy`, `ping`/`traceroute`/`telnet`/`ssh`, `reload`/`erase`/`delete`/`debug`). Every refusal carries an
Arabic educational hint; no refusal ever changes state; unsupported input is never reported as success.

Device model: 24 × FastEthernet0/1-24 + 2 × GigabitEthernet0/1-2 (ports outside the inventory, sub-interfaces, ranges and other
slots are invalid interfaces); ports start up; Vlan1 exists and starts administratively down (IOS default); another SVI exists once
`interface vlan <id>` was entered and starts up; VLAN 1 is implicit (`name` on it is refused), 1002–1005 are reserved;
`switchport access vlan` on a missing VLAN auto-creates it with the IOS notice; `switchport …` is rejected on an SVI, `ip address` on a
physical port (`% IP addresses may not be configured on L2 links.`); a mask must be contiguous and neither `0.0.0.0` nor
`255.255.255.255`; an address must be a usable unicast host inside its subnet (not network / broadcast / 0.x / 127.x / ≥ 224.x).

## 4. Parser / engine (`src/networkCliEngine.ts`, pure, shared build)

Closed `COMMAND_TABLE` (keyword sequences + modes + argument parser built from regular-expression value checks), longest keyword
sequence first; `parseCommand` → `executeCommand(session, line)` → mode check → `apply` → `canonicalizeState`. Bounds:
`inputChars 200`, `tokens 24`, `commands 300` (history), `hostnameChars 63`, `vlanNameChars 32`. Whitespace is collapsed, keywords
are case-insensitive, values are never normalized into something else (`10.0.0.01`, `fa0/01`, `1e3`, `0x10`, `+10` are refused).
No `eval`, `Function`, `import()`, `require`, timers, randomness, DOM, fetch, sockets, file system or process access (guarded by
tests); `;`, `|`, `&&`, backticks, `$()`, `<`, `>` are only text that fails to match. `replayCommands(initial, commands)` is the ONE way
every surface rebuilds a session (bounded to 300 entries, `truncated` flag). The engine returns the same session object for every
refusal and never mutates its input.

## 5. Canonical device state (`NetworkCliDeviceState`, `v: 1`)

```
{ v: 1, device: "switch", hostname, vlans: { "<id>": { name? } }, interfaces: { "<f0/n|g0/n|vlanN>": { mode?, accessVlan?, nativeVlan?, shutdown?, ipAddress?, subnetMask? } } }
```

SPARSE and canonical: VLAN 1 never stored; VLANs by numeric id; interfaces in inventory order then SVIs by id; only values that
differ from the interface defaults (`accessVlan 1`, `nativeVlan 1`, `shutdown false` for ports and new SVIs, `shutdown true` for
Vlan1) are stored; an empty record is kept only for a created SVI (its existence IS configuration). `serializeState` is
deterministic, so equivalent command sequences serialize byte-identically (tested). The session (mode, selected interface / VLAN)
and the transcript are never persisted. `normalizeDeviceState` ingests untrusted JSON fail-closed: exact shape, ranges, SVI / port
field rules, no extra keys, `__proto__` / `constructor` / `prototype` refused at every level.

## 6. Show commands

All four are pure functions of the canonical state (`showRunningConfig`, `showVlanBrief`, `showInterfacesTrunk`,
`showIpInterfaceBrief`): running-config lists VLAN blocks, every inventory port in order with its non-default lines (access vlan,
native vlan, mode, shutdown), then the SVIs; `show vlan brief` derives port membership from effective access VLAN (trunks excluded,
four ports per line); `show interfaces trunk` lists trunk-mode ports that are up with their native VLAN and the active VLAN list
(no output when there is no trunk, like a device); `show ip interface brief` lists all 26 ports and the SVIs with status / protocol
/ method derived from the state. Ordering is stable; equivalent states print identical output (tested).

## 7. Question model, grading authority and the practice / exam boundary (`src/networkCliQuestion.ts`)

* PUBLIC `question.networkCli = { device: "switch", initialState }`; PRIVATE `question.answer = { targetState, scoring }`.
* `answer.targetState = { hostname?, vlans: { id: { name? } }, interfaces: { name: { mode?, accessVlan?, nativeVlan?, shutdown?, ipAddress?, subnetMask? } } }`
  — every present leaf is ONE graded check (a present VLAN key = "must exist", a name = a second check); compared against the
  EFFECTIVE values (a check on a never-created SVI fails); interface spellings are canonicalized.
* Dimensions: `hostname`, `vlan:<id>:exists`, `vlan:<id>:name`, `if:<name>:mode | accessVlan | nativeVlan | shutdown | ipAddress | subnetMask`
  (`evaluateNetworkCliTarget` → `{ id, label, expected, actual, ok }[]`). Scoring `proportional` (marks × passed / total, the
  matrix / categorization convention) or `allOrNothing`; the grader returns `parts: { correct, total }` like the Wave 1 types.
* **Authority**: `scoreNetworkCli` (registered as the `networkCli@1` server grader) replays the response's bounded command history
  from the question's initial state through the shared engine and grades the RESULTING canonical state. The client-claimed `state`
  is never read for grading; the transcript is only the input of that replay and presentation evidence. Two different valid
  sequences that reach the target earn identical marks; a forged state earns nothing; `networkCli@2`, a malformed config or an
  empty target fail closed (0, manual review); another response kind scores 0.
* **Ingest**: `student-submission.js` already passes the assignment's exam snapshot to `normalizeDraftAnswers` (saveDraft, submit,
  pause); `bindNetworkCliAnswerToQuestion` requires `networkCli@1` with a valid config, bounds the history, replays and STORES the
  server-derived state (the claim is discarded). Unknown ids, other types, compound parts (`NETCLI_QUESTION_MISMATCH`), oversize
  histories (`NETCLI_HISTORY_TOO_LARGE`) and malformed shapes are dropped with a code.
* **Practice vs exam**: the terminal's device-style lines and Arabic hints are practice feedback (invalid command, wrong mode,
  malformed IP …) produced by the same engine in the browser; they never carry target data and never are a grade. Official grading
  follows the existing SmartAssess authority (`gradeExam` on submit / teacher end, manual overrides in the review). The Coding
  Runner is untouched: no Docker, no execution, no callback.

## 8. Student terminal UX (`src/networkCli/NetworkCliTerminal.tsx`, lazy)

Visible live prompt (`<label>` of the input), one text input (`maxLength 200`, no autocomplete / autocorrect / autocapitalize),
Enter executes with `preventDefault` (never a form submission), ArrowUp / ArrowDown recall the history (clamped, returns to an empty
draft), «تنفيذ» button, `role="log" aria-live="polite"` screen that scrolls on its own, visible focus (`:focus-within` ring, input
outline), explicit disabled / read-only state (input + button disabled, `data-disabled`, notice), a mode / remaining-commands status
line and the simulation disclaimer. A full history (300) locks the input with an explicit message; an over-long line is refused with
a notice and not recorded. **RTL**: the page stays RTL; the island has `dir="ltr"` + `direction: ltr; unicode-bidi: isolate`, the log
and the input are `dir="ltr"`, Arabic hints are the only `dir="rtl"` text — prompts, commands, interface names, addresses and masks
are never visually reversed (tested inside `<main dir="rtl">`). The renderer (`student/NetworkCliResponse.tsx`) reads ONLY the
allow-listed public projection, rebuilds the session by replaying the stored history (restore / resume), and emits
`{ kind: "networkCli", commands, state }` through `onAnswer`. The teacher preview renders the same component with a preview note.

## 9. Authoring (`src/questionTypes/editors/NetworkCliEditor.tsx`, lazy)

Structured tables, never raw JSON: device + initial state (hostname, VLAN database, interface rows with mode / access VLAN / native
VLAN / administrative state / SVI address + mask), the private target state (same tables; an empty field = not graded; the Arabic
caption says so), scoring mode, the live check count, INLINE validation through the ONE canonical validator (invalid text such as
`abc` as a VLAN id stays visible and blocks — never silently normalized), and «جرّب الحالة الابتدائية في الطرفية» (the same terminal on
a throw-away session; nothing is written to the node). The inspector shows «محاكي أوامر الشبكة (CLI) · الإصدار 1 · تصحيح تلقائي»; the
palette card sits under «تفاعلي» with «تصحيح تلقائي · علامة جزئية · تفاعلي». Validation codes: `NETCLI_VERSION_UNSUPPORTED`,
`NETCLI_CONFIG_MISSING`, `NETCLI_CONFIG_UNKNOWN_KEY`, `NETCLI_DEVICE_UNSUPPORTED`, `NETCLI_INITIAL_STATE_INVALID`,
`NETCLI_TARGET_MISSING`, `NETCLI_TARGET_UNKNOWN_KEY`, `NETCLI_TARGET_HOSTNAME_INVALID`, `NETCLI_TARGET_VLAN_INVALID`,
`NETCLI_TARGET_INTERFACE_INVALID`, `NETCLI_TARGET_EMPTY`, `NETCLI_SCORING_UNKNOWN` — all BLOCKING in finalization (client and server).

## 10. Import / export / clone / templates / published snapshot

Duplicate, move, move-to-section, clone, undo / redo and the JSON export → `parseStructuredExamJson` import preserve `networkCli`,
`answer` and `questionTypeVersion` byte-for-byte (tested); presets instantiate zero questions (no change); the published exam
snapshot carries the full question and the student projection is produced from it by the universal sanitizer; the teacher review
(`assignment-review.js`) hands `expectedAnswer` to teachers only. No new import / export code was needed.

## 11. Security model and adversarial tests

Client and server run the same closed grammar; the server never trusts the client's state (replay at ingest AND at grading); the
target lives only under `answer` (blanked), `targetState` is additionally in `GRADING_SECRET_KEYS` and `PREVIEW_SECRET_KEYS`; the
public config is REBUILT through an allow-list (smuggled `targetState` / `expectedHostname` / `correctVlan` never reach a student);
no key of the public shape matches a secret family. Adversarial coverage: `;` `|` `&&` backticks `$()` redirections (text only, no
state change, no exception), 500-character line and 40-token line refused, huge hostname refused, invalid VLAN ids (0, 4095,
1002–1005, text, overflow, exponent, hex), malformed IPv4 / masks / unusable host addresses, invalid interfaces, `__proto__` /
`constructor` / `prototype` keys at every state level (refused; `Object.prototype` proven untouched) and as command values
(`hostname __proto__` invalid, `name constructor` a plain value), transcript HTML rendered as text, source guards for process /
fs / net / eval / timers / randomness in the engine and the question model, catalog pin, grader-per-version invariant (16A §12).

## 12. Performance

Pure TypeScript, no parser dependency. Initial JS graph (gzip, `npm run check:bundle`): baseline `86f334b8` 16 files / **124.6 KB**
→ 18C 16 files / **124.9 KB** (+0.3 KB: the defaults literal, the catalog row, the `Answer` kind, the registry entry; budget 125 KB).
The engine + question model ship as their own lazy chunk (`networkCliQuestion-*.js`), the terminal, renderer and editor as three
lazy chunks (`NetworkCliTerminal`, `NetworkCliResponse`, `NetworkCliEditor`) — the bundle guard refuses any of their signatures in
an initial file.

## 13. Tests

| suite | kind | covers |
|---|---|---|
| `src/networkCliEngine.test.ts` | new-function (fail-first: module absent) | modes / prompts / abbreviations, every command, refusals, injection text, bounds, help, show tables, equivalence, serialization, fail-closed normalization, immutability |
| `src/networkCliQuestion.test.ts` | new-function | defaults, every validation code, canonical interface spellings, version authority, allow-list projection, answer bounds, binding / replay, answered mirror, state grading, partial / allOrNothing, effective administrative state, forged state, fail-closed |
| `src/networkCli/readerCompat.18c.test.ts` | compatibility pins | exam engine ≡ Reader CLI on the shared subset + documented divergences |
| `src/questionTypes/networkCli.18c.test.tsx` | new-function (UI) | catalog / palette identity, terminal (Enter, history, LTR-in-RTL, disabled, restore, bounds), secrecy (sanitizer, DOM, preview), editor in the real Builder (tables, validation, try-out, undo / redo), import / clone round-trips, teacher review, unsupported version, lazy-import guard |
| `api/tests/network-cli-18c.test.js` | new-function (server) | `gradeExam` state grading, partial / allOrNothing, forged state, fail-closed, ingest binding / drops / hostile input, sanitizer secrecy, `isResponseAnswered`, REAL submission handler submit + saveDraft, shared-build parity, architecture guards, grader-per-version invariant |

Migrated pins (count / order only): palette 17 → 18 (`authoring.16a`, `simulation.16b-a` ×2, `coding.17a.test.tsx`), catalog 17 → 18
(`simulation.16b-a`, `coding.17a.test.ts`, `smartsim-guards`), `UNIVERSAL` order (`questionTypeCatalog.16a`), last-row pin
(`coding.17a.test.ts`), the `Answer` union prefix (`StudentExamPage.ux7b1`). No defect in reused code was found, so no baseline
fail-first beyond "module absent" is claimed.

## 14. Known V1 limitations and recommended V2

* One device type (switch), fixed 24 + 2 inventory, no links / neighbours / reachability, no `interface range`, no
  `switchport trunk allowed vlan`, no `no …` forms except `no shutdown`, no `description`, no `ip default-gateway`, no
  `write`/`copy` (explicitly "not simulated"), no `show interfaces status` / `show interfaces <if> switchport` / `show mac address-table`,
  no reserved-VLAN rows in `show vlan brief`, no `do` outside configuration modes, hostname / VLAN-name checks are exact and case-sensitive.
* Checks are equally weighted; weights, per-check marks, teacher-restricted command scope (`allowedCommands`) and a "strict device
  feedback only" mode (hide Arabic hints in exams) are natural V2 options; a router profile (`networkCli` device `router`, sub-interfaces,
  static routes) and Reader-exercise import (`CliExerciseConfig` → initial / target state) are the recommended next commands / features.

## 15. Independent Review Fix 1 — one canonical PRIVATE grading contract (fail closed)

**Root cause (reviewed head `98d9454`).** `validateNetworkCliQuestion` refused malformed targets and unknown scoring policies at
finalization, but `scoreNetworkCli` evaluated whatever `answer.targetState` it was handed: a `vlans["1"]` target row was satisfied by
the implicit VLAN 1, an unknown `scoring` silently became proportional, and unknown target fields were ignored while the remaining
checks were graded. A historical, imported, migrated or corrupted snapshot could therefore earn automatic credit under a contract
finalization would have blocked (the real submission handler awarded 12/12 for a VLAN-1-target snapshot — fail-first log
`scratchpad/18c/fail-first-rf1-98d9454.log`).

**Fix.** `validateNetworkCliAnswerKey(raw)` in `src/networkCliQuestion.ts` (shared build) is the ONE authority for the private key.
It validates AND normalizes: answer root (`targetState` + optional `scoring` only → `NETCLI_ANSWER_KEY_INVALID`), target root
(`hostname` / `vlans` / `interfaces` only), canonical hostname, VLAN rows 2–4094 without reserved ids (VLAN 1 is never a target row),
`{ name? }` entries with canonical names, interface rows that are supported ports / SVIs with the port / SVI field restrictions,
VLAN ranges, boolean `shutdown`, IPv4 / mask types and a usable host address, no prototype-sensitive keys, and no two aliases of the
same interface (`f0/5` + `FastEthernet0/5` refused). `scoring`: absent → the historical default `proportional`; `proportional` /
`allOrNothing` → itself; anything else → `NETCLI_SCORING_UNKNOWN` (never defaulted). The normalized key carries canonical interface
names and the check count. Consumers:

* `validateNetworkCliQuestion` delegates the whole key to it (finalization codes unchanged, plus `NETCLI_ANSWER_KEY_INVALID`);
* `scoreNetworkCli` validates the public config AND the private key BEFORE any check; if either is invalid it returns
  `NETWORK_CLI_FAIL_CLOSED = { score 0, correct false, manualReview true, parts { 0, 0 } }` — never a partial grade of the valid-looking
  subset. A malformed / missing / foreign STUDENT response under a valid contract stays an ordinary zero (`manualReview false`);
* the teacher review (`NetworkCliAnswerView` / `NetworkCliKeySummary`) shows an explicit «إعداد التصحيح غير صالح — تصحيح يدوي» state
  (no ✓ / ✗ checklist, never summarised as proportional) for an invalid key; the editor's check count reads the same contract;
* `evaluateNetworkCliTarget` no longer treats VLAN 1 as "always exists" (defense in depth — the contract refuses the row anyway).

**Tests (fail-first on `98d9454`: 12 failed).** `src/networkCliQuestion.test.ts` GKEY1–GKEY8 + the shared-contract test (finalization
and scorer agree on every key), `api/tests/network-cli-18c.test.js` (`gradeExam` and the REAL submission handler: VLAN-1 target /
unknown scoring / mixed field ⇒ 0 marks + the question's marks pending manual review; shared-build parity of the validator),
`src/questionTypes/networkCli.18c.test.tsx` (teacher review invalid-key state). Mutation campaign MK1–MK5 (table in the PR).
Initial-graph impact: none (the module is a lazy chunk). Budget untouched.
