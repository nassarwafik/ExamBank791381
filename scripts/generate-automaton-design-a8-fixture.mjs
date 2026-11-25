#!/usr/bin/env node
// AUTO-A8 — writes the automatonDesign@1 acceptance exam (scripts/automaton-design-a8-exam.mjs) to its committed fixture path.
import fs from "node:fs";
import path from "node:path";
import { buildAutomatonDesignAcceptanceExam, AUTOMATON_DESIGN_ACCEPTANCE_PATH, serializeExam } from "./automaton-design-a8-exam.mjs";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = path.join(root, AUTOMATON_DESIGN_ACCEPTANCE_PATH);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, serializeExam(buildAutomatonDesignAcceptanceExam()), "utf8");
console.log(out);
