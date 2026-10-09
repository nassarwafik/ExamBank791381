import { describe,expect,it } from "vitest";
import { projectRichContentForStudent,richContentPlainText,RICH_LIMITS,validateRichContent } from "../richContent/richContentModel";
import { defaultSurface } from "./surfaceEditing";
const block=(id="surface-a")=>({type:"functionSurface3D",surface:defaultSurface(id)}); const doc=(...blocks:unknown[])=>({schemaVersion:1,blocks});
describe("21B persisted 3D rich content",()=>{
 it("accepts canonical SurfaceSpecV1 and preserves the student projection",()=>{const raw=doc(block());const r=validateRichContent(raw);expect(r.ok).toBe(true);expect(r.value).toEqual(raw);expect(projectRichContentForStudent(raw)).toEqual(raw);expect(richContentPlainText(raw)).toContain("z = x^2+y^2");});
 it("refuses renderer options smuggled into the stored surface",()=>{const b=block() as {type:string;surface:Record<string,unknown>};b.surface.renderer={rawSvg:"<svg/>"};const r=validateRichContent(doc(b));expect(r.ok).toBe(false);expect(r.issues.map(i=>i.code)).toContain("RICH_CONTENT_FUNCTION_SURFACE");});
 it("refuses duplicate ids and more surfaces than the bound",()=>{const d=validateRichContent(doc(block("same"),block("same")));expect(d.ok).toBe(false);expect(d.issues.map(i=>i.code)).toContain("RICH_CONTENT_FUNCTION_SURFACE");const many=validateRichContent(doc(...Array.from({length:RICH_LIMITS.functionSurfaces+1},(_,i)=>block("surface-"+i))));expect(many.ok).toBe(false);expect(many.issues.map(i=>i.code)).toContain("RICH_CONTENT_LIMIT");});
});
