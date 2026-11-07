// Tadris+ QR-3 — the student's «تسجيل الخروج» also ends the session on the SERVER (/api/session-devices/logout), so the same token
// is refused from the next request and the device leaves «الأجهزة المرتبطة». Like the teacher's (P2-A2b): fire-and-forget with
// keepalive, read from this tab's session storage; signing out never waits on the network and never fails because of it. Called
// ONLY from the student's own sign-out button, never from a 401 / expiry path. A session from before QR-3 has nothing recorded: harmless.
export function endStudentServerSession(): void {
  let token = "";
  try { token = sessionStorage.getItem("examBankBuilderToken") || ""; } catch { token = ""; }
  if (!token) return;
  try {
    void fetch("/api/session-devices/logout", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: "{}",
      keepalive: true,
      cache: "no-store",
      credentials: "same-origin"
    }).catch(() => { /* the local sign-out proceeds regardless */ });
  } catch {
    // fetch unavailable: the local sign-out proceeds regardless
  }
}
