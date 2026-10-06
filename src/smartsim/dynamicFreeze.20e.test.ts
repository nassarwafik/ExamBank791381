import { describe, it, expect } from "vitest";
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { evaluateSmartSim, projectSmartSimForStudent } from "../trustedSimPlugins";
import { replayFreeFall, normalizeFreeFallAction, FREE_FALL_ACTION_KINDS, FREE_FALL_CHECK_KINDS } from "../physicsFreeFallPlugin";
import { heightAt, velocityAt, impactTime, impactSpeed, peakHeight, bodyAt, sampleTrajectory, validateFreeFallConfig } from "../physicsFreeFallModel";
import { replayFunctionStudy, FUNCTION_STUDY_ACTION_KINDS, FUNCTION_STUDY_CHECK_KINDS } from "../functionStudyPlugin";
import { sampleFunction, validateFunctionStudyConfig } from "../functionStudyModel";
import { replayNet2, NET2_ACTION_KINDS } from "../net2Plugin";
import { validateNet2Config } from "../net2Model";
import { makeNet, reachDevices, endpointsOf, l3Of } from "../net2Network";
import { freeFallClassroomConfig, freeFallClassroomChecks } from "../physicsFreeFall/freeFallTemplates";
import { rationalCertificationConfig, rationalCertificationChecks } from "../functionStudy/functionStudyTemplates";
import { NET2_TEMPLATES } from "../networkTopology2/net2Templates";
import { compositePhysicsExam, compositeNetworkExam } from "../composite/compositeFixtures";

// Phase 20E — FREEZE PINS captured on the 20D.1 baseline 78445fd (twice, identical) BEFORE any dynamic-experience change. Animation must
// be presentation only: SmartSim action normalization / vocabularies, canonical replay states and transcripts (incl. every ping / tracert
// the network engine answers), private-check scoring (client authority AND the server grader), Composite shared-context grading,
// student sanitization and the physics / function presentation samplers stay byte-identical. Capture: CAPTURE_20E_PINS=<file>.
const require_ = createRequire(import.meta.url);
const { gradeExam } = require_("../../api/src/lib/assignment-grading.js") as { gradeExam: (e: unknown, a: unknown) => unknown };
const { sanitizeExamForStudent } = require_("../../api/src/lib/student-exam-sanitize.js") as { sanitizeExamForStudent: (e: unknown) => unknown };
const digest = (v: unknown) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 24);
type Json = Record<string, unknown>;

// ── action streams (academic answers) ──────────────────────────────────────────────────────────────────────────────────────────────
const FF = (a: Json[]) => a;
const FF_STREAMS: Record<string, Json[]> = {
  empty: [],
  perfect: FF([{ type: "measurement.set", measurementId: "impactTime", value: 2.0203 }, { type: "measurement.set", measurementId: "impactSpeed", value: 19.799 }, { type: "measurement.set", measurementId: "heightAt1s", value: 15.1 },
    { type: "measurement.set", measurementId: "velocityAt1s", value: -9.8 }, { type: "graphPoint.set", pointId: "impactPoint", t: 2.02, y: 0 }, { type: "graphPoint.set", pointId: "pointAt1s", t: 1, y: 15.1 }]),
  partial: FF([{ type: "measurement.set", measurementId: "impactTime", value: 2.5 }, { type: "measurement.set", measurementId: "heightAt1s", value: 15.1 }, { type: "graphPoint.set", pointId: "pointAt1s", t: 1, y: 3 }]),
  cleared: FF([{ type: "measurement.set", measurementId: "impactTime", value: 2.0203 }, { type: "measurement.clear", measurementId: "impactTime" }, { type: "graphPoint.set", pointId: "impactPoint", t: 2.02, y: 0 }, { type: "graphPoint.clear", pointId: "impactPoint" }]),
  presentationLeak: FF([{ type: "playback.play" }, { type: "measurement.set", measurementId: "impactTime", value: 2.02 }])
};
const FN_STREAMS: Record<string, Json[]> = {
  empty: [],
  perfect: [{ type: "domain.setExclusions", values: [-2, 1] }, { type: "intercepts.setX", points: [{ x: 2, y: 0 }] }, { type: "intercept.setY", y: 2 }, { type: "asymptotes.setVertical", values: [-2, 1] },
    { type: "asymptotes.setHorizontal", values: [0] }, { type: "extrema.set", points: [{ kind: "min", x: 0, y: 2 }, { kind: "max", x: 4, y: 0.2222 }] },
    { type: "intervals.set", intervals: [{ kind: "decreasing", from: "-inf", to: -2 }, { kind: "decreasing", from: -2, to: 0 }, { kind: "increasing", from: 0, to: 1 }, { kind: "increasing", from: 1, to: 4 }, { kind: "decreasing", from: 4, to: "+inf" }] }],
  partial: [{ type: "domain.setExclusions", values: [1] }, { type: "asymptotes.setVertical", values: [-2, 1] }],
  probeLeak: [{ type: "probe.move", x: 1.5 }]
};
const sw = (id: string, ...c: string[]) => c.map(command => ({ type: "switch.command", deviceId: id, command }));
const rt = (id: string, ...c: string[]) => c.map(command => ({ type: "router.command", deviceId: id, command }));
const CONF = ["enable", "configure terminal"];
const TRUNK = ["switchport mode trunk", "switchport trunk native vlan 99", "switchport trunk allowed vlan 10,20,50,99"];
const NET_SOLUTIONS: Record<string, Json[]> = {
  roas: [...sw("sw1", ...CONF, "vlan 10", "name STAFF", "vlan 20", "name STUDENTS", "interface f0/1", "switchport mode access", "switchport access vlan 10", "interface f0/2", "switchport mode access", "switchport access vlan 10",
    "interface f0/11", "switchport mode access", "switchport access vlan 20", "interface f0/12", "switchport mode access", "switchport access vlan 20", "interface g0/1", "switchport mode trunk", "end"),
  ...rt("r1", ...CONF, "interface g0/0", "no shutdown", "interface g0/0.10", "encapsulation dot1Q 10", "ip address 192.168.10.1 255.255.255.0", "interface g0/0.20", "encapsulation dot1Q 20", "ip address 192.168.20.1 255.255.255.0", "end")],
  dhcp: rt("r1", ...CONF, "ip dhcp excluded-address 192.168.1.1 192.168.1.10", "ip dhcp pool LAN", "network 192.168.1.0 255.255.255.0", "default-router 192.168.1.1", "dns-server 192.168.1.1", "end"),
  vtp: [...sw("sw1", ...CONF, "vtp domain SCHOOL", "vtp mode server", "vlan 30", "name LAB", "interface f0/1", "switchport mode access", "switchport access vlan 30", "interface g0/1", "switchport mode trunk", "end"),
    ...sw("sw2", ...CONF, "vtp domain SCHOOL", "vtp mode client", "interface f0/1", "switchport mode access", "switchport access vlan 30", "interface g0/1", "switchport mode trunk", "end")],
  portsec: sw("sw1", ...CONF, "interface f0/1", "switchport mode access", "switchport port-security", "switchport port-security maximum 1", "switchport port-security mac-address sticky", "switchport port-security violation shutdown", "end"),
  wireless: [{ type: "ap.set", deviceId: "ap1", field: "security", value: "wpa2" }, { type: "ap.set", deviceId: "ap1", field: "passphrase", value: "Exam2026!" }, { type: "host.wifiConnect", deviceId: "lap1", ssid: "SCHOOL-WIFI", passphrase: "Exam2026!" }],
  capstone: [
    ...sw("sw1", ...CONF, "hostname SW1", "enable secret Class2026", "vtp domain SCHOOL", "vtp mode server", "vtp password VtpPw", "vtp version 2", "vlan 10", "name STAFF", "vlan 20", "name STUDENTS", "vlan 50", "name SERVERS", "vlan 99", "name MGMT",
      "interface g0/1", ...TRUNK, "interface g0/2", ...TRUNK, "interface f0/1", "switchport mode access", "switchport access vlan 10", "switchport port-security", "switchport port-security mac-address sticky", "switchport port-security violation shutdown",
      "interface f0/2", "switchport mode access", "switchport access vlan 20", "end"),
    ...sw("sw2", ...CONF, "hostname SW2", "enable secret Class2026", "vtp domain SCHOOL", "vtp mode client", "vtp password VtpPw", "vtp version 2", "interface g0/1", ...TRUNK, "interface f0/1", "switchport mode access", "switchport access vlan 20",
      "interface f0/5", "switchport mode access", "switchport access vlan 50", "end"),
    ...rt("r1", ...CONF, "hostname R1", "enable secret Class2026", "interface g0/0", "no shutdown", "interface g0/0.10", "encapsulation dot1Q 10", "ip address 192.168.10.1 255.255.255.0", "interface g0/0.20", "encapsulation dot1Q 20", "ip address 192.168.20.1 255.255.255.0",
      "interface g0/0.50", "encapsulation dot1Q 50", "ip address 192.168.50.1 255.255.255.0", "interface g0/0.99", "encapsulation dot1Q 99 native", "ip address 192.168.99.1 255.255.255.0", "exit",
      "ip dhcp excluded-address 192.168.10.1 192.168.10.10", "ip dhcp excluded-address 192.168.20.1 192.168.20.10", "ip dhcp pool STAFF", "network 192.168.10.0 255.255.255.0", "default-router 192.168.10.1", "dns-server 192.168.50.10",
      "ip dhcp pool STUDENTS", "network 192.168.20.0 255.255.255.0", "default-router 192.168.20.1", "dns-server 192.168.50.10", "end"),
    { type: "ap.set", deviceId: "ap1", field: "security", value: "wpa2" }, { type: "ap.set", deviceId: "ap1", field: "passphrase", value: "Exam2026!" }, { type: "host.wifiConnect", deviceId: "lap1", ssid: "SCHOOL-WIFI", passphrase: "Exam2026!" },
    { type: "host.browse", deviceId: "lap1", url: "http://server.school.local" }]
};
const HOST_KINDS = new Set(["pc", "laptop", "server"]);

/** For one template: the solution, then every host pings + traces every known address (before and after the solution). */
function netPins(id: string) {
  const t = NET2_TEMPLATES.find(x => x.id === id)!;
  const v = validateNet2Config(t.config());
  if (!v.ok) throw new Error("template " + id);
  const cfg = v.config;
  const hosts = cfg.devices.filter(d => HOST_KINDS.has(d.kind)).map(d => d.id);
  const addrs = (state: { devices: Json; ops: Json }) => {
    const net = makeNet(cfg, state.devices as never, state.ops as never);
    return [...new Set(cfg.devices.flatMap(d => endpointsOf(net, d.id).map(ep => l3Of(net, ep)?.ip).filter((x): x is string => !!x)))].sort();
  };
  const probes = (state: { devices: Json; ops: Json }) => hosts.flatMap(h => addrs(state).flatMap(a => [{ type: "host.command", deviceId: h, command: "ping " + a }, { type: "host.command", deviceId: h, command: "tracert " + a }]));
  const r0 = replayNet2(cfg, []);
  if (!r0.ok) throw new Error("initial " + id);
  const before = probes(r0.state as never).slice(0, 60);
  const solved = replayNet2(cfg, NET_SOLUTIONS[id]);
  if (!solved.ok) throw new Error("solution " + id);
  const after = probes(solved.state as never).slice(0, 120);
  const stream = [...before, ...NET_SOLUTIONS[id], ...after];
  const full = replayNet2(cfg, stream);
  if (!full.ok) throw new Error("stream " + id + " " + full.code);
  const net = makeNet(cfg, full.state.devices as never, full.state.ops as never);
  const reach = cfg.devices.flatMap(a => cfg.devices.filter(b => b.id !== a.id).map(b => [a.id, b.id, reachDevices(net, a.id, b.id)]));
  const q = { schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 2, config: cfg };
  const grade = (actions: unknown[]) => evaluateSmartSim({ envelope: q, answerKey: { scoring: "proportional", checks: t.checks() }, response: { kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 2, actions, state: {} }, maxMarks: 10 }, { withDetails: true });
  return {
    streamLength: stream.length,
    state: digest(full.state), transcripts: digest(full.transcripts), reach: digest(reach),
    gradeEmpty: digest(grade([])), gradeSolution: digest(grade(NET_SOLUTIONS[id])), gradeStream: digest(grade(stream))
  };
}

function physicsPins() {
  const v = validateFreeFallConfig(freeFallClassroomConfig());
  if (!v.ok) throw new Error("ff config");
  const cfg = v.config, m = cfg.model;
  const env = { schemaVersion: 1, pluginKey: "physicsFreeFall", pluginVersion: 1, config: cfg };
  const grade = (actions: unknown[]) => evaluateSmartSim({ envelope: env, answerKey: { scoring: "proportional", checks: freeFallClassroomChecks() }, response: { kind: "smartSim", pluginKey: "physicsFreeFall", pluginVersion: 1, actions, state: {} }, maxMarks: 12 }, { withDetails: true });
  const models = [m, { initialHeight: 30, initialVelocity: 10, gravity: 10 }, { initialHeight: 0, initialVelocity: 15, gravity: 9.8 }, { initialHeight: 100, initialVelocity: -5, gravity: 1.62 }];
  const formulas = models.map(mm => ({ it: impactTime(mm), is: impactSpeed(mm), peak: peakHeight(mm), y: [0, 0.5, 1, 1.5, 2].map(t => heightAt(mm, t)), v: [0, 0.5, 1, 1.5, 2].map(t => velocityAt(mm, t)),
    body: [0, 1, impactTime(mm), impactTime(mm) + 1].map(t => bodyAt(mm, t)), samples: digest(sampleTrajectory(mm, 600, 160)) }));
  return {
    kinds: [FREE_FALL_ACTION_KINDS, FREE_FALL_CHECK_KINDS],
    normalize: Object.fromEntries(["measurement.set", "graphPoint.set", "playback.play", "seek", "speed.set", "vector.toggle"].map(type => [type, normalizeFreeFallAction({ type, measurementId: "impactTime", pointId: "impactPoint", value: 1, t: 1, y: 1 }, cfg)])),
    normalizeExact: [{ type: "measurement.set", measurementId: "impactTime", value: 2.02 }, { type: "measurement.clear", measurementId: "impactTime" }, { type: "graphPoint.set", pointId: "impactPoint", t: 2.02, y: 0 }, { type: "graphPoint.clear", pointId: "impactPoint" },
      { type: "playback.play" }, { type: "playback.seek", time: 1 }, { type: "playback.rate", rate: 2 }, { type: "vector.toggle", vector: "velocity" }].map(a => normalizeFreeFallAction(a, cfg)),
    replay: Object.fromEntries(Object.entries(FF_STREAMS).map(([k, s]) => [k, replayFreeFall(cfg, s)])),
    grades: Object.fromEntries(Object.entries(FF_STREAMS).map(([k, s]) => [k, digest(grade(s))])),
    formulas: digest(formulas)
  };
}
function functionPins() {
  const v = validateFunctionStudyConfig(rationalCertificationConfig());
  if (!v.ok) throw new Error("fn config");
  const cfg = v.config;
  const env = { schemaVersion: 1, pluginKey: "functionStudy2d", pluginVersion: 1, config: cfg };
  const grade = (actions: unknown[]) => evaluateSmartSim({ envelope: env, answerKey: { scoring: "proportional", checks: rationalCertificationChecks() }, response: { kind: "smartSim", pluginKey: "functionStudy2d", pluginVersion: 1, actions, state: {} }, maxMarks: 13 }, { withDetails: true });
  return {
    kinds: [FUNCTION_STUDY_ACTION_KINDS, FUNCTION_STUDY_CHECK_KINDS],
    replay: Object.fromEntries(Object.entries(FN_STREAMS).map(([k, s]) => [k, replayFunctionStudy(cfg, s)])),
    grades: Object.fromEntries(Object.entries(FN_STREAMS).map(([k, s]) => [k, digest(grade(s))])),
    samples: digest(sampleFunction(cfg))
  };
}
function compositePins() {
  const ff = (actions: unknown[]) => ({ kind: "smartSim", pluginKey: "physicsFreeFall", pluginVersion: 1, actions, state: { forged: 1 } });
  const phys = compositePhysicsExam(), net = compositeNetworkExam();
  const physQ = (phys as { sections: { questions: { examQuestionId: string }[] }[] }).sections[0].questions[0].examQuestionId;
  const netQ = (net as { sections: { questions: { examQuestionId: string }[] }[] }).sections[0].questions[0].examQuestionId;
  const physAnswers = [{}, { [physQ]: { kind: "composite", parts: {}, contexts: { ctxSim: ff(FF_STREAMS.perfect) } } }, { [physQ]: { kind: "composite", parts: {}, contexts: { ctxSim: ff(FF_STREAMS.partial) } } }];
  const netAnswers = [{}, { [netQ]: { kind: "composite", parts: { m1: { kind: "choice", index: 0 } }, contexts: { ctxNet: { kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 2, actions: NET_SOLUTIONS.roas, state: {} } } } }];
  return {
    physics: physAnswers.map(a => digest(gradeExam(phys, a))), network: netAnswers.map(a => digest(gradeExam(net, a))),
    sanitize: [digest(sanitizeExamForStudent(phys)), digest(sanitizeExamForStudent(net))]
  };
}
function projectionPins() {
  return digest([projectSmartSimForStudent({ schemaVersion: 1, pluginKey: "physicsFreeFall", pluginVersion: 1, config: freeFallClassroomConfig() }),
    projectSmartSimForStudent({ schemaVersion: 1, pluginKey: "functionStudy2d", pluginVersion: 1, config: rationalCertificationConfig() }), NET2_ACTION_KINDS]);
}

const compute = () => ({
  physics: physicsPins(), fn: functionPins(), composite: compositePins(), projection: projectionPins(),
  net: Object.fromEntries(NET2_TEMPLATES.map(t => [t.id, netPins(t.id)]))
});

const PIN: Json | null = {"physics":{"kinds":[["measurement.set","measurement.clear","graphPoint.set","graphPoint.clear"],["physics.impactTime","physics.impactSpeed","physics.heightAtTime","physics.velocityAtTime","physics.pointOnTrajectory"]],"normalize":{"measurement.set":{"ok":false,"code":"FREEFALL_ACTION_INVALID"},"graphPoint.set":{"ok":false,"code":"FREEFALL_ACTION_INVALID"},"playback.play":{"ok":false,"code":"FREEFALL_ACTION_INVALID"},"seek":{"ok":false,"code":"FREEFALL_ACTION_INVALID"},"speed.set":{"ok":false,"code":"FREEFALL_ACTION_INVALID"},"vector.toggle":{"ok":false,"code":"FREEFALL_ACTION_INVALID"}},"normalizeExact":[{"ok":true,"action":{"type":"measurement.set","measurementId":"impactTime","value":2.02}},{"ok":true,"action":{"type":"measurement.clear","measurementId":"impactTime"}},{"ok":true,"action":{"type":"graphPoint.set","pointId":"impactPoint","t":2.02,"y":0}},{"ok":true,"action":{"type":"graphPoint.clear","pointId":"impactPoint"}},{"ok":false,"code":"FREEFALL_ACTION_INVALID"},{"ok":false,"code":"FREEFALL_ACTION_INVALID"},{"ok":false,"code":"FREEFALL_ACTION_INVALID"},{"ok":false,"code":"FREEFALL_ACTION_INVALID"}],"replay":{"empty":{"ok":true,"actions":[],"state":{"v":1,"measurements":{},"points":{}}},"perfect":{"ok":true,"actions":[{"type":"measurement.set","measurementId":"impactTime","value":2.0203},{"type":"measurement.set","measurementId":"impactSpeed","value":19.799},{"type":"measurement.set","measurementId":"heightAt1s","value":15.1},{"type":"measurement.set","measurementId":"velocityAt1s","value":-9.8},{"type":"graphPoint.set","pointId":"impactPoint","t":2.02,"y":0},{"type":"graphPoint.set","pointId":"pointAt1s","t":1,"y":15.1}],"state":{"v":1,"measurements":{"heightAt1s":15.1,"impactSpeed":19.799,"impactTime":2.0203,"velocityAt1s":-9.8},"points":{"impactPoint":{"t":2.02,"y":0},"pointAt1s":{"t":1,"y":15.1}}}},"partial":{"ok":true,"actions":[{"type":"measurement.set","measurementId":"impactTime","value":2.5},{"type":"measurement.set","measurementId":"heightAt1s","value":15.1},{"type":"graphPoint.set","pointId":"pointAt1s","t":1,"y":3}],"state":{"v":1,"measurements":{"heightAt1s":15.1,"impactTime":2.5},"points":{"pointAt1s":{"t":1,"y":3}}}},"cleared":{"ok":true,"actions":[{"type":"measurement.set","measurementId":"impactTime","value":2.0203},{"type":"measurement.clear","measurementId":"impactTime"},{"type":"graphPoint.set","pointId":"impactPoint","t":2.02,"y":0},{"type":"graphPoint.clear","pointId":"impactPoint"}],"state":{"v":1,"measurements":{},"points":{}}},"presentationLeak":{"ok":false,"code":"FREEFALL_ACTION_INVALID"}},"grades":{"empty":"dc797ca9fd3011eb6a8cc397","perfect":"c2f1ff09973d240b97c88eba","partial":"51ef00abd7c9b37665d962ec","cleared":"dc797ca9fd3011eb6a8cc397","presentationLeak":"c49be1862fb198402fd3d255"},"formulas":"0d81c68977dd0e4ec6e5e951"},"fn":{"kinds":[["domain.setExclusions","intercepts.setX","intercept.setY","asymptotes.setVertical","asymptotes.setHorizontal","extrema.set","intervals.set"],["domain.exclusions","intercepts.x","intercept.y","asymptotes.vertical","asymptotes.horizontal","extrema.points","monotonic.intervals"]],"replay":{"empty":{"ok":true,"actions":[],"state":{"v":1,"domainExclusions":[],"xIntercepts":[],"yIntercept":null,"verticalAsymptotes":[],"horizontalAsymptotes":[],"extrema":[],"monotonicIntervals":[]}},"perfect":{"ok":true,"actions":[{"type":"domain.setExclusions","values":[-2,1]},{"type":"intercepts.setX","points":[{"x":2,"y":0}]},{"type":"intercept.setY","y":2},{"type":"asymptotes.setVertical","values":[-2,1]},{"type":"asymptotes.setHorizontal","values":[0]},{"type":"extrema.set","points":[{"kind":"min","x":0,"y":2},{"kind":"max","x":4,"y":0.2222}]},{"type":"intervals.set","intervals":[{"kind":"decreasing","from":"-inf","to":-2},{"kind":"decreasing","from":-2,"to":0},{"kind":"increasing","from":0,"to":1},{"kind":"increasing","from":1,"to":4},{"kind":"decreasing","from":4,"to":"+inf"}]}],"state":{"v":1,"domainExclusions":[-2,1],"xIntercepts":[{"x":2,"y":0}],"yIntercept":{"x":0,"y":2},"verticalAsymptotes":[-2,1],"horizontalAsymptotes":[0],"extrema":[{"kind":"min","x":0,"y":2},{"kind":"max","x":4,"y":0.2222}],"monotonicIntervals":[{"kind":"decreasing","from":"-inf","to":-2},{"kind":"decreasing","from":-2,"to":0},{"kind":"increasing","from":0,"to":1},{"kind":"increasing","from":1,"to":4},{"kind":"decreasing","from":4,"to":"+inf"}]}},"partial":{"ok":true,"actions":[{"type":"domain.setExclusions","values":[1]},{"type":"asymptotes.setVertical","values":[-2,1]}],"state":{"v":1,"domainExclusions":[1],"xIntercepts":[],"yIntercept":null,"verticalAsymptotes":[-2,1],"horizontalAsymptotes":[],"extrema":[],"monotonicIntervals":[]}},"probeLeak":{"ok":false,"code":"FUNCSTUDY_ACTION_INVALID"}},"grades":{"empty":"d3745c8f2f9706e858971c92","perfect":"160a8d41cb50aeac52de9c3c","partial":"a75cf25578088eaba384779e","probeLeak":"27ada7687cf6752f51dc19cc"},"samples":"11c5681ea3785c463ad7b913"},"composite":{"physics":["dc18c5b03b3da7db08ce21c0","e4221d2be4d2727224a1f86d","ec874a59d3beb0a20ac573d9"],"network":["32cee46ab2bb4fbab91bdf80","5c06a970105db36ae7ad638f"],"sanitize":["e6294bd6f170b9811c19abad","11128f25e5ab40d7e0ac303a"]},"projection":"e5d96d5d87e80b8a8d24137d","net":{"roas":{"streamLength":112,"state":"f671935cb0f123b037c362c9","transcripts":"2ef51df19aa12233526de6be","reach":"9ca07ee0457016893af40bc2","gradeEmpty":"fe96665cdda5bae6985628ba","gradeSolution":"c98f532fa51fa02ce20e85e3","gradeStream":"426aeb30c3d61d955e0f0c0d"},"dhcp":{"streamLength":32,"state":"bf06f233796ef3060b04093b","transcripts":"e5baa4b24ad0b9259a0c6325","reach":"df0dd7634b47912fc481c50b","gradeEmpty":"c6ecbcd3446b85613574daee","gradeSolution":"dd37257b22ba06457ca17fe9","gradeStream":"f034532a85b1de5b12fcd91a"},"vtp":{"streamLength":38,"state":"df28dc1ebe0566931c741075","transcripts":"9eb5ee1d66f7b7b5fbc0bebd","reach":"b23bcc949e886fde743f54b8","gradeEmpty":"5b512e4aa1fbdeb4d1a9265c","gradeSolution":"c109f68ed87ae2446860c6d1","gradeStream":"623ce6a1990441582120d9db"},"portsec":{"streamLength":45,"state":"23eec213e82dda4c15c3e39c","transcripts":"85f07240e62c749bca9126f3","reach":"0a3b5a0ceae62f79cf8769a8","gradeEmpty":"1f7637b90e1afd4edb5c9475","gradeSolution":"9bb6dc965e4225ac98d0c10e","gradeStream":"f9ec91fd40ff499118305f30"},"wireless":{"streamLength":23,"state":"d653d5876161a5077f41417b","transcripts":"fe41442a7fa81edc0fe406cc","reach":"42f55399baf1dd3cd651e8b4","gradeEmpty":"5f176aa51a8592972899c01f","gradeSolution":"ec12cdc0cbeed5baceba2b68","gradeStream":"0ef1d9a746c88ef6ce01c426"},"capstone":{"streamLength":175,"state":"ad9954f0026df5c97e86ae0e","transcripts":"42f0ca17cb7a39da61d9e65b","reach":"4bbfb01ec011282e58127a34","gradeEmpty":"c3db73f4609d1ee873fb55db","gradeSolution":"664a47ebaa5cbb994ce0d7f3","gradeStream":"0f1dba202513ba07c7c52330"}}};
describe("20E-FREEZE SmartSim semantics captured on 78445fd", () => {
  it("capture or compare", () => {
    const now = compute();
    if (process.env.CAPTURE_20E_PINS) { fs.writeFileSync(process.env.CAPTURE_20E_PINS, JSON.stringify(now, null, 1)); return; }
    expect(PIN).not.toBeNull();
    expect(now).toEqual(PIN);
  });
});
