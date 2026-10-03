// Phase 17F-C1 — the Monaco ENGINE chunk. This is the ONLY module in src/ that imports `monaco-editor`, and it is reached only
// through the dynamic import() in editorEngine.ts, so the production bundle guard can prove that nothing of it enters the initial
// graph or the coding question's own chunk.
//
// Curated, minimal, tree-shaken Monaco: the core API + the editing contributions SmartAssess allows (bracket matching, clipboard,
// toggle-comment, context menu, cursor undo, find / replace, folding, line operations, multi-cursor, word operations, tab-focus
// toggle, read-only message) + the three registry languages (each language's Monarch grammar is itself a lazy chunk loaded the
// first time that language is encountered) + the editor worker as a bundled, same-origin Vite worker.
//
// Deliberately NOT imported — there is no completion machinery in this bundle at all (the options in editorOptions.ts are a second
// line, not the only one): contrib/suggest, contrib/parameterHints, contrib/inlineCompletions, contrib/snippet, contrib/codeAction,
// contrib/codelens, contrib/rename, contrib/gotoSymbol, contrib/inlayHints, contrib/hover, contrib/links, contrib/format,
// contrib/dropOrPasteInto, the quick-access / command palette, every other language and every language FEATURE (the JSON / CSS /
// HTML / TypeScript services and their workers), and the LSP client. No CDN, no language server, no telemetry: Monaco's standalone
// build contacts nothing, and every asset here is served from the SmartAssess deployment.
import * as monaco from "monaco-editor/editor/editor.api.js";
import "monaco-editor/editor/browser/coreCommands.js";
import "monaco-editor/editor/browser/widget/codeEditor/codeEditorWidget.js";
import "monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js";
import "monaco-editor/editor/contrib/clipboard/browser/clipboard.js";
import "monaco-editor/editor/contrib/comment/browser/comment.js";
import "monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js";
import "monaco-editor/editor/contrib/cursorUndo/browser/cursorUndo.js";
import "monaco-editor/features/find/register.js";
import "monaco-editor/editor/contrib/folding/browser/folding.js";
import "monaco-editor/editor/contrib/linesOperations/browser/linesOperations.js";
import "monaco-editor/editor/contrib/multicursor/browser/multicursor.js";
import "monaco-editor/editor/contrib/wordOperations/browser/wordOperations.js";
import "monaco-editor/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode.js";
import "monaco-editor/editor/contrib/readOnlyMessage/browser/contribution.js";
import "monaco-editor/editor/common/standaloneStrings.js";
import "monaco-editor/features/codicon/register.js";
import "monaco-editor/languages/definitions/python/register.js";
import "monaco-editor/languages/definitions/java/register.js";
import "monaco-editor/languages/definitions/csharp/register.js";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import { createMonacoEngine, type MonacoLike } from "./monacoAdapter";
import type { EditorEngine } from "./editorEngine";

// The editor worker (diff / tokenization helpers) is a same-origin module worker bundled by Vite — never a CDN script. Set before
// the first editor is created; Monaco reads it lazily from the global environment.
globalThis.MonacoEnvironment = { getWorker: () => new EditorWorker() };

export const monacoEngine: EditorEngine = createMonacoEngine(monaco as unknown as MonacoLike);
