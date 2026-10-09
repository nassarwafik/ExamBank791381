import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildInteractive3DAcceptanceExam, INTERACTIVE_3D_ACCEPTANCE_PATH, serializeExam } from "../../../scripts/interactive-3d-21c-exam.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..");

describe("21C generated fixture drift",()=>{
  it("the committed JSON is byte-for-byte generated from the source",()=>{
    const committed=fs.readFileSync(path.join(root,INTERACTIVE_3D_ACCEPTANCE_PATH),"utf8");
    expect(committed).toBe(serializeExam(buildInteractive3DAcceptanceExam()));
  });
  it("persisted scenes contain no renderer/executable keys or external URLs",()=>{
    const exam=buildInteractive3DAcceptanceExam();
    const forbidden=new Set(["renderer","three","webgl","rawSvg","html","callback","script","url","src"]);
    const walk=value=>{
      if(Array.isArray(value))return value.forEach(walk);
      if(!value||typeof value!=="object")return;
      for(const [key,child] of Object.entries(value)){
        expect(forbidden.has(key),"forbidden 3D persisted key: "+key).toBe(false);
        if(typeof child==="string")expect(child).not.toMatch(/^https?:\/\//i);
        walk(child);
      }
    };
    walk(exam.sections);
  });
});
