// Phase 16A — prop contracts of the CODE-OWNED runtime registries (authoring editor / student renderer). A registered type's
// implementations receive the canonical node / question and emit canonical patches / Answers — never persistence, never
// grading authority, never exam-level state.
import type { ComponentType } from "react";
import type { QuestionBody } from "../examTypes";
import type { Question } from "../studentQuestionTypes";
import type { Answer } from "../answerState";

export type AuthoringEditorProps = { node: QuestionBody; onChange: (patch: Partial<QuestionBody>) => void; disabled?: boolean };
export type StudentRendererProps = { q: Question; id: string; answer: Answer | undefined; onAnswer: (next: Answer) => void; disabled?: boolean; labelPrefix: string; textId?: string };
export type AuthoringEditorComponent = ComponentType<AuthoringEditorProps>;
export type StudentRendererComponent = ComponentType<StudentRendererProps>;
