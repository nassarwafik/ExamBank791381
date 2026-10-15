import { describe, expect, it } from "vitest";
import { selectAssignments } from "./assignmentDiscovery";
import type { Item } from "./types";
const make = (assignmentId: string, title: string, status: Item["status"], dueAt: string): Item =>
  ({assignmentId, title, status, dueAt, classId:"class",className:"صف",instructions:"",openAt:"",questionCount:1,totalMarks:10,maxAttempts:1});
const rows = [
  make("b","بستان","draft","2026-10-20T00:00:00Z"),
  make("a","أمل","published","2026-10-18T00:00:00Z"),
  make("c","خالد","archived",""),
  make("d","جميل","published","invalid")
];
describe("assignment list discoverability", () => {
  it("preserves original server order by default and never mutates inputs", () => {
    expect(selectAssignments(rows,"all","original").map(x=>x.assignmentId)).toEqual(["b","a","c","d"]);
    expect(selectAssignments(rows,"published","original").map(x=>x.assignmentId)).toEqual(["a","d"]);
    expect(rows.map(x=>x.assignmentId)).toEqual(["b","a","c","d"]);
  });
  it("sorts by deadline and always places missing deadlines last", () => {
    expect(selectAssignments(rows,"all","dueSoon").map(x=>x.assignmentId)).toEqual(["a","b","c","d"].slice(0,2).concat(["d","c"].sort((x,y)=>rows.find(z=>z.assignmentId===x)!.title.localeCompare(rows.find(z=>z.assignmentId===y)!.title,"ar"))));
    expect(selectAssignments(rows,"all","dueLate").slice(0,2).map(x=>x.assignmentId)).toEqual(["b","a"]);
  });
  it("filters published and draft without changing the input", () => {
    expect(selectAssignments(rows,"published","title").map(x=>x.assignmentId)).toEqual(["a","d"].sort((x,y)=>rows.find(z=>z.assignmentId===x)!.title.localeCompare(rows.find(z=>z.assignmentId===y)!.title,"ar")));
    expect(rows[0].assignmentId).toBe("b");
  });
  it("uses stable Arabic title ordering", () => {
    expect(selectAssignments(rows,"all","title").map(x=>x.assignmentId)).toEqual([...rows].sort((a,b)=>a.title.localeCompare(b.title,"ar")).map(x=>x.assignmentId));
  });
});
