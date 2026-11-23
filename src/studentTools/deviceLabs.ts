import type { CodingExecutionService } from "../coding/codingExecution";
import { CSharpToolRunError } from "./csharpToolRun";
import { deviceCSharpRun, isDesktopViewport, viaRunner } from "./deviceCSharpLab";
import { devicePythonRun } from "./devicePythonLab";

// The exam coding question's PRACTICE service (owner decisions; AGENTS.md §1 «On-device C# lab» / «On-device Python lab»): on a
// DESKTOP, C# (csharp@1) and Python (python@1) run ON THIS DEVICE on the question's visible examples — the program the official grading
// runs, with no course library; every other language (Java) goes to `remote` (the server's practice route), or is unavailable without
// it. On a phone or tablet everything is exactly as before: the server, or nothing. Practice only: a result here is never a score.
export const DEVICE_LANGUAGES = Object.freeze([{ key: "csharp", languageVersion: 1 }, { key: "python", languageVersion: 1 }] as const);
const onDevice = (key: string, version: number) => DEVICE_LANGUAGES.some(l => l.key === key && l.languageVersion === version);

export function withDeviceLabs(remote: CodingExecutionService | undefined): CodingExecutionService {
  if (!isDesktopViewport()) return remote ?? { capabilities: { available: false, languages: [] }, run: async () => { throw new CSharpToolRunError("EXECUTION_UNAVAILABLE", ""); } };
  const others = (remote?.capabilities.available ? remote.capabilities.languages : []).filter(l => !onDevice(l.key, l.languageVersion));
  return {
    capabilities: { available: true, languages: [...DEVICE_LANGUAGES.map(l => ({ ...l })), ...others] },
    async run(req, options = {}) {
      if (req.language === "csharp" && req.languageVersion === 1) {
        const result = await deviceCSharpRun(req.source, req.stdin, "", options.signal);
        // V6: a program that needs a library the lab's download leaves out (LAB0001) goes to the server, when it runs C#
        const serverCSharp = !!remote?.capabilities.available && remote.capabilities.languages.some(l => l.key === "csharp" && l.languageVersion === 1);
        return serverCSharp ? viaRunner(result, () => remote!.run(req, options), options.signal) : result;
      }
      if (req.language === "python" && req.languageVersion === 1) return devicePythonRun(req.source, req.stdin, options.signal);
      if (!remote) throw new CSharpToolRunError("EXECUTION_UNAVAILABLE", "");
      return remote.run(req, options);
    },
  };
}
