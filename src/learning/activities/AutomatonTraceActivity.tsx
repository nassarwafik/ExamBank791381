import { useMemo } from "react";
import type { LearningActivityProps } from "./engine";
import { gridLayout, readAutomatonConfig } from "./automaton";
import { buildScene } from "./automatonScene";
import { AutomatonPlayer } from "./AutomatonPlayer";

/**
 * AUTO-A1 (docs/enterprise-automata-simulator-a1.md) — `simulation / automaton-trace / v1`: «تتبّع الآلة خطوة بخطوة».
 *
 * The learner writes a word (by keyboard, or with one button per alphabet symbol on a phone) or taps an example word, then walks
 * through the run one step at a time:
 *   • the state diagram with the current state(s) lit and the arrow just used marked (an NFA lights every possible state);
 *   • the word with the symbols already read;
 *   • the stack beside it for a push-down automaton, the tape and its head for a Turing machine;
 *   • one Arabic sentence per step, and at the end «مقبولة» / «مرفوضة» in words (never by colour alone);
 *   • the transition table (an accessible equivalent of the drawing), the moves of this step marked.
 * The machine is data (automaton.ts reads and runs it); nothing from content is executed. No timers, no network, no persistence:
 * the shell's reset returns to the block's first word and step.
 */
// The player itself (the word, the steps, the drawing, the stack / tape, the table) is AutomatonPlayer.tsx, shared with the automata
// lab tool (AUTO-A4). The shell's «إعادة تعيين» remounts it (its key), which returns to the block's first word and step.

export default function AutomatonTraceActivity({ block, commands, emit, reducedMotion }: LearningActivityProps) {
  const cfg = useMemo(() => readAutomatonConfig(block.config), [block.config]);
  const scene = useMemo(() => (cfg ? buildScene(cfg.machine, gridLayout(cfg.machine, cfg.layout)) : null), [cfg]);
  if (!cfg || !scene) return <p className="learning-automaton-empty" role="note">هذا النشاط التفاعلي غير متوفر حاليًا.</p>;
  return (
    <AutomatonPlayer key={commands.reset} machine={cfg.machine} scene={scene} words={cfg.words} initialWord={cfg.word} reducedMotion={reducedMotion}
      onStep={(step, of) => emit({ type: "interaction", activityId: block.id, name: "automaton-step", detail: { step, of } })}
      onRun={(length, verdict) => emit({ type: "interaction", activityId: block.id, name: "automaton-run", detail: { length, verdict } })} />
  );
}
