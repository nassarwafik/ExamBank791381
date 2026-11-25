// The real-browser checks' way to write a program into the code editor (CodingEditor): reliable, and never silently wrong.
//
// The editor starts as a native textarea and hands over to the rich engine (Monaco). The old way — click the lines, Control+A, Delete,
// type — raced that handover: when Control+A came before the engine held the keyboard focus it selected nothing (or the page), and the
// program was typed at the caret INSIDE the sample code («CS1529: A using clause must precede…», nassarwafik/ExamBank791381#723). Now:
//   1. click the editor and WAIT until the keyboard focus is inside it;
//   2. Control+A, Delete — and CHECK the editor is empty;
//   3. type the program — and CHECK the editor shows it (all its lines, or, when the editor shows only some, a run of them in order;
//      the leading white space aside, which the engine's auto-indent rewrites and C# does not read);
//   any check that fails starts again (4 times at most), then the check fails with that reason — it never runs a program it did not write.
// The editor is written only once it has SETTLED (the rich engine mounted, or the native editor for good); the native one is filled by its
// label and checked.

// The engine re-indents each typed line (its auto-indent, as for a typed newline); C# does not read indentation, so lines are compared
// without their leading white space — a program typed INTO the sample still differs (extra lines, or lines out of order).
const lines = text => text.replace(/\r/g, "").split("\n").map(l => l.trimStart());

/** The lines the rich editor shows, top to bottom (Monaco positions them; the DOM order is not the reading order). */
async function shownLines(view) {
  return view.evaluate(el => [...el.querySelectorAll(".view-line")]
    .map(l => ({ top: parseFloat(l.style.top) || 0, text: (l.textContent || "").replace(/\u00a0/g, " ") }))
    .sort((a, b) => a.top - b.top).map(l => l.text));
}

/** Whether the shown lines are the program: all of it, or (an editor that shows part of it) consecutive lines of it, in order. */
export function showsProgram(shown, source) {
  const want = lines(source);
  const all = shown.map(l => l.trimStart());
  const got = all.length && all.at(-1) === "" && want.at(-1) !== "" ? all.slice(0, -1) : all;
  if (got.length === want.length) return got.every((l, i) => l === want[i]);
  if (!got.length || got.length > want.length) return false;
  for (let i = 0; i + got.length <= want.length; i++) if (got.every((l, k) => l === want[i + k])) return true;
  return false;
}

/**
 * Writes `source` into the editor inside `scope` (a page or a locator around the editor). `label` names the native editor.
 * Throws when four attempts did not leave exactly the program in the editor.
 */
export async function setEditorCode(page, scope, source, { label = "كود C#", attempts = 4 } = {}) {
  // Wait for the editor to SETTLE: the rich engine mounted, or the native editor for good (data-engine-fallback names why). A native
  // editor still loading the engine is not written into — the handover could come mid-typing.
  const rich = scope.locator(".monaco-editor .view-lines");
  const settled = scope.locator('.monaco-editor .view-lines, [data-editor-engine="native"][data-engine-fallback]').first();
  await settled.waitFor({ timeout: 30000 });
  if (!(await rich.count())) {
    const box = scope.getByLabel(label);
    await box.fill(source);
    if ((await box.inputValue()) !== source) throw new Error("setEditorCode: the native editor does not hold the program");
    return;
  }
  const view = rich.first();
  let why = "";
  for (let n = 1; n <= attempts; n++) {
    await view.click();
    const focused = await view.evaluate(el => new Promise(done => {
      const editor = el.closest(".monaco-editor");
      const t0 = performance.now();
      const look = () => (editor && editor.contains(document.activeElement) ? done(true) : performance.now() - t0 > 3000 ? done(false) : requestAnimationFrame(look));
      look();
    }));
    if (!focused) { why = "the editor did not take the keyboard focus"; continue; }
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Delete");
    const left = await shownLines(view);
    if (left.some(l => l !== "")) { why = "Control+A / Delete left text in the editor (" + JSON.stringify(left.slice(0, 2)) + ")"; continue; }
    await page.keyboard.insertText(source);
    if (showsProgram(await shownLines(view), source)) return;
    why = "the editor does not show the program after typing it";
  }
  throw new Error("setEditorCode: " + why + " (" + attempts + " attempts)");
}
