import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../design-tokens.css";
import "../design-tokens-dark.css";
import "../fonts.css";
import "../index.css";
import "../studentTools/studentTools.css";
import "./offlineLab.css";
import labFrame from "../../tools/csharp-lab/wwwroot/main.js?raw";
import { inlineLabFrame } from "../studentTools/deviceCSharpLab";
import { registerServiceWorker } from "../pwa/registerServiceWorker";
import OfflineLabPage from "./OfflineLabPage";

// Visual lab V14 (docs/enterprise-csharp-visual-lab-plan.md §24) — the offline C# lab page (lab.html). Its lab frame is written from
// text (main.js, byte for byte: this page's policy allows exactly its hash — scripts/content-security-policy.ts) so it starts offline.
inlineLabFrame(labFrame);
registerServiceWorker();
createRoot(document.getElementById("root")!).render(<StrictMode><OfflineLabPage /></StrictMode>);
