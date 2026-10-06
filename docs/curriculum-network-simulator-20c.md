# Phase 20C — Curriculum Network Simulator Core (`networkTopology@2`)

Status: implemented on `feature/20c-curriculum-network-simulator-core` (baseline `686afbc`, the merge of #266). Owner review
required before merge.

## 1. Purpose

`networkTopology@1` (Phase 20B) proved the trusted SmartSim plugin model with routers, switches and PCs. Phase 20C delivers the
**curriculum network simulator**: the device set, Desktop applications, CLI coverage and operational behaviour a networking
curriculum (VLANs, trunks, Router-on-a-Stick, DHCP, VTP, Port Security, passwords, wireless, basic services) actually examines —
as a **new exact identity**, `networkTopology@2`. Nothing published changes meaning.

| Device | Student surface |
|---|---|
| Router | CLI v2 (interfaces, 802.1Q sub-interfaces, Router-on-a-Stick, DHCP pools / exclusions, passwords, show commands) |
| Switch | CLI v2 (VLANs, access / trunk / native / allowed lists, SVIs, VTP, Port Security, passwords, show commands) |
| PC / Laptop | Desktop: IP Configuration (Static / DHCP), Command Prompt, Wireless (laptop / wireless adapter), Network Status, Browser |
| Server | Desktop + Services (DHCP pool, DNS records, HTTP page) |
| Access Point | Configuration form (radio, SSID, Open / WPA2, passphrase, management address) |

## 2. Identity and exact versioning

* `networkTopology@2` is registered **last** in `src/trustedSimPlugins.ts`; the production set is now `networkTopology@1`,
  `physicsFreeFall@1`, `functionStudy2d@1`, `networkTopology@2`. The question-type catalog stays at **24** (still `smartSim@1`).
* Resolution is exact. `networkTopology@3`, `"2"`, `NetworkTopology@2`, `2.5` resolve to nothing; there is **no** latest-version
  fallback, no `@2 → @1` fallback, no case-insensitive fallback, no config-version fallback. A `v: 1` configuration under
  `pluginVersion: 2` is refused (`NET2_CONFIG_VERSION_UNSUPPORTED`), never migrated.
* **Frozen** (pinned by `src/networkTopologyV1Freeze.20c.test.ts`, SHA-256 digests captured on `686afbc`): `networkTopology@1`
  (model, connectivity, plugin, UIs, templates), `networkCli@1`, router CLI v1, `CliTerminalSurface`, the 20A.1 core,
  `physicsFreeFall@1`, `functionStudy2d@1`, `simulation@1`. v2 imports only *pure helpers* from the v1 engines (IPv4 grammar,
  port inventories, interface names) and never edits them.
* The UI registry maps `networkTopology@2` to three literal lazy imports (`networkTopology2/Net2Workspace`, `Net2Editor`,
  `Net2Review`); the v1 entry is unchanged.

## 3. Architecture

```
exam JSON (data only) ── smartSim { schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 2, config }   answer { scoring, checks } (private)
        │
SmartSim Core (unchanged) — envelope authority · exact registry · replay · presentation-prefix guard · weighted scoring
        │
net2Plugin ── actions (12) · per-device limits · runtime / replay · canonical state · private checks (62 kinds) · descriptor
   ├─ net2Model ······ strict v2 configuration, device states, deterministic MACs, bounds
   ├─ net2SwitchCli ·· switch CLI v2 (closed grammar, sessions over a sparse canonical state, show commands)
   ├─ net2RouterCli ·· router CLI v2 (sub-interfaces, DHCP, show commands)
   ├─ net2Network ···· operational engine: VTP · wireless · DHCP / APIPA · L2 flooding · Port Security · ARP / MAC · L3 · DNS / HTTP
   ├─ net2Host ······· Command Prompt grammar and renderers (ipconfig, ping, tracert, arp -a, nslookup)
   └─ net2Common ····· IPv4 / MAC / hashing / password display primitives
        │
lazy UI: networkTopology2/Net2Workspace (student) · Net2Editor (teacher) · Net2Review (teacher review) · Net2Panels (device surfaces)
```

All seven pure modules are `SHARED_ENTRIES` of `scripts/build-shared-finalization.mjs`; the generated CommonJS copies in
`api/src/lib/shared-finalization/` are never edited by hand (drift test). Client / server parity is tested on validation, full
replay JSON (state + transcripts) and reachability. The engines contain no `eval`, `Function`, `fetch`, dynamic `import`,
`Math.random`, `Date.now`, timers or `process.` access (source-scan test on the generated server copies).

## 4. State separation

| Layer | Owner | Where | Graded? |
|---|---|---|---|
| Topology (devices, kinds, adapters, links, ports, positions, labels, initial states) | teacher | `config` | — (public, immutable for the student) |
| Academic configuration (CLI device states, host adapter modes / static values, Wi-Fi intents, AP settings, server services) | student actions | `state.devices` | yes |
| Operational state (effective adapters, leases, bindings, associations, VTP databases, Port Security sightings, ARP, MAC tables) | **derived by the engine** | `state.ops` | yes |
| Presentation (selection, open app, drafts, CLI scroll) | view | React state | never |

The server **re-derives** the whole state by replay; any claimed state (forged leases, associations, VTP revisions, Port Security
records, hostnames) is discarded on ingest and never read by the grader.

## 5. The immutable student topology

There is no student action that adds, deletes, moves, re-types or cables a device, changes adapters or replaces the configuration:
the plugin's action vocabulary simply does not contain one (`device.*`, `link.*`, `topology.replace`, `config.replace`,
`host.setAdapters`, `state.patch`, … are refused by the normalizer → `SMARTSIM_ACTION_INVALID`; presentation gestures →
`SMARTSIM_ACTION_PRESENTATION_ONLY`). Hiding buttons is not the control — the server contract is. The student diagram has no drag
handlers and no `draggable` element; the teacher editor is the only place with structural controls.

## 6. Semantic actions (exactly `descriptor.actionKinds`)

| Action | Keys | Notes |
|---|---|---|
| `host.setMode` | deviceId, adapter, mode | `static` / `dhcp`; adapter must exist on the device |
| `host.setStatic` | deviceId, adapter, address, mask, gateway, dns | address + mask together and usable; `""` clears |
| `host.command` | deviceId, command | Command Prompt line (≤ 512 chars accepted, the grammar refuses > 120) |
| `host.wifiConnect` | deviceId, ssid, passphrase | wireless adapter required; passphrase `""` or 8–63 |
| `host.wifiDisconnect` | deviceId | |
| `host.browse` | deviceId, url | `http://<dns-name or IPv4>[/path]` only |
| `switch.command` / `router.command` | deviceId, command | CLI line on that device kind only |
| `ap.set` | deviceId, field, value | enabled · ssid · security (`open`/`wpa2`) · passphrase · address · mask · gateway |
| `server.setDhcp` | deviceId, enabled, pool {defaultRouter, dns, start, mask, max ≤ 256} | server only |
| `server.setDns` | deviceId, enabled, records [{name, address}] ≤ 16 | lowercase DNS names |
| `server.setHttp` | deviceId, enabled, title ≤ 60, body ≤ 500 | plain text: `<` and `>` refused |

Bounds (`validateNet2Actions`): ≤ 1000 actions; ≤ 300 CLI commands per switch / router (`NET2_DEVICE_COMMANDS_TOO_MANY`);
≤ 200 Command Prompt + Browser actions per host (`NET2_HOST_COMMANDS_TOO_MANY`); ≤ 50 wireless actions per host
(`NET2_WIFI_ACTIONS_TOO_MANY`). A contract test pins `NET2_ACTION_KINDS` ≡ `descriptor.actionKinds` with one accepted example per
kind and refusals for undeclared kinds.

## 7. Configuration (`net2Model`)

`{ v: 2, devices: [{ id, kind, label, x, y, adapters?, initial? }], links: [{ id, a: { deviceId, port }, b: { deviceId, port } }] }`.
Six kinds; ids `^[A-Za-z][A-Za-z0-9_-]{0,31}$` (never `__proto__` / `constructor` / `prototype`); labels ≤ 40, no control
characters; positions in `[0, 1]`. Host adapters: PC `[ethernet]`, laptop `[wireless]`, server `[ethernet]` by default, or any
non-empty subset of `ethernet`, `wireless`; adapters on a router / switch / AP are refused. Ports: router `g0/0–g0/3`, switch
`f0/1–f0/24`, `g0/1–g0/2`, host `eth0` (Ethernet only), AP `eth0`. A port is used at most once; self links are refused.
≤ 30 devices, ≤ 60 links, ≤ 48 Port Security ports in initial states. Initial states are validated by the same engines the
student uses (switch / router normalizers, strict host / AP / server shapes). MACs are derived from `(deviceId, interface)`
(`02xx.xxxx.xxxx`; sub-interfaces share their parent's).

## 8. CLI v2

**Switch.** `enable`, `configure terminal`, `hostname`, `vlan` / `name` / `no vlan`, `interface` (`f0/x`, `g0/x`, `vlan N`),
`switchport mode access|trunk`, `switchport access vlan`, `switchport trunk native vlan`, `switchport trunk allowed vlan
<list>|add|remove|all|none`, `shutdown` / `no shutdown`, `ip address` / `no ip address` (SVIs), `ip default-gateway`,
`vtp domain|mode server|client|password|version 1|2`, `switchport port-security [maximum <1-8> | mac-address sticky |
mac-address <H.H.H> | violation shutdown|restrict|protect]`, `no switchport port-security`, `enable secret|password`,
`service password-encryption`, `line console 0`, `line vty 0 4`, `password`, `login`; show: `running-config`, `vlan brief`,
`interfaces trunk`, `ip interface brief`, `interfaces [<if>] switchport`, `mac address-table`, `port-security [interface <if>]`,
`vtp status`; `do show …` in configuration modes. A VTP server bumps its configuration revision on every VLAN database change; a
domain change resets it; a client refuses local VLAN changes. Port Security requires `switchport mode access`.

**Router.** Interfaces `g0/x` (administratively down until `no shutdown`) and sub-interfaces `g0/x.N` (1–4094) with
`encapsulation dot1Q <vlan> [native]` (one VLAN id per parent, one native sub-interface); an address on a sub-interface requires the
encapsulation first (the IOS rule); overlapping networks are refused. `ip dhcp excluded-address <low> [<high>]`, `ip dhcp pool`,
`network`, `default-router`, `dns-server`; passwords and lines as on the switch; show: `running-config`, `ip interface brief`
(incl. sub-interfaces), `ip route` (C + L routes, “Gateway of last resort is not set”), `ip dhcp pool`, `ip dhcp binding`.
Routing protocols, static routes, NAT, ACLs and `ip helper-address` are refused as out of scope.

Both grammars are closed: unknown / shell-like input (`;`, `&&`, `$(…)`, pipes), over-long lines and malformed values never change
state. As in IOS, a global-configuration command typed in a configuration sub-mode runs in global configuration mode.

## 9. Hosts: Desktop and Command Prompt

One canonical host state feeds IP Configuration, Command Prompt and Network Status: the effective adapter view in
`state.ops.adapters["<id>/<adapter>"]` (`static | dhcp | apipa | released | disconnected`) is exactly what `ipconfig` prints and what
connectivity uses. Command Prompt grammar: `ipconfig`, `ipconfig /all | /release | /renew`, `ping <IPv4 | name>`,
`tracert <IPv4 | name>`, `arp -a`, `nslookup <name>`, `help`. Anything else → `Invalid Command.`; characters outside
`[A-Za-z0-9 ./?-]` are refused before parsing; nothing executes, nothing touches a real network, socket, resolver or OS tool.

## 10. Operational engine (`net2Network`)

Reconcile runs after every action that changes academic state and after student traffic that changed Port Security facts. It is
bounded (≤ 6 rounds, stops when stable): VTP → wireless association → addressing (static / DHCP / APIPA) → Port Security settle.

* **VTP.** A client with a non-empty domain adopts, over *operational trunks* (both ends `mode trunk`, link up), the database of the
  best reachable server with the same domain, password and version (highest revision, tie → lowest id) when that revision is ≥ its
  own; otherwise it keeps its own database (`source: null`). Clients relay; switches of another context do not. A switch forwards
  VLAN v only when v is in its **effective** database.
* **Wireless.** A host's association intent associates with the first enabled AP (by id) advertising the SSID; WPA2 needs a stored
  passphrase of ≥ 8 characters and the exact same passphrase (`auth-failed` otherwise; `no-ssid` when nothing advertises it).
* **L2 forwarding.** Access / dynamic ingress accepts untagged frames only (VLAN = access VLAN, Port Security checked); trunk
  ingress uses `tag ?? native` and requires the VLAN in the allowed list; the VLAN must exist. Egress: access ports of that VLAN
  (untagged), trunks allowing it (tagged unless native). A native-VLAN mismatch leaks untagged traffic into the peer's native VLAN
  (modelled, not hidden). Routers accept untagged frames on the native sub-interface (else the physical interface) and tagged
  frames on the matching sub-interface. The AP is a transparent bridge (uplink ↔ associated clients ↔ management address). Loops
  terminate (each switch / VLAN is visited once); spanning tree is not modelled.
* **DHCP.** Every DHCP client (sorted by device id and adapter) performs a real flood (DISCOVER); the first DHCP service reached —
  a router interface whose pool network contains that interface's address (longest prefix, then name), or an enabled server with a
  static address and a pool in its subnet — answers over a real unicast leg. Allocation: still-valid previous leases first
  (stickiness), then the lowest free address of the pool after exclusions, network / broadcast and every statically used address
  (router / SVI / AP / server / static host); excluded ranges are jumped over, never scanned. No answer ⇒ deterministic APIPA
  `169.254.x.y/16` from the MAC (unique by increment). `ipconfig /release` and `/renew` are replayed academic flags.
* **Port Security.** Secure addresses = static MACs + the first `(maximum − static)` MACs actually *seen* on the port (sticky ⇒
  shown in running-config). Any further MAC is a violation: `shutdown` ⇒ the port is err-disabled (link down for both ends, the
  host loses connectivity; `shutdown` + `no shutdown` clears it), `restrict` ⇒ dropped and counted, `protect` ⇒ dropped silently.
* **ARP / MAC learning.** Only resolved legs learn ARP entries (a host learns its gateway's MAC for remote destinations); MAC tables
  learn from the student's own traffic (lease negotiation is not shown in the tables); entries on down ports are flushed.
* **L3.** Same subnet ⇒ ARP; otherwise the default gateway must be in the subnet and be a router interface, which answers for any of
  its up addresses or forwards to a directly connected network (one router hop: no routing protocols or static routes in this
  curriculum scope). The reply leg must succeed. TTL = 128 (hosts) / 255 (network devices) − router hops.
* **DNS / HTTP.** `nslookup`, `ping <name>` and the Browser resolve through the host's DNS server (reachable server with DNS
  enabled and the record); the Browser then needs a reachable server with HTTP enabled (`HTTP/1.1 200 OK` + plain-text page;
  `Host Name Unresolved` / `Request Timeout` otherwise).

## 11. Private checks (62 kinds, `descriptor.checkKinds`)

Host (`mode`, `address`, `mask`, `gateway`, `dns`, `dhcpLease`, `dhcpServer`, `wifiAssociated`, `ssid`); switch (`hostname`,
`vlanExists` / `vlanName` on the VTP-effective database, `portMode`, `accessVlan`, `nativeVlan`, `allowedVlans`,
`interfaceEnabled`, `sviAddress`, `sviMask`, `vtpMode`, `vtpDomain`, `vtpVersion`, `vtpPassword`, `portSecurity`,
`portSecurityMaximum`, `portSecuritySticky`, `portSecurityViolation`, `portErrDisabled`, and the password kinds); router
(`hostname`, `ipAddress`, `subnetMask`, `interfaceEnabled`, `subinterfaceVlan`, `subinterfaceNative`, `dhcpPool`, `dhcpNetwork`,
`dhcpDefaultRouter`, `dhcpDns`, `dhcpExcluded`, passwords); AP (`enabled`, `ssid`, `security`, `passphrase`, `address`, `mask`,
`gateway`); network (`reachability` incl. isolation `value: false`, `browse`). Checks are strict (exact keys, device kind,
interface / adapter / pool / value grammar; codes `NET2_CHECK_*`). Values are evaluated on the replayed state only.
**Secret values** (passwords, VTP password, WPA2 passphrase) are masked in the evaluation facts — the teacher review shows
“matches / differs”, never the expected secret; the student projection never contains a check.

## 12. Curriculum templates (`src/networkTopology2/net2Templates.ts`)

| Id | Lab | Private key |
|---|---|---|
| `roas` | Router-on-a-Stick (VLAN 10 / 20, trunk, dot1Q) | 11 config checks + inter-VLAN reachability (weight 13) |
| `dhcp` | Router DHCP pool with exclusions / default-router / dns-server | pool facts, leases, PC1 = .11, PC1 ⇄ R1 |
| `vtp` | VTP server / client (access ports start in VLAN 30 that no database has) | domains, client mode, VLAN 30 on SW2, reachability |
| `portsec` | Port Security (sticky, maximum 1, shutdown) | the five Fa0/1 settings |
| `wireless` | WPA2 AP + laptop DHCP through the AP | AP security / passphrase, association, lease, LAP1 ⇄ PC1 |
| `capstone` | VLANs, trunks (native 99, allowed list), RoaS, DHCP, VTP, Port Security, passwords, WPA2, wireless DHCP, DNS + HTTP | 18 checks incl. `browse` |

Every template validates, its key validates, and **every template scores exactly 0 with zero actions** (no free credit, pinned);
independent solutions in the tests earn full marks.

## 13. UI

* **Student workspace** (`Net2Workspace`, lazy): the teacher's diagram (six original glyphs, ports, dashed down links, dotted Wi-Fi
  associations), a keyboard device list, and the selected device's surface: Desktop apps for hosts (IP Configuration with
  Static / DHCP radios and labelled fields, Command Prompt on the shared `CliTerminalSurface`, Wireless with an SSID list,
  Passphrase, Connect / Disconnect and a live status, Network Status, Browser; Services on servers), the CLI for switches / routers,
  the configuration form for APs. Reset (“إعادة ضبط الإجابة” → confirm) returns to the teacher's initial state. A submitted card is
  read-only (no Save / Connect / Run). Restore = replay of the stored actions (the claimed state is ignored). The view replays
  incrementally (one new command applies one action; any other edit replays in full; tested ≡ full replay).
* **Authoring** (`Net2Editor`, lazy): six “+ device” buttons, link form (device / port A ↔ device / port B, free ports only),
  drag or button positioning, labels, host adapters, the six templates (topology + private key in one step; undo restores), the
  **initial-state sandbox** (the device's real surface on throw-away actions; “اعتماد الحالة الابتدائية” stores the canonical device
  state after re-validating the whole configuration), private checks with kind-specific fields, scoring mode, preview.
* **Review** (`Net2Review`, lazy): diagram, per-device academic and operational facts (VTP, Port Security, leases, bindings,
  associations) and per-device histories (CLI, Command Prompt, Browser) as text only.
* RTL page with LTR islands for addresses, ports, MACs, URLs and terminals; every control is labelled; nothing depends on the
  pointer (device list, move buttons).

## 14. Bounds, performance, sizes

* Canonical state always satisfies the core's bounded-JSON guard (≤ 64 keys per object, depth ≤ 8, 256 KB): ≤ 64 VLANs per switch
  (also for `switchport access vlan` auto-creation), ≤ 16 SVIs per switch, ≤ 16 router sub-interfaces / 8 pools / 16 exclusions,
  ≤ 48 Port Security ports per topology, ≤ 64 MAC entries per switch, ≤ 16 ARP entries per host, ≤ 16 Port Security sightings per
  port.
* Measured (local, Node 22): capstone solution replay ≈ 50 ms; worst-case topology (30 devices, 60 links with switching loops,
  20 DHCP hosts, 1000 actions mixing pings and show commands) ≈ 0.7 s; the pathological case of 1000 state-changing commands on
  that topology ≈ 3 s (each one re-derives 20 leases over the meshed fabric). Tests bound the worst case at < 30 s and a typical
  answer at < 1 s.
* Answer sizes (actions + canonical state, server ingest): RoaS solution 4.1 KB (30 actions), DHCP 1.9 KB, wireless 1.8 KB, capstone untouched 1.7 KB, full capstone solution ≈ 11 KB (106 actions); the 1000-action worst case ≈ 94 KB, all far below the core's 256 KB bound.
* Initial JS bundle: 119.7 KB gzip (baseline 119.6 KB; +0.1 KB for the registry entry) (budget 125 KB unchanged); every v2 surface is lazy (bundle-guard signatures `net2-workspace`,
  `net2-editor`, `net2-desktop`, `net2-ap-config`, `net2-review`).

## 15. Security review (adversarial)

Reviewed adversarially during implementation (and again by an independent reviewer, see the PR):

| Area | Finding | Resolution |
|---|---|---|
| DoS — DHCP allocation | a student could exclude a whole /8 range so that the lowest-free scan iterated 65 536 candidates per client per reconcile | **fixed**: `lowestFree` jumps over excluded ranges (work bounded by exclusions + taken addresses); DoS test |
| Bounded JSON | the canonical state could exceed the core's 64-keys-per-object guard (unbounded SVIs; `switchport access vlan` auto-creating VLANs past 64; Port Security ports across switches), making autosave refusable | **fixed**: SVI cap 16, VLAN cap also on auto-create, 48 secure ports per topology (runtime and initial states), MAC ≤ 64 / ARP ≤ 16 entries; stress test asserts `checkBoundedJson` |
| Performance | worst case (30 devices, 60 links, 1000 actions) took ≈ 5 s | **fixed**: memoized interface views / cabled-port lists / link state, reconcile skipped after traffic without a Port Security consequence (identical results, pinned); incremental view replay in the UI |
| Secret leakage | password / passphrase checks reported the expected value as evaluation fact | **by design**: secret kinds mask both expected and actual (“matches / differs”); test |
| Topology mutation | — | no structural action exists; normalizer refuses `device.*`, `link.*`, `topology.replace`, … (server-side) |
| Forged state | — | ingest and grading re-derive the state by replay; claimed state never read (tests A1–A5, API S2) |
| Injection / XSS | — | closed CLI / CMD grammars (no shell semantics); server pages are plain text (`<`, `>` refused); browser URLs `http://name|IPv4` only; React renders text; no `dangerouslySetInnerHTML` |
| Prototype pollution | — | ids `^[A-Za-z][A-Za-z0-9_-]{0,31}$`, `__proto__` / `constructor` / `prototype` refused; own-property lookups |
| Real network / host | — | no `fetch`, sockets, DNS, timers, randomness, clock or process access in the engines (source scan of the server copies) |

## 16. Password model

Passwords are **configuration values**, never ExamBank authentication and never enforced as login prompts: `enable secret` (shown as
`enable secret 5 $1$…` — a deterministic one-way educational digest that never contains the value), `enable password`, console and VTY
line passwords with `login`, and `service password-encryption` (type-7 display form; the canonical state keeps the value so a private
check can compare it). Values are one token of 1–32 printable characters. Private password checks are masked in every evaluation fact.

## 17. Supported and unsupported commands

Supported: see sections 8 and 9. Explicitly refused with an educational message (never executed): `router …` (OSPF / RIP / EIGRP / BGP),
`ip route`, `ip nat …`, `access-list …`, `ip helper-address`, `spanning-tree …`, `channel-group …`, `interface range`, DTP `dynamic` modes,
VTP `transparent` / `off`, `write` / `copy` (the running configuration is what counts), `ping` / `traceroute` / `telnet` / `ssh` /
`reload` / `debug` on network devices (test from a host's Command Prompt), and on hosts anything outside the CMD grammar.

## 18. Documented simplifications (educational model, not a device emulator)

* One router hop (connected routes only); no routing protocols, static routes, NAT, ACLs, DHCP relay.
* No spanning tree (loops terminate per switch / VLAN; no storms modelled); DTP `dynamic` behaves as access.
* VTP: server and client modes only; servers never overwrite each other or a higher-revision client (no “VTP bomb”); pruning off.
* Wireless range has no geometry; association picks the first enabled AP (by id) for the SSID.
* Passwords are configuration only (no login prompts / privilege enforcement); `enable secret 5` and type-7 forms are educational
  displays.
* Port Security derives secure / violating addresses from the ordered sightings. Err-disable is **latched** (Review Fix 1): a new
  violation mode or a raised `maximum` does not recover the port; `shutdown` + `no shutdown` does (it clears violators and non-sticky
  learned addresses). Simplification: `no switchport port-security` removes the port's security record, including a latched
  err-disable.
* A reachability / browse *check* is evaluated purely (it records no sightings): an unseen MAC is admitted while a secure slot is free,
  exactly as the first live frame would be.
* The workspace does not pre-warn before an answer approaches the core's 256 KB bound; the bounds above keep realistic answers far
  below it (measured worst case ≈ 94 KB).
* Lease negotiation is not shown in MAC tables; timing (latency, lease expiry) is not simulated.

## 19. Tests and mutation campaign

* **Freeze pins** (`src/networkTopologyV1Freeze.20c.test.ts`, 7 tests): v1 templates / validation / replay / reachability / grading
  digests and file digests of every frozen v1 module, captured on `686afbc`.
* **Fail-first suites** (committed before the engines, failing on `686afbc` and on the skeleton): `src/net2Switch.20c.test.ts`,
  `src/net2Router.20c.test.ts`, `src/net2Host.20c.test.ts`, `src/net2Authority.20c.test.ts`, `api/tests/network-topology-v2-20c.test.js`,
  `src/questionTypes/networkTopology2.20c.test.tsx`.
* **New / pin suites written with the implementation:** `src/net2Bounds.20c.test.ts` (bounded JSON, DoS, worst-case performance,
  purity, incremental replay) and `src/net2Mutation.20c.test.ts` (strengthening tests added after mutation rounds 1 and 4; not
  fail-first).
* **Mutation campaign:** 165 mutants (157 before review + 8 on the Review Fix 1 code), applied one at a time with SHA-256-verified
  byte restore and a clean tree after every run; **163 KILLED, 2 EQUIVALENT, 0 SURVIVED, 0 TIMEOUT**. Every §72 category is covered (connectivity, DHCP, VTP, Port Security, host
  tools, authority / security, compatibility). Round 1 left 38 survivors (36 test gaps + the two equivalents); round 2 re-ran the 36 against the
  round-1 strengthening tests (35 killed) and round 3 killed M091 with one more test; round 4 (16 category mutants) left 5, killed by the round-4 tests.
  Equivalents: **M096** (router egress choosing the shortest prefix) — overlapping networks are refused by the CLI and the initial-state
  normalizer, so at most one connected network can contain an address; **M100** (a sub-interface ignoring its parent's admin state in
  `router2IfUp`) — `linkUp` already requires the parent port to be administratively up. Compatibility mutants (v1 plugin, networkCli@1)
  were killed by behavioural v1 tests, not only by file digests.

## 21. Future roadmap (not in 20C)

Static routes and multi-hop routing, DHCP relay (`ip helper-address`), basic ACLs, a spanning-tree view, EtherChannel basics,
IPv6 addressing, wireless range / multiple-AP roaming and a richer Browser — each as additive behaviour on `networkTopology@2`'s
engines or as a new exact version where semantics would change. Non-goals for the curriculum core: routing protocols, MPLS, HSRP,
QoS, VPN, AAA, complex NAT, packet capture, uploaded protocol plugins.

## 22. Review Fix 1 (independent review of `a7230ba`)

| Finding | Severity | Fix | Evidence |
|---|---|---|---|
| `show ip dhcp pool` enumerated excluded addresses (≈ 560 k Set insertions per command with 8 /8 pools; 300 valid commands replayed in 74.6 s) and capped the count at 70 000 | BLOCKER | counted arithmetically from clipped, merged ranges | fail-first: 59.4 s on `42c35c9`, < 5 s after; exact count 16 777 214 |
| `switch.interfaceEnabled` passed for an SVI never created | MINOR | absent SVI ⇒ “—” (fails) | fail-first test F2 |
| pool names `__proto__` / `constructor` / `prototype` accepted (silent no-op) | MINOR | refused by the CLI and by check validation | F3 |
| err-disable cleared by a new violation mode / raised maximum | MINOR | latched until shutdown / no shutdown | F4 |
| SVI shown up/up while its VLAN is missing | MINOR | down/down, the same rule connectivity uses | F5 |
| an unusable AP address / mask pair dropped silently | NOTE | stored as entered; operational only when usable | F6 |
| no engine signature in the bundle guard; `net2Common` missing from the API dynamic-code scan | NOTE | added | guard / API test |

All tests are in `src/net2ReviewFix1.20c.test.ts` (6 fail-first on `42c35c9`, 1 pin: overlapping exclusions were already merged correctly
for small pools).

## 23. Earlier pins updated (production-set / unknown-version examples)

Registering a new identity legitimately changes pins that listed the production set or used `networkTopology@2` as an example of an
*unregistered* version. The intent of each pin is preserved:

| File | Change |
|---|---|
| `api/tests/smartsim-pilots-20a2.test.js`, `api/tests/smartsim-trusted-20a.test.js`, `api/tests/trusted-smartsim-universal-20a1.test.js`, `src/trustedSim.20a.test.ts`, `src/trustedSimUniversal.20a1.test.ts`, `src/questionTypes/smartSimPilots.20a2.test.tsx` | production-set / picker lists now include `networkTopology@2` |
| `api/tests/network-topology-20b.test.js`, `api/tests/trusted-smartsim-universal-20a1.test.js`, `src/trustedSimUniversal.20a1.test.ts`, `src/questionTypes/smartSim.20ab.test.tsx` | the “unknown version” example moved from `@2` to `@3` (still unknown) |
| `src/trustedSimUniversal.20a1.test.ts` | the literal-import pin accepts digits in repository paths (`networkTopology2/`); still no dots, variables or data |
