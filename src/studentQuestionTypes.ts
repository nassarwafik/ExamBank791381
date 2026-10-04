import type { SimulationQuestionConfig } from "./smartsimManifest";
import type { CodingQuestionConfigV1 } from "./codingQuestion";
import type { NetworkCliQuestionConfigV1 } from "./networkCliQuestion";
import type { InlineClozeConfigV1 } from "./inlineClozeQuestion";
// Phase 14A — the student-facing question shape types, extracted verbatim from StudentQuestionCard.tsx into a pure module so
// the exam structure helpers can be compiled for the server finalization authority without reaching a React component.
// StudentQuestionCard re-exports them, so every existing importer is unchanged.
export type Opt={value?:string;label?:string;text?:string;order?:number;number?:number};
// `Field` gained optional structural hints for the new generalized question types:
//  - row/column place an answerable cell explicitly in a generalized table (never inferred);
//  - statement is the per-row text of a multiTrueFalse question;
//  - kind stays free-form ("text"|"select"|"boolean"|...) so legacy fields are unaffected.
// `correct` is deliberately NOT part of this student-facing type — answer keys never reach the browser.
export type Field={id?:string;number?:number;label?:string;kind?:string;options?:Opt[];row?:number;column?:number;statement?:string};
export type ImageAsset={dataUrl?:string};
// A compound question's independent subpart. Reuses the same answer-control vocabulary as a whole
// question so parts render through the exact same field/choice/text machinery (no second engine).
export type QuestionPart={id:string;label?:string;text?:string;textHtml?:string;marks?:number;type:string;questionTypeVersion?:number;options?:Opt[];fields?:Field[];wordBank?:string[];cli?:string;tableHeaders?:string[];tableRows?:string[][];image?:{exists?:boolean;visible?:boolean;assets?:ImageAsset[]};images?:ImageAsset[]};
export type Question={examQuestionId?:string;id?:string;number?:number;displayNumber?:string;text:string;textHtml?:string;marks:number;presentationType?:string;type?:string;questionTypeVersion?:number;options?:Opt[];fields?:Field[];wordBank?:string[];cli?:string;tableHeaders?:string[];tableRows?:string[][];simulation?:SimulationQuestionConfig;coding?:CodingQuestionConfigV1;networkCli?:NetworkCliQuestionConfigV1;inlineCloze?:InlineClozeConfigV1;parts?:QuestionPart[];groupId?:string;stimulus?:{title?:string;text?:string;image?:ImageAsset};image?:{exists?:boolean;visible?:boolean;assets?:ImageAsset[]};images?:ImageAsset[]};
