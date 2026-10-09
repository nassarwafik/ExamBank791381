#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSurfacesAcceptanceExam, serializeExam, SURFACES_ACCEPTANCE_PATH } from "./function-surfaces-21b-exam.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, SURFACES_ACCEPTANCE_PATH);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, serializeExam(buildSurfacesAcceptanceExam()));
console.log("wrote " + SURFACES_ACCEPTANCE_PATH);
