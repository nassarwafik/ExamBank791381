import { questionTypeDefinition } from "../questionTypeCatalog";
import { IconChoice, IconToggle, IconText, IconLayers, IconSliders, IconCode, IconFile } from "../icons";

// Phase 21F.3 — one outline icon per question family (decorative: the type's name is always given in text next to it).
export default function StudioTypeIcon({ type, size = 15 }: { type: string; size?: number }) {
  if (type === "trueFalse" || type === "multiTrueFalse") return <IconToggle size={size} aria-hidden="true" />;
  if (type === "coding" || type === "cliFill" || type === "networkCli") return <IconCode size={size} aria-hidden="true" />;
  const d = questionTypeDefinition(type);
  switch (d?.category) {
    case "choice": return <IconChoice size={size} aria-hidden="true" />;
    case "response": return <IconText size={size} aria-hidden="true" />;
    case "structured": case "composite": return <IconLayers size={size} aria-hidden="true" />;
    case "interactive": return <IconSliders size={size} aria-hidden="true" />;
    default: return <IconFile size={size} aria-hidden="true" />;
  }
}
