import { useContext, useMemo } from "react";
import { RichText } from "../richContent/RichPrompt";
import { resolveSectionPresentation } from "./presentationModel";
import { ResolvedPresentationContext, type SectionShell } from "./presentationRuntime";

// Phase 20D.1 — the ONE section header of a presented exam (student paged runtime AND teacher preview render this same component with the
// same props, so the markup is identical). Variant from the section-scoped resolved presentation (exam → section override); rich
// instructions when instructionsRichContent is a valid document, otherwise the plain instructions text.
type Props = { section: SectionShell; index: number; marksLabel?: string; headingLevel?: "h2" | "h3" };

export default function SectionShellHeader({ section, index, marksLabel, headingLevel = "h2" }: Props) {
  const scope = useContext(ResolvedPresentationContext);
  const variant = useMemo(() => (scope ? resolveSectionPresentation(scope.exam, section.presentation).components.sectionHeader : "plain"), [scope, section.presentation]);
  const H = headingLevel;
  const label = "القسم " + (index + 1);
  const plain = section.instructions ? <p className="xp-section-instructions">{section.instructions}</p> : null;
  return (
    <header className="xp-section-header" data-xp-slot="section-header" data-xp-variant={variant}>
      <div className="xp-section-titles">
        <span className="xp-section-eyebrow">{label}</span>
        <H className="xp-section-title">{section.title || label}</H>
      </div>
      {marksLabel && <span className="xp-section-marks">{marksLabel}</span>}
      {section.instructionsRichContent ? <RichText raw={section.instructionsRichContent} className="xp-section-instructions" fallback={plain} /> : plain}
    </header>
  );
}
