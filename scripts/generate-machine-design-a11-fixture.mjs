#!/usr/bin/env node
// AUTO-A11a — writes the machineDesign@1 acceptance exam (scripts/machine-design-a11-exam.mjs) to its committed fixture path.
import fs from "node:fs";
import path from "node:path";
import { buildMachineDesignAcceptanceExam, MACHINE_DESIGN_ACCEPTANCE_PATH, serializeExam } from "./machine-design-a11-exam.mjs";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = path.join(root, MACHINE_DESIGN_ACCEPTANCE_PATH);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, serializeExam(buildMachineDesignAcceptanceExam()), "utf8");
console.log(out);
