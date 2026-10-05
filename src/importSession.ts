import type { TopicOption } from "./App";
import type { ImportSessionState } from "./ImportQuestionsPanel";

// Lives in App.tsx (lifted above this component) so the whole import session - uploaded files,
// their analysis state, extracted questions, selections, duplicate-check results - survives the
// teacher navigating away to the Exam Draft and back, instead of being lost on unmount. See the
// "Import Session persistence" requirement this was built for.
export function createEmptyImportSession(topicsCatalog: TopicOption[] = []): ImportSessionState {
  return {
    files: [],
    pool: [],
    selectedIds: [],
    filterSourceFile: "",
    filterTopic: "",
    filterDifficulty: 0,
    filterType: "",
    minConfidence: 0,
    effectiveTopics: topicsCatalog,
    duplicates: {},
    duplicateDecisions: {},
    unassignedAssets: []
  };
}
