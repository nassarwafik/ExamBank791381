#!/usr/bin/env node
// Phase 21A.2 mutation certification: independent processes, one source mutation at a time,
// SHA-256 verified restoration, no parallel mutations, stable machine-readable ledger.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
const SPEC = "src/functionGraphs/functionGraphSpec.ts";
const SAMPLE = "src/functionGraphs/graphSampling.ts";
const SCENE = "src/functionGraphs/graphScene.ts";
const SELECT = "src/functionGraphSelectionQuestion.ts";
const AI = "src/aiComposer/composerGraph.ts";
const SPEC_TEST = ["src/functionGraphs/functionGraphSpec.21a2.test.ts", "api/tests/certification-21a2/cert-21a2-adversarial.test.js"];
const SCENE_TEST = ["src/functionGraphs/graphScene.21a2.test.ts", "src/functionGraphs/functionGraphSpec.21a2.test.ts"];
const SELECT_TEST = ["src/functionGraphs/functionGraphFailFirst.21a2.test.tsx", "api/tests/certification-21a2/cert-21a2-graphs-lifecycle.test.js"];
const AI_TEST = ["src/aiComposer/composerGraph.21a2.test.ts"];
const M = (id, file, before, after, tests) => ({ id, file, before, after, tests });
const mutants = [
 M("S01-prototype-id",SPEC,'!FORBIDDEN_KEYS.has(v);','true;',SPEC_TEST),
 M("S02-array-as-object",SPEC,'if (!v || typeof v !== "object" || Array.isArray(v)) return false;','if (!v || typeof v !== "object") return false;',SPEC_TEST),
 M("S03-root-extra-fields",SPEC,'if (!keysOk(raw, TOP_KEYS, path)) return { ok: false, issues };','if (false && !keysOk(raw, TOP_KEYS, path)) return { ok: false, issues };',SPEC_TEST),
 M("S04-graph-version",SPEC,'if (raw.version !== FUNCTION_GRAPH_VERSION)','if (false && raw.version !== FUNCTION_GRAPH_VERSION)',SPEC_TEST),
 M("S05-text-length",SPEC,'if (v.length > max) { add("GRAPH_LIMIT"','if (v.length > max * 2) { add("GRAPH_LIMIT"',SPEC_TEST),
 M("S06-invisible-label",SPEC,'if (CONTROL.test(v) || BIDI_CONTROL.test(v) || INVISIBLE_CONTROL.test(v)) { add("GRAPH_TEXT_CONTROL", "محارف تحكم أو محارف خفية غير مسموحة في نص رسم الدالة."','if (CONTROL.test(v)) { add("GRAPH_TEXT_CONTROL", "محارف تحكم أو محارف خفية غير مسموحة في نص رسم الدالة."',SPEC_TEST),
 M("S07-HTML-guard",SPEC,'if (RAW_HTML.test(v)) { add("GRAPH_TEXT_MARKUP"','if (false && RAW_HTML.test(v)) { add("GRAPH_TEXT_MARKUP"',SPEC_TEST),
 M("S08-finite-range",SPEC,'if (Math.abs(v) > L.coordAbs)','if (Math.abs(v) > L.coordAbs * 100)',SPEC_TEST),
 M("S09-viewport-span",SPEC,'if (!(xMax - xMin >= L.minSpan) || !(yMax - yMin >= L.minSpan))','if (false)',SPEC_TEST),
 M("S10-axis-tick-limit",SPEC,'if (!(s > 0) || span / s > L.maxTicks)','if (!(s > 0))',SPEC_TEST),
 M("S11-repeated-parameter",SPEC,'if (params.has(p.id))','if (false)',SPEC_TEST),
 M("S12-duplicate-object-id",SPEC,'if (ids.has(o.id))','if (false)',SPEC_TEST),
 M("S13-duplicate-label",SPEC,'if (labels.has(n))','if (false)',SPEC_TEST),
 M("S14-expr-budget",SPEC,'if (++expressions > L.expressions)','if (++expressions > L.expressions * 3)',SPEC_TEST),
 M("S15-inverted-domain",SPEC,'if (min !== undefined && max !== undefined && !(max > min))','if (false)',SPEC_TEST),
 M("S16-piece-closed-overlap",SPEC,'if (b.min < a.max || (b.min === a.max && a.maxClosed && b.minClosed))','if (b.min < a.max)',SPEC_TEST),
 M("S17-derivative-smoothness",SPEC,'return { value: r, smooth };','return { value: r, smooth: true };',SPEC_TEST),
 M("S18-derivative-reference",SPEC,'if (b.derivativeOf !== undefined && (b.derivativeOf === b.id || curveKind.get(b.derivativeOf) !== "explicit"))','if (false)',SPEC_TEST),
 M("S19-style-palette",SPEC,'s.color < 1 || s.color > L.colors','false',SPEC_TEST),
 M("P01-max-samples",SAMPLE,'Math.min(L.maxSamples, Math.floor(Number.isFinite(o.samples) ? o.samples : 400))','Math.min(L.maxSamples * 2, Math.floor(Number.isFinite(o.samples) ? o.samples : 400))',SPEC_TEST),
 M("P02-max-depth",SAMPLE,'Math.min(L.maxDepth, Math.floor(o.maxDepth ?? 12))','Math.min(L.maxDepth * 2, Math.floor(o.maxDepth ?? 12))',SPEC_TEST),
 M("P03-inverted-domain",SAMPLE,'Number.isFinite(s1) && s1 > s0','Number.isFinite(s1)',SPEC_TEST),
 M("P04-break-detection",SAMPLE,'const jump = dist(pa, pb) > L.jump;','const jump = false;',SPEC_TEST),
 M("P05-midpoint-guard",SAMPLE,'if (!jump && dist(chord, pm) <= smooth)','if (dist(chord, pm) <= smooth)',SPEC_TEST),
 M("E01-open-endpoint",SCENE,'open: !closed || !graphInDomain(x, dm) || !Number.isFinite(f(x))','open: false',SCENE_TEST),
 M("E02-shaded-region-samples",SCENE,'const n = 160, xs =','const n = 16, xs =',SCENE_TEST),
 M("E03-interval-closed-default",SCENE,'fromClosed: v.fromClosed ?? true, toClosed: v.toClosed ?? true','fromClosed: true, toClosed: true',SCENE_TEST),
 M("Q01-config-exact-fields",SELECT,'if (!onlyKeys(raw, ["v", "graph", "target", "mode", "maxSelections", "label"]))','if (false)',SELECT_TEST),
 M("Q02-target-minimum",SELECT,'if (targets.length < FUNCTION_GRAPH_SELECTION_LIMITS.minTargets)','if (false)',SELECT_TEST),
 M("Q03-max-selection-bound",SELECT,'if (typeof max !== "number" || !Number.isInteger(max) || max < 1 || (targets.length > 0 && max > targets.length) || (mode === "single" && max !== 1))','if (false)',SELECT_TEST),
 M("Q04-key-duplicate",SELECT,'if (new Set(keys).size !== keys.length)','if (false)',SELECT_TEST),
 M("Q05-key-unknown-target",SELECT,'if (unknown.length)','if (false)',SELECT_TEST),
 M("Q06-forged-graph-id",SELECT,'if (response.graphId !== cfg.config.graph.id)','if (false)',SELECT_TEST),
 M("Q07-response-duplicate",SELECT,'if (new Set(given).size !== given.length)','if (false)',SELECT_TEST),
 M("Q08-response-unknown-target",SELECT,'if ((given as string[]).some(k => !order.includes(k)))','if (false)',SELECT_TEST),
 M("A01-graph-policy-disabled",AI,'if (!policy.charts) return fail(','if (false && !policy.charts) return fail(',AI_TEST),
 M("A02-invented-formula",AI,'if (!stated.has(normalizeMathNotation(c.expression)))','if (false)',AI_TEST),
 M("A03-invented-domain",AI,'if (c[k] !== null && !written(c[k] as number, nums))','if (false)',AI_TEST),
 M("A04-invented-viewport",AI,'if (bad) return fail("AI_GRAPH_NUMBER_NOT_STATED"','if (false && bad) return fail("AI_GRAPH_NUMBER_NOT_STATED"',AI_TEST)
];
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const files = [...new Set(mutants.map(m => m.file))];
const original = new Map(files.map(file => [file, fs.readFileSync(file,"utf8")]));
const hashes = Object.fromEntries([...original].map(([file,value])=>[file,sha(value)]));
const status = spawnSync("git", ["status","--porcelain","--",...files],{encoding:"utf8"});
if(status.status !== 0 || status.stdout.trim()) { console.error("Mutated source tree must start clean.",status.stdout); process.exit(3); }
const vitest = tests => spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs","run","--reporter=dot",...tests],{ encoding:"utf8", timeout:90000,maxBuffer:4*1024*1024, env:{...process.env, CI:"true"}});
const allTests = [...new Set(mutants.flatMap(x=>x.tests))];
const baseline = vitest(allTests);
if(baseline.status !== 0){console.error("BASELINE RED",baseline.stdout.slice(-3500),baseline.stderr.slice(-2000));process.exit(4);}
console.log("21A2_MUTATION_BASELINE_GREEN",JSON.stringify({tests:allTests,mutants:mutants.length,files:hashes}));
const ledger = [];
try {
for (const m of mutants) {
  let outcome="invalid",diagnostic="";
  const source=original.get(m.file);
  const occurrences=source.split(m.before).length-1;
  if(occurrences!==1){diagnostic="needle count "+occurrences;}
  else if (m.before===m.after){diagnostic="mutation identical";}
  else {
    try {
      fs.writeFileSync(m.file, source.replace(m.before,m.after),"utf8");
      const result = vitest(m.tests);
      const output = (result.stdout||"")+"\n"+(result.stderr||"");
      if(result.error?.code==="ETIMEDOUT" || result.signal){outcome="timeout";diagnostic=String(result.error||result.signal);}
      else if(result.status===0){outcome="survived";diagnostic="Selected tests passed";}
      else if(/Transform failed|Failed to parse source|SyntaxError:|Unexpected token|Error during transform/.test(output)){outcome="invalid";diagnostic=output.slice(-700);}
      else {outcome="killed";diagnostic=output.split("\n").filter(x=>/FAIL |AssertionError|Test Files|Tests +/.test(x)).slice(0,3).join(" ").slice(0,600);}
    }catch(error){diagnostic=String(error);}
    finally {fs.writeFileSync(m.file,source,"utf8");}
  }
  const record={id:m.id,file:m.file,outcome,diagnostic};
  ledger.push(record);
  console.log("21A2_MUTATION_RESULT",JSON.stringify(record));
}
}finally{
  for(const [file,contents] of original) fs.writeFileSync(file,contents,"utf8");
}
const verified=files.every(f=>sha(fs.readFileSync(f,"utf8"))===hashes[f]);
const git=spawnSync("git",["diff","--exit-code","--",...files],{encoding:"utf8"});
const counts=Object.fromEntries(["killed","survived","invalid","timeout"].map(s=>[s,ledger.filter(r=>r.outcome===s).length]));
const report={baseline:"green",source_sha256:hashes,restored:verified&&git.status===0,counts,mutants:ledger};
fs.mkdirSync("artifacts/phase-21a2",{recursive:true});
fs.writeFileSync("artifacts/phase-21a2/mutation-ledger.json",JSON.stringify(report,null,2)+"\n");
console.log("21A2_MUTATION_SUMMARY",JSON.stringify({restored:report.restored,counts,report:"artifacts/phase-21a2/mutation-ledger.json"}));
if(!report.restored || counts.invalid || counts.timeout || counts.survived)process.exitCode=1;
