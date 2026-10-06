import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gradeExam } from "../src/lib/assignment-grading.js";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { parseStructuredExamJson } from "../../src/structuredExamImport";
import { impactTime, impactSpeed } from "../../src/physicsFreeFallModel";

// Phase 20E — acceptance fixtures A–F (docs/fixtures/smartsim-20e/*.json). They import through the real JSON path with no error, and the
// SERVER grades them from the semantic action streams exactly as before 20E: a perfect sheet earns full marks, an empty sheet nothing,
// presentation-looking actions are refused (never scored), and the student payload never carries a private check. The dynamic
// experience adds nothing to any of this — it is presentation only.
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docs/fixtures/smartsim-20e");
const NAMES = ["A-free-fall-from-rest", "B-upward-throw", "C-function-study", "D-network-flow", "E-composite-shared-physics", "F-reduced-motion-lunar"];
const read = n => JSON.parse(fs.readFileSync(path.join(DIR, n + ".json"), "utf8"));
const ss = (pluginKey, pluginVersion, actions) => ({ kind: "smartSim", pluginKey, pluginVersion, actions, state: { forged: true } });
const ff = actions => ss("physicsFreeFall", 1, actions);
const set = (id, value) => ({ type: "measurement.set", measurementId: id, value });
const point = (id, t, y) => ({ type: "graphPoint.set", pointId: id, t, y });
const UP = { initialHeight: 30, initialVelocity: 10, gravity: 10 }, MOON = { initialHeight: 50, initialVelocity: -5, gravity: 1.62 };
const sw = (id, ...c) => c.map(command => ({ type: "switch.command", deviceId: id, command }));
const rt = (id, ...c) => c.map(command => ({ type: "router.command", deviceId: id, command }));
const CONF = ["enable", "configure terminal"];
const ROAS = [...sw("sw1", ...CONF, "vlan 10", "name STAFF", "vlan 20", "name STUDENTS", "interface f0/1", "switchport mode access", "switchport access vlan 10", "interface f0/2", "switchport mode access", "switchport access vlan 10",
  "interface f0/11", "switchport mode access", "switchport access vlan 20", "interface f0/12", "switchport mode access", "switchport access vlan 20", "interface g0/1", "switchport mode trunk", "end"),
  ...rt("r1", ...CONF, "interface g0/0", "no shutdown", "interface g0/0.10", "encapsulation dot1Q 10", "ip address 192.168.10.1 255.255.255.0", "interface g0/0.20", "encapsulation dot1Q 20", "ip address 192.168.20.1 255.255.255.0", "end"),
  { type: "host.command", deviceId: "pc1", command: "ping 192.168.20.11" }];
const PERFECT = {
  "A-free-fall-from-rest": { "phys-a": ff([set("impactTime", 2.0203), set("impactSpeed", 19.799), set("heightAt1s", 15.1), set("velocityAt1s", -9.8), point("impactPoint", 2.02, 0), point("pointAt1s", 1, 15.1)]) },
  "B-upward-throw": { "phys-b": ff([set("impactTime", impactTime(UP)), set("impactSpeed", impactSpeed(UP)), set("maxHeight", 35), set("apexTime", 1), point("apexPoint", 1, 35)]) },
  "C-function-study": { "fn-c": ss("functionStudy2d", 1, [{ type: "domain.setExclusions", values: [-2, 1] }, { type: "intercepts.setX", points: [{ x: 2, y: 0 }] }, { type: "intercept.setY", y: 2 }, { type: "asymptotes.setVertical", values: [-2, 1] },
    { type: "asymptotes.setHorizontal", values: [0] }, { type: "extrema.set", points: [{ kind: "min", x: 0, y: 2 }, { kind: "max", x: 4, y: 0.2222 }] },
    { type: "intervals.set", intervals: [{ kind: "decreasing", from: "-inf", to: -2 }, { kind: "decreasing", from: -2, to: 0 }, { kind: "increasing", from: 0, to: 1 }, { kind: "increasing", from: 1, to: 4 }, { kind: "decreasing", from: 4, to: "+inf" }] }]) },
  "D-network-flow": { "net-d": ss("networkTopology", 2, ROAS) },
  "E-composite-shared-physics": { "cmp-e": { kind: "composite", parts: { n1: { kind: "numeric", value: "0" }, m1: { kind: "choice", index: 0 } }, contexts: { ctxSim: ff([set("impactTime", impactTime(UP)), set("maxHeight", 35), point("apexPoint", 1, 35)]) } } },
  "F-reduced-motion-lunar": { "phys-f": ff([set("impactTime", impactTime(MOON))]) }
};
const AUTO_MAX = { "E-composite-shared-physics": 12 };            // the 4-mark open response is teacher-graded (manual review)

describe("20E-ACC acceptance fixtures A–F", () => {
  for (const name of NAMES) {
    it(name + ": imports through the real JSON path with no parse / validation error", () => {
      const r = parseStructuredExamJson(fs.readFileSync(path.join(DIR, name + ".json"), "utf8"), name + ".json");
      expect(r.canOpen).toBe(true);
      expect(r.parseErrors).toEqual([]);
      expect(r.validationErrors.map(i => i.code)).toEqual([]);
    });
    it(name + ": the server grades the semantic stream — perfect = full automatic marks, empty = 0", () => {
      const exam = read(name);
      const perfect = gradeExam(exam, PERFECT[name]);
      const total = exam.sections[0].questions.reduce((n, q) => n + q.marks, 0);
      expect(perfect.score).toBeCloseTo(AUTO_MAX[name] ?? total, 6);
      expect(gradeExam(exam, {}).score).toBe(0);
    });
    it(name + ": presentation-looking actions are refused by the authority and never scored", () => {
      const exam = read(name);
      const q = exam.sections[0].questions[0];
      const leak = [{ type: "playback.play" }, { type: "playback.seek", time: 1 }, { type: "vector.toggle", vector: "velocity" }, { type: "probe.move", x: 1 }, { type: "flow.show", hops: ["pc1"] }];
      const answers = q.presentationType === "composite"
        ? { [q.examQuestionId]: { kind: "composite", parts: {}, contexts: { ctxSim: ff(leak) } } }
        : { [q.examQuestionId]: ss(q.smartSim.pluginKey, q.smartSim.pluginVersion, leak) };
      expect(gradeExam(exam, answers).score).toBe(0);
    });
    it(name + ": the student payload carries no private check, expected value or rubric guidance", () => {
      const out = JSON.stringify(sanitizeExamForStudent(read(name)));
      expect(out).not.toMatch(/"checks"|"expected"|"tolerance"|"guidance"|"modelAnswer"|"correctOptionIndex"/);
    });
  }
  it("fixture B is a real upward throw (apex before impact) and fixture F a downward throw on the Moon", () => {
    expect(read("B-upward-throw").sections[0].questions[0].smartSim.config.model).toEqual(UP);
    expect(1).toBeLessThan(impactTime(UP));
    expect(read("F-reduced-motion-lunar").sections[0].questions[0].smartSim.config.model).toEqual(MOON);
  });
});
