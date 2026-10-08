// Phase 21A.1 — writes the INTERACTIVE CHARTS MINI ACCEPTANCE EXAM (scripts/data-charts-21a1-exam.mjs) to docs/fixtures/data-charts-21a1/.
// Run with Node ≥ 22.18 (TypeScript type stripping, for the shared chart fixtures): `node scripts/generate-data-charts-21a1-fixture.mjs`.
// The drift test api/tests/certification-21a1/cert-21a1-fixture-drift.test.js requires the committed file to equal the builder's output.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildChartsAcceptanceExam, serializeExam, CHARTS_ACCEPTANCE_PATH } from "./data-charts-21a1-exam.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const C = await import(pathToFileURL(path.join(repo, "src/charts/testing/chartFixtures.ts")).href);
const out = path.join(repo, CHARTS_ACCEPTANCE_PATH);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, serializeExam(buildChartsAcceptanceExam(C)));
console.log("wrote " + CHARTS_ACCEPTANCE_PATH);
