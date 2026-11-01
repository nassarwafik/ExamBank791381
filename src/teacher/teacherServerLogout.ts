// Tadris+ P2-A2b — «تسجيل الخروج» also ends the session on the SERVER (P2-A2a /api/teacher-session/logout). For a managed teacher
// account the same token is refused from the next request; an older (v2) session has no server-side id and the call is harmless.
// Fire-and-forget with keepalive: signing out never waits on the network and never fails because of it — the browser forgets
// the token right after, exactly as before. Called ONLY from the user's own sign-out, never from a 401 / expiry path.
export function endTeacherServerSession(token: string): void {
  if (!token) return;
  try {
    void fetch("/api/teacher-session/logout", {
      method: "POST",
      headers: { "x-builder-token": token, "Content-Type": "application/json" },
      body: "{}",
      keepalive: true,
      cache: "no-store",
      credentials: "same-origin"
    }).catch(() => { /* the local sign-out proceeds regardless */ });
  } catch {
    // fetch unavailable: the local sign-out proceeds regardless
  }
}
