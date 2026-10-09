#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildInteractive3DAcceptanceExam, INTERACTIVE_3D_ACCEPTANCE_PATH, serializeExam } from "./interactive-3d-21c-exam.mjs";
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),"..");
const out=path.join(root,INTERACTIVE_3D_ACCEPTANCE_PATH);
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,serializeExam(buildInteractive3DAcceptanceExam()),"utf8");
console.log(out);
