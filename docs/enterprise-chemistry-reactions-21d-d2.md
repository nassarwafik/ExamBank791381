# Phase 21D-D.2 — Chemistry Reactions & Equations SmartSim

Status: IN PROGRESS; not certified and not authorized to merge.

## Purpose
Introduce `chemistryReactions@1` through the established trusted SmartSim plugin contract. Reuse D.1's shared chemistry formula parser and catalog. Never create an alternative grading authority or question type.

## Initial committed foundation
- `src/chemistry/reactions.ts`: strict reaction schema with explicit charge per term, canonical known-element formulas, bounded terms and coefficients.
- Exact `BigInt` atom-by-atom and net-charge conservation checks, returning deterministic imbalances without trusting client state.
- `src/chemistry/reactions.21dd2.test.ts`: nine fail/pass cases for atom, charge, formula grammar, count boundaries and inventory mismatches.

## Scientific semantics to maintain
- Stoichiometric coefficients are positive integers; subscripts in chemical formulas are never changed to balance an equation.
- Total counts of **each** element must match left to right.
- Net charge is independently conserved in ionic reactions.
- A balanced equation is not necessarily a chemically feasible reaction: this engine verifies conservation, **not** thermodynamics, kinetics, or reaction occurrence.
- For educational reactions, provide known curated examples with scientifically sourced annotations; never auto-invent reaction products.
- Explicit per-species charges do not yet represent electron bookkeeping, half-reactions, phase or aqueous dissociation.
- Hydrate-dot formula parsing belongs to D.1; the author must verify its suitability for any chosen reaction.

## Remaining work before PR can be reviewed for merge
1. Add a pure, bounded, deterministic smallest-positive-integer coefficient solver (rational elimination and ambiguity policy). Derive expected values only on the server.
2. Build strict `chemistryReactions@1` configuration, actions, replay, checks and code-owned plugin registration, following D.1's exact trusted contract.
3. Build lazy RTL teacher editor and student reaction workspace, with molecule/atom representations and an accessible text/table alternative; include interactive visual balancing.
4. Add authoring templates for neutral and ionic equations, reaction-family classifications, and clearly labeled representations of atom conservation.
5. Extend shared server finalization and verify fixture drift, hidden grading targets and spoofed actions.
6. Add acceptance exam, Chromium desktop/mobile/keyboard tests, property-based validation, and targeted mutation tests.
7. Run lint, TypeScript typecheck, build/bundle guard, all tests, CI, independent review. Owner merge only.

## Known follow-ups
- Numeric grading tolerance in the D.1 plugin is too permissive for poorly configured teacher checks. Handle separately or address with dedicated policy and tests before D.2 ships.
- AuditHistoryPanel focus race is a separate hotfix and must not be buried in chemistry changes.
