"use strict";
// Phase 17F-A1.1 (M1) — pure reader of /proc/self/mountinfo for the deployment preflight: the DEVICE identity of the three
// storage roles (OS disk "/", journal disk RUNNER_JOURNAL_DIR, Docker disk DockerRootDir).
//
// A mount point alone proves nothing about the disk beneath it: `mount --bind /srv/journal /data/smartassess-runner` makes the
// journal path a mount point in /proc/mounts (and `df` / fs.stat().dev report it like any filesystem) while every byte still
// lands on the OS disk. mountinfo (proc(5)) exposes what /proc/mounts hides: the filesystem's major:minor device and the
// mount's ROOT inside that filesystem ("/" for a filesystem mount, a sub-path for a bind mount).
//
//   ID PARENT MAJ:MIN ROOT MOUNTPOINT OPTIONS [OPTIONAL…] - FSTYPE SOURCE SUPEROPTIONS
//
// Paths escape space / tab / newline / backslash as \040 \011 \012 \134. Pure functions, no I/O, no process; the preflight
// injects the text so the tests cover every host shape without a real disk.
const path = require("node:path");

const unescapeMount = s => s.replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
const normalizeDir = p => { if (typeof p !== "string" || !p.trim() || !p.startsWith("/")) return null; const n = path.posix.normalize(p.trim()); return n.length > 1 ? n.replace(/\/+$/, "") : n; };

/** mountinfo text → { entries: [{ mountId, parentId, device "MAJ:MIN", major, minor, root, mountPoint, options, optional[], fsType, source, superOptions }], malformed: n } — never throws. */
function parseMountInfo(text) {
  const entries = [];
  let malformed = 0;
  if (typeof text !== "string") return { entries, malformed };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const sep = line.indexOf(" - ");
    if (sep < 0) { malformed++; continue; }
    const left = line.slice(0, sep).split(" ").filter(Boolean);
    const right = line.slice(sep + 3).split(" ").filter(Boolean);
    const dev = /^(\d+):(\d+)$/.exec(left[2] || "");
    if (left.length < 6 || right.length < 3 || !/^\d+$/.test(left[0]) || !/^\d+$/.test(left[1]) || !dev) { malformed++; continue; }
    const root = unescapeMount(left[3]), mountPoint = unescapeMount(left[4]);
    // The mount point is always an absolute path. The ROOT is a path for a filesystem / bind mount but an opaque token for
    // pseudo filesystems — Docker bind-mounts every container network namespace as `nsfs` with root `net:[<inode>]` under
    // /run/docker/netns/<id> — so a non-path root is valid, never malformed (17F-A1.1 review fix MAJOR-1: a production host
    // WITH running containers must not exit 22). storageSeparation still requires root === "/" for the JOURNAL mount itself.
    if (!root || !mountPoint.startsWith("/")) { malformed++; continue; }
    entries.push({ mountId: Number(left[0]), parentId: Number(left[1]), device: left[2], major: Number(dev[1]), minor: Number(dev[2]), root, mountPoint, options: left[5], optional: left.slice(6), fsType: right[0], source: unescapeMount(right[1]), superOptions: right.slice(2).join(" ") });
  }
  return { entries, malformed };
}

/** The mount that holds `p`: the longest mount point that is `p` itself or a path-boundary prefix of it; on equal length the LATER entry (an overmount) wins. */
function mountOf(entries, p) {
  const target = normalizeDir(p);
  if (!target) return null;
  let best = null;
  for (const e of entries) {
    const mp = e.mountPoint;
    const covers = mp === "/" || target === mp || target.startsWith(mp.endsWith("/") ? mp : mp + "/");
    if (covers && (!best || mp.length >= best.mountPoint.length)) best = e;
  }
  return best;
}

/**
 * Judges the three storage roles from mountinfo text → { ok, reason, devices: { root, journal, docker } | null }. Fails CLOSED:
 * unreadable / malformed / root-less mountinfo, an unknown Docker root dir, a journal path that is not its own filesystem mount
 * (bind mounts included) and any two roles on one device are refused. The reason is an operator sentence, never a mount table.
 */
function storageSeparation({ mountInfo, journalDir, dockerRootDir }) {
  const no = reason => ({ ok: false, reason, devices: null });
  if (typeof mountInfo !== "string") return no("cannot read /proc/self/mountinfo — storage devices unknown, refusing to start");
  const { entries, malformed } = parseMountInfo(mountInfo);
  if (malformed) return no("/proc/self/mountinfo has " + malformed + " malformed line(s) — storage devices unknown, refusing to start");
  const root = entries.filter(e => e.mountPoint === "/").pop();
  if (!root) return no("/proc/self/mountinfo has no root mount — storage devices unknown, refusing to start");
  const jdir = normalizeDir(journalDir);
  if (!jdir) return no("Journal storage must be on a dedicated device separate from the OS disk: journal directory unknown");
  const j = mountOf(entries, jdir);
  if (!j || j.mountPoint !== jdir) return no("Journal storage must be on a dedicated device separate from the OS disk: " + jdir + " is not a mount point (it lives on " + (j ? j.mountPoint : "?") + ")");
  if (j.root !== "/") return no("Journal storage must be on a dedicated device separate from the OS disk: " + jdir + " is a bind mount (of " + j.root + "), not the filesystem mount of its own device");
  if (j.device === root.device) return no("Journal storage must be on a dedicated device separate from the OS disk.");
  const ddir = normalizeDir(dockerRootDir);
  if (!ddir) return no("Docker storage must be mounted on a dedicated device separate from the OS disk: Docker root directory unknown");
  const dk = mountOf(entries, ddir);
  if (!dk || dk.device === root.device) return no("Docker storage must be mounted on a dedicated device separate from the OS disk.");
  if (dk.device === j.device) return no("Journal and Docker storage must not share the same backing device.");
  return { ok: true, reason: "OS, journal and Docker storage are on three distinct devices (" + root.device + ", " + j.device + ", " + dk.device + ")", devices: { root: root.device, journal: j.device, docker: dk.device } };
}

module.exports = { parseMountInfo, mountOf, storageSeparation, unescapeMount };
