// Regenerate the 21A.2 acceptance JSON from the single TypeScript fixture authority (Node >= 22.18).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildGraphsAcceptanceExam, serializeExam, GRAPHS_ACCEPTANCE_PATH } from "./function-graphs-21a2-exam.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const G = await import(pathToFileURL(path.join(root, "src/functionGraphs/testing/graphFixtures.ts")).href);
const out = path.join(root, GRAPHS_ACCEPTANCE_PATH);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, serializeExam(buildGraphsAcceptanceExam(G)));
console.log("wrote " + GRAPHS_ACCEPTANCE_PATH);
