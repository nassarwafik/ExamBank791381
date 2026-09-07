// Pure helper for the Track report's track selection: keep the current track only if it still exists
// among the available tracks; otherwise fall back (to the server-provided default, else the first).
export function resolveTrack(current: string, available: string[], fallback: string): string {
  if (current && available.includes(current)) return current;
  if (fallback && available.includes(fallback)) return fallback;
  return available[0] || "";
}
