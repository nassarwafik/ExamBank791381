// Tadris+ P10-E — a per-instance cap on concurrent heavy password checks for the owner's sign-in (closes security review O3;
// design docs/enterprise-owner-login-cost-p10e.md, owner decisions §19.41: owner sign-in only, at most 2 at a time).
//
// One owner password check is scrypt with N = 2^17 (~128 MiB, ~0.4 s on the shared libuv pool). Without a cap, a flood of
// sign-ins with random usernames — each a fresh limit bucket — runs that work for every request at once and can exhaust the
// instance. The cap is in memory on purpose: the harm is to THIS instance's memory and threads, and a shared counter in
// storage would add reads, writes and conflicts under the very flood it guards against. Every instance has its own cap.
//
//   tryAcquire()        → a release function, or null when the cap is full (never waits)
//   acquire(timeoutMs)  → a release function, or null after waiting up to timeoutMs for a slot (FIFO)
//   inUse()             → slots currently held (tests and diagnostics)
// A release function is idempotent; callers release in `finally`, so a slot is never left held.

const MAX_CONCURRENT_OWNER_PASSWORD_CHECKS = 2;

function createHeavyCheckGate(max = MAX_CONCURRENT_OWNER_PASSWORD_CHECKS) {
  const limit = Number.isInteger(max) && max > 0 ? max : 1;
  let busy = 0;
  const waiters = [];

  function lease() {
    busy += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = waiters.shift();
      if (next) { clearTimeout(next.timer); next.resolve(handOver()); }   // the slot passes straight to the next waiter
      else busy -= 1;
    };
  }
  // A slot handed from a releasing holder to a waiter: `busy` is unchanged, the waiter gets a fresh idempotent release.
  function handOver() { busy -= 1; return lease(); }

  return {
    tryAcquire() { return busy < limit ? lease() : null; },
    acquire(timeoutMs = 2000) {
      if (busy < limit) return Promise.resolve(lease());
      return new Promise(resolve => {
        const waiter = { resolve, timer: null };
        waiter.timer = setTimeout(() => {
          const i = waiters.indexOf(waiter);
          if (i >= 0) waiters.splice(i, 1);
          resolve(null);
        }, Math.max(0, Number(timeoutMs) || 0));
        waiters.push(waiter);
      });
    },
    inUse() { return busy; }
  };
}

const ownerPasswordGate = createHeavyCheckGate(MAX_CONCURRENT_OWNER_PASSWORD_CHECKS);

module.exports = { MAX_CONCURRENT_OWNER_PASSWORD_CHECKS, createHeavyCheckGate, ownerPasswordGate };
