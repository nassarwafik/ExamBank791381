#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildMeshModelsAcceptanceExam, MESH_MODELS_ACCEPTANCE_PATH, serializeExam } from "./mesh-models-21db3-exam.mjs";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = path.join(root, MESH_MODELS_ACCEPTANCE_PATH);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, serializeExam(buildMeshModelsAcceptanceExam()), "utf8");
console.log(out);
