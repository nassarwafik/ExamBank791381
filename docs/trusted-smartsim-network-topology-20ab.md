# Phase 20A + 20B — Trusted SmartSim Core and Network Topology Simulator v1

Status: implemented on `feature/20ab-trusted-smartsim-network-topology` (baseline `a132528`). Owner review required before merge.

## 1. Problem statement

ExamBank already has two kinds of interactive question that each solve one part of the problem:

- **`simulation@1`** (Phase 16B-A) runs a teacher-uploaded HTML/JS package in a sandboxed, CSP-locked iframe. It is flexible but
  **untrusted**: the uploaded JavaScript can never be a grading authority. The question is always manual, and the state it
  reports is an opaque, bounded JSON value.
- **`networkCli@1`** (Phase 18C) is a trusted, code-owned, single-switch CLI that the server grades by replaying commands. It is
  trusted but tied to one domain and one device.

20A adds the general piece between them: a **trusted, code-owned, versioned plugin framework** (`smartSim@1`). A plugin is
repository TypeScript compiled into both the browser and the API. It owns a public config, a deterministic action model, a
canonical state and a set of typed private checks. The server replays the student's actions and grades the replayed state
with weighted partial credit. It never trusts a client-derived state or a browser score.

20B ships the first plugin, **`networkTopology@1`**: a multi-device network (routers, switches, PCs) in which each switch runs
the unchanged `networkCli@1` engine, each router runs a new deliberately small router CLI v1, PCs take IPv4 settings, and one
pure connectivity engine decides reachability for both the student's simulated ping and the server's grading.

## 2. `simulation@1` (untrusted, external) vs `smartSim@1` (trusted, code-owned) — never blurred

| | `simulation@1` | `smartSim@1` |
|---|---|---|
| Who writes the behaviour | the teacher, as an uploaded package | the repository (reviewed TypeScript) |
| Where it runs | sandboxed iframe (`sandbox="allow-scripts"`, CSP) | the shared pure modules, in the browser **and** on the server |
| Stored answer | `{ kind: "simulation", state }`: an opaque bounded value | `{ kind: "smartSim", pluginKey, pluginVersion, actions, state }` |
| Grading | **always** `0 + manualReview` (no automatic authority) | server replay of `actions` → typed private checks → weighted score |
| Catalog row | `manual`, unchanged | `auto`, partial credit, interactive, not a compound part |
| Selection | the package is data | exam data only **names** an identity; code decides what it means |

Pins in `api/tests/smartsim-trusted-20a.test.js` keep the separation in place. The simulation grader stays `0 + manual review`
whatever the state, the question or a smuggled trusted-plugin claim says. A `smartSim`-shaped answer can never be bound to a
simulation question. No exam field, uploaded package or sandbox message can register or select a trusted plugin: registration
needs repository code (functions), and the plugin set is the one the repository registers. The 16B-A sandbox, CSP and bridge
are untouched by this phase.

## 3. Plugin security boundary

- **Code-owned registry** (`src/trustedSimRegistry.ts`). `registerSmartSimPlugin` takes a plugin object with functions. It
  refuses a duplicate `(key, version)`, a malformed key, missing functions or `maxActions > 1000`. The registry is a
  module-local `Map` (no `globalThis`, no data-driven registration). Production registers exactly `networkTopology@1`
  (`src/trustedSimPlugins.ts`).
- **Exact identity.** `resolveSmartSimPlugin(key, version)` returns the plugin registered for exactly that pair or nothing.
  There is no "latest" fallback, no key-only match and no version coercion. An unknown identity fails closed everywhere:
  finalization blocks, the student sees an explicit "unavailable" state, grading returns `0 + manualReview`.
- **UI registry** (`src/trustedSim/smartSimUiRegistry.ts`). `(key, version)` maps to three lazy components (workspace, editor,
  review details), each behind a **literal** `import("../networkTopology/…")`. Exam JSON never stores a module path,
  JavaScript, a function, a component name, an import or a grader name. A source guard test pins that only literal import
  edges exist.
- **Bounded JSON** (`checkBoundedJson`). Depth ≤ 8, ≤ 64 keys per object, UTF-8 size ≤ 256 KB for an answer, finite numbers
  only, no functions. `__proto__` / `constructor` / `prototype` are refused at every nesting level.
- **No I/O.** The core, the router engine, the topology model, the connectivity engine and the plugin reach no process,
  filesystem, network, timer, randomness or dynamic-code API. Tests scan the TypeScript sources and their committed server
  copies for this.

## 4. Persisted contract

```text
question.type = "smartSim", questionTypeVersion = 1
question.smartSim = { schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 1, config }   ← public envelope
question.answer   = { scoring: "proportional" | "allOrNothing", checks: Check[] }                  ← private, never delivered
Check = { id, label, weight, kind, ...kind-specific fields }
answer (student)  = { kind: "smartSim", pluginKey, pluginVersion, actions: Action[], state }
```

- **Envelope** (`validateSmartSimEnvelope`): exact keys only. `schemaVersion` must be 1. The plugin must resolve exactly. The
  config passes the plugin's strict `validateConfig` and is replaced by its canonical form.
- **Private key** (`validateSmartSimAnswerKey`): 1–100 checks. Ids match `^[a-z][a-z0-9_-]{0,47}$` and are unique. Labels are
  1–120 characters. Weights are finite, `> 0` and `≤ 1000`. `kind` must be one the plugin declares, and the plugin validates
  each check against the config (device exists, kind matches, interface/port valid, value well-formed).
- **Finalization** goes through the one canonical path (`questionTypeValidation` → `validateSmartSimQuestion`). An unknown
  plugin/version, an invalid topology, no devices, no checks, a duplicate check id, a bad weight, a check on a missing device,
  a check incompatible with the device kind, or an impossible port/interface blocks finalization. Drafts stay repairable, as for
  every other type. There is no second publish gate.
- **Student projection** (`projectSmartSimForStudent`, used by the server sanitizer and by the renderer): exactly
  `{ schemaVersion, pluginKey, pluginVersion, config }` with the canonical public config. Any field outside the contract (a
  smuggled expected value) withholds the whole envelope. The private key lives under `answer`, which the sanitizer blanks for
  every type. A compound part never carries a SmartSim envelope.

## 5. Action replay and canonical state

- The student answer is a **list of semantic actions**, not a state. For `networkTopology@1`:
  `pc.setAddress | pc.setMask | pc.setGateway | pc.setDns { type, deviceId, value }` and
  `switch.command | router.command { type, deviceId, command }`.
- `normalizeSmartSimAnswer` keeps exactly `{ kind, pluginKey, pluginVersion, actions, state }`. A client `score`, `checks` or
  `passed` is dropped. The plugin normalizes each action strictly (exact keys, known device of the **right kind**, bounded
  value or command), so a router command sent to a switch, a PC value sent to a switch or a prototype key is refused at
  normalization and never applied.
- `replaySmartSimActions` starts from the plugin's **initial runtime derived from the config** and applies actions in order.
  It is pure and deterministic; inputs are never mutated. A plugin exception becomes `SMARTSIM_REPLAY_FAILED`.
- **Ingest** (`api/src/lib/draft-answers.js`, autosave and submit): `bindSmartSimAnswerToQuestion` requires a smartSim@1
  question whose valid envelope names the same plugin identity. It replays the actions and **replaces the claimed `state` with
  the replayed canonical state**. A malformed or over-bound action list is refused as a whole, with nothing partially applied.
- **Bounds** for `networkTopology@1`: ≤ 1000 actions in total, ≤ 300 CLI commands per switch/router (the `networkCli@1` bound,
  kept per device), ≤ 20 devices, ≤ 40 links.
- The canonical state is sparse and keyed by **stable device ids** (sorted), never by label or array position:
  `{ v: 1, pcs, switches, routers }`. Relabelling or reordering devices and links does not change state keys. Positions
  (`x`, `y` normalized to 0..1) are presentation data and never reach grading.

## 6. Grading

`evaluateSmartSim` (shared), via the server grader `registerBuiltIn("smartSim", …)`:

1. Validate the envelope and the private key. A broken **authority** **fails closed**: `score 0, manualReview: true` with
   issues, never an automatic zero presented as a grade.
2. Normalize the student response and replay it. A broken **response** (wrong identity, malformed or over-bound actions)
   scores **0** with no manual review: the student's answer is wrong, not the question.
3. Evaluate every check on the **replayed** state. Each check fact is
   `{ id, label, kind, expected, actual, passed, weight, points, maxPoints, evidence? }`.
4. `proportional`: `marks × passedWeight / totalWeight`. `allOrNothing`: full marks only when every check passes.

Forgery scenarios covered by tests: a perfect claimed state with `actions: []` binds to the **initial** state and earns 0;
checks, score and passed flags smuggled into the response are ignored; a client state disagreeing with the actions is replaced.

**Teacher review** (`api/src/functions/assignment-review.js`): the server recomputes the evaluation with `withDetails` and
returns per-question `smartSimReview` with the check facts (✓/✗, points), the replayed device states and the per-device command
transcripts (`reviewDetails`, outputs capped). The review UI renders these as text. The student-facing endpoints return only
the existing aggregates.

## 7. Plugin versioning

`(pluginKey, pluginVersion)` is immutable once published. New behaviour is a new version registered alongside the old one. A
v1 question is replayed and graded by v1 forever, and a test proves that registering a v2 never changes v1 results. The
`smartSim` question type version (1) and the envelope `schemaVersion` (1) are separate axes, and both are exact.

## 8. Network Topology v1 (`src/networkTopologyModel.ts`)

- **Devices**: `router` (ports `g0/0`–`g0/3`), `switch` (the `networkCli@1` ports `f0/1`–`f0/24`, `g0/1`–`g0/2`), `pc` (`eth0`).
  Ids match `^[a-z][a-z0-9_-]{0,31}$`, are unique, and prototype names are refused. Labels are ≤ 24 characters with no control
  characters. Positions are finite and inside 0..1. An optional `initial` holds a PC's address/mask/gateway/DNS or a
  switch/router hostname.
- **Links**: unique ids, two endpoints on known devices and valid ports for their kind, no self-link, and no port used by two
  links.
- **Errors** are precise `NETTOPO_*` codes (`_DEVICE_ID_DUPLICATE`, `_DEVICE_KIND_UNSUPPORTED`, `_LINK_DEVICE_UNKNOWN`,
  `_LINK_PORT_INVALID`, `_PORT_IN_USE`, `_TOO_MANY_DEVICES`, `_TOO_MANY_LINKS`, `_DEVICE_POSITION_INVALID`, …).
- **One-click template** (builder only, `networkTopologyTemplates.ts`): "راوتر + سويتشان + 4 حواسيب". R1 `g0/0` ↔ SW1 `g0/1`,
  R1 `g0/1` ↔ SW2 `g0/1`, SW1 `f0/1`/`f0/2` ↔ PC1/PC2, SW2 `f0/1`/`f0/2` ↔ PC3/PC4, stable ids, blank IP configuration.
- **Two-LAN demo preset** (authoring helper only, never engine semantics): 17 checks with total weight 23 for LAN A
  `192.168.10.0/24` (GW `.254` on R1 g0/0) and LAN B `192.168.20.0/24` (GW `.254` on R1 g0/1), including PC1↔PC3 and PC2↔PC4
  reachability.

## 9. Switch-engine reuse

Each switch device owns its own `networkCli@1` session (`createSession` / `executeCommand` / `normalizeDeviceState`), with no
fork and no change to the engine. Golden pins in `api/tests/smartsim-trusted-20a.test.js` freeze the canonical serialization,
the prompts/statuses, the `show` command output (SHA-256 of a fixed transcript) and the per-check ids of `networkCli@1`.
The 18C suites (engine, question, UI) are unchanged and green. The terminal DOM was extracted into
`src/networkCli/CliTerminalSurface.tsx` and reused by both hosts; `NetworkCliTerminal` is now a thin wrapper with identical
output (18C UI suite 19/19).

## 10. Router CLI v1 (`src/routerCliEngine.ts`)

A small, deterministic, educational router:

- Modes `Router>` → `enable` → `#` → `configure terminal` → `(config)#` → `interface g0/0` → `(config-if)#`, plus `exit`, `end`
  and `disable`.
- `hostname`, `interface` (`g0/0`–`g0/3`, long and short names), `ip address A.B.C.D M.M.M.M`, `no ip address`, `shutdown`,
  `no shutdown`, `show running-config`, `show ip interface brief`, `show ip route` (connected `C` and local `L` routes),
  `do show …` in configuration modes, and `?` (the current mode's commands).
- Interfaces are **administratively down by default**, as on real hardware. A network/broadcast address or a malformed
  address/mask is refused. A subnet overlapping another interface is refused with `% <net> overlaps with GigabitEthernetX`.
- Refusals never change state. Deferred commands (static/dynamic routing, DHCP, ACL, NAT, sub-interfaces/encapsulation,
  VLAN/switchport commands, write/copy, ping/traceroute/telnet/ssh, reload/erase/debug) are refused with a clear Arabic
  explanation. Input is bounded (200 characters, 24 tokens); shell metacharacters are inert text.
- Protocol status uses the **link context**: an interface is `up/up` only when it is `no shutdown` **and** its cable is
  operational (the far end is not administratively down).

## 11. Connectivity (`src/networkConnectivity.ts`) — one algorithm

`canReach(sourceId, destinationId, config, state)` and `pingAddress(...)`, both pure:

1. **Physical**: a link is operational when both ends are administratively up (switch port not `shutdown`, router interface
   `no shutdown`; a PC NIC is always up). A missing cable means `SOURCE_NOT_CONNECTED`.
2. **Layer 2**: a BFS over switches visits each `(switch, VLAN)` once. Access ports carry their access VLAN; 802.1Q trunks
   carry tagged VLANs and the native VLAN untagged. Different access VLANs are isolated.
3. **Layer 3**: same subnet means direct delivery on the segment. Otherwise the PC needs a default gateway inside its own subnet
   that is an operational router interface on its segment. The router forwards using its **connected** routes only (v1).
4. **Both legs**: the reply path must also succeed (the destination needs a correct gateway back).
5. A structured result: success is exactly `{ reachable: true, reason: "REACHABLE", path }`. A failure carries one of
   `SOURCE_NOT_CONFIGURED`, `SOURCE_LINK_DOWN`, `NO_DEFAULT_GATEWAY`, `GATEWAY_NOT_IN_LOCAL_SUBNET`, `GATEWAY_UNREACHABLE`,
   `NO_ROUTE_TO_DESTINATION`, `DESTINATION_UNREACHABLE`, `ADDRESS_CONFLICT`, … with the leg (`forward`/`return`) and the path.

The student's **simulated ping** and the server's **`reachability` check** call the same function. The ping is feedback only:
it is never stored as an action and never scored.

**Check kinds** (`NETWORK_CHECK_KINDS`): `pc.address|mask|gateway|dns`; `switch.hostname|vlanExists|vlanName|portMode|
accessVlan|nativeVlan|interfaceEnabled|ipAddress|subnetMask`; `router.hostname|ipAddress|subnetMask|interfaceEnabled`;
`reachability` (PC → PC or router, evidence = reason, path, leg).

## 12. User experience

- **Student / teacher preview** (`NetworkTopologyWorkspace`, lazy): an SVG diagram (original artwork, down links dashed, port
  labels) next to an accessible device list. Selecting a device shows a heading, then a PC configuration panel (IPv4, mask,
  gateway, DNS, inline validation, simulated ping) or that device's own terminal (switch → `networkCli@1`, router → router CLI
  v1). Each device keeps its own session and history; switching devices never loses work. The existing autosave/restore/submit
  pipeline persists the action list, and resume replays it. "Reset all" and "reset this device" need an explicit confirmation.
- **Authoring** (`NetworkTopologyEditor`, lazy): the template button, add router/switch/PC, structured device rows (label,
  initial PC values/hostname), keyboard move buttons as an alternative to dragging, links with port selectors, typed checks
  with weights and Arabic labels, the scoring mode, the two-LAN preset (replacing existing checks needs confirmation), a live
  preview and inline validation from the same contract the server uses. A device referenced by checks cannot be deleted
  silently: the editor names the checks.
- **Review** (`SmartSimReviewView` + `NetworkTopologyReview`, lazy): the total, ✓/✗ per check with points and evidence, the
  topology, each device's final configuration and command history as text.
- **Accessibility**: the device list is the keyboard path (buttons with `aria-pressed`), the selected-device heading is
  `aria-live`, terminal inputs are labelled, errors use `role="alert"`, technical strings are LTR inside the RTL UI, and focus
  is visible.
- **Mobile**: one column below 1024 px (diagram → selected device → panel/terminal). The SVG scales with its container and tables
  scroll locally, so there is no page-wide horizontal overflow.

## 13. Bundle

Everything heavy is lazy: the workspace, editor, review, diagram, router engine, connectivity engine and plugin load only when a
smartSim question is rendered, edited or reviewed. The initial JS graph went from **119.1 KB** to **119.4 KB** gzip (17 files,
budget 125 KB unchanged). The only additions to the initial graph are the catalog row, defaults, presentation strings and the
lazy registrations. The bundle guard has a new check (#14) that fails if any SmartSim/topology signature enters the initial
graph.

## 14. Shared-finalization parity

All new pure modules are in `SHARED_ENTRIES` (`scripts/build-shared-finalization.mjs`) and compiled to
`api/src/lib/shared-finalization/`. The drift test fails on a hand edit, and a parity test runs the same scenarios through the
TypeScript and the CommonJS copies.

## 15. Limitations (v1, explicit)

- Routers know only **connected** routes. There is no static or dynamic routing, so multi-router paths are unreachable by
  design in v1.
- No DHCP, DNS resolution, ACL, NAT/PAT, sub-interfaces/Router-on-a-Stick, STP, VTP, EtherChannel, port security, IPv6, ARP
  tables or timing. The PC DNS field is configuration only.
- Switches are the `networkCli@1` managed switch (VLANs, access/trunk, SVI). A switch SVI address is not a routed endpoint in v1.
- The AI question author does not generate smartSim questions in this phase.
- The simulated ping is a reachability verdict, not a packet animation.

## 16. Deferred network capabilities and roadmap (document only — not implemented)

- **20C — Network advanced layer**: static routing, Router-on-a-Stick (sub-interfaces + 802.1Q encapsulation), richer trunking
  diagnostics between switches, packet/path diagnostics (traceroute-like evidence).
- **20D**: DHCP (server pools on the router, client PCs), ACLs, NAT/PAT.
- **20E**: OSPF; EIGRP/RIP if the curriculum requires them; multi-router/WAN/Metro topologies.

Each item is a **new plugin version** (`networkTopology@2`, …). v1 questions keep v1 semantics forever.

### Future SmartSim plugins (same framework, not implemented)

- **Chemistry equation balancing**: config = an unbalanced equation; actions = set coefficient; checks = element balance per
  side, minimal integers.
- **Function graph**: config = axes and a target family; actions = place/move points, set parameters; checks = intercepts, slope,
  vertex within tolerance.
- **Geometry workspace**: constructions as actions; checks = incidence, lengths and angles within tolerance.
- **Physics motion**: parameters as actions; checks = derived quantities on a deterministic time grid.

Each needs only a plugin module (config validator, initial runtime, action normalizer/applier, canonical state, typed checks),
a `SHARED_ENTRIES` entry, one `registerSmartSimPlugin` line and a UI registry entry with literal lazy imports. The core, the
storage contract, ingest, grading and review stay unchanged. A domain-neutral test plugin in the API suite proves this today.

## 17. Mutation campaign

One mutant at a time (exact anchored replacements), the named suites run, every touched file restored byte-for-byte (SHA-256
verified in a `finally`), `git status` clean afterwards. A mutant counts as KILLED only when a behavioural test fails; drift and
parity tests never count. `s` variants mutate the committed server copy (`api/src/lib/shared-finalization/`) and are judged by
the API suites.

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| M1 / M1s | unknown plugin silently accepted (falls back to a registered plugin) | KILLED / KILLED¹ | 20A-C2 envelope fail-closed / 20B-S1b unknown key with a valid topology |
| M2 / M2s | unsupported plugin version falls back to the latest | KILLED / KILLED | 20A-C1 exact registry / 20A-S1 fail closed |
| M3 / M3g / M3s | client state trusted (ingest binding / grading / server grading) | KILLED ×3 | 20A-C4 bind, 20A-C5 scoring, 20B-S1 forged state = 0 |
| M4 / M4b | sanitizer skips the strict projection / copies private checks to the student | KILLED / KILLED | 20B-S2 student payload |
| M5 / M5s | duplicate check ids accepted | KILLED / KILLED | 20A-C3 / 20A-S1 |
| M6 / M6s | invalid (≤ 0, > 1000, NaN) weight accepted | KILLED / KILLED¹ | 20A-C3 / 20B-S1b weights |
| M7 / M7s | router interface shutdown ignored by reachability | KILLED / KILLED | 20B-T3 / 20B-S1 partial 15 / 23 |
| M8 / M8s | a wrong PC gateway still routes | KILLED / KILLED¹ | 20B-T3 / 20B-S1b foreign gateway |
| M9 / M9s | a broken (shut) physical link stays operational | KILLED / KILLED¹ | 20B-T3 physical layer / 20B-S1b shut switch port |
| M10 / M10s | SW1 commands also change SW2 | KILLED / KILLED | 20B-T4 per-device sessions / 20B-S1 |
| M11 / M11s | router commands accepted on a switch | KILLED / KILLED | 20B-T4 strict actions / 20B-S1 ingest refusal |
| M12 / M12s | networkCli@1 behaviour changed (interface prompt) | KILLED / KILLED | networkCli engine suite / 20A-S5 golden pins |
| M13 / M13c | simulation@1 gains auto-grade authority (grader / catalog) | KILLED / KILLED | 20A-S4 pin / 16B-A S1 + 20AB identity |
| M14 / M14s | proportional scoring counts checks instead of weights | KILLED / KILLED | 20A-C5 / 20B-S1 |
| M15 | smartSim answer kept inside a compound part | KILLED | 20A-S2 |
| M16 | ingest stores the raw client answer | KILLED | 20B-S3 real handlers, 20A-S2 |
| M17 | router accepts an overlapping subnet | KILLED | 20B-T2 refusals |
| M18 | router interfaces up by default | KILLED | 20B-T2 show output, 20B-T3 |
| M19 | access-VLAN isolation ignored | KILLED | 20B-T3 VLAN membership |
| M20 | per-device command cap dropped | KILLED | 20B-T4 caps |
| M21 | prototype-sensitive keys pass the bounded-JSON guard | KILLED | 20A-C1 guard |
| M22 | a port linked twice accepted | KILLED | 20B-T1 topology refusals |
| M23 | total action bound dropped | KILLED | 20A-C4 normalize / bind |
| M24 | duplicate plugin registration silently replaces | KILLED | 20A-C1 |
| M25 | server answered predicate counts an empty action list | KILLED | 20A-S2 |
| M26 | reset-all without confirmation | KILLED | UI workspace reset |
| M27 | simulated ping stored as an action | KILLED | UI workspace ping |
| M28 | a device referenced by checks deleted silently | KILLED | UI authoring |
| M29 | UI registry resolves any version to v1 | KILLED¹ | UI defense-in-depth test |
| M30 | renderer reads the raw envelope instead of the projection | KILLED¹ | UI defense-in-depth test |

**45 mutants, 45 killed, 0 timeouts.** ¹ These six survived the first run. The TypeScript mutants were already killed, but the
API suite did not exercise those server-copy paths, and the UI layers were masked by the projection that runs before them.
Strengthening tests were added (20B-S1b in `api/tests/network-topology-20b.test.js`, plus the UI defense-in-depth case in
`src/questionTypes/smartSim.20ab.test.tsx`). Those six mutants were then re-run and killed. These added tests are reported as
strengthening tests written after the implementation, **not** as fail-first evidence.
