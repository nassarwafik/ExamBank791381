"use strict";
// Phase 17B review fix — REAL Docker proof that the RUNTIME memory ceiling of a sandbox is derived from the question's
// authoritative memoryMb (+ a fixed, documented runtime overhead) and NOT from the compiler's allowance. Managed-heap limits
// (JVM -Xmx, .NET GCHeapHardLimit) bound only the managed heap: a hostile program can still start a CHILD PROCESS or allocate
// NATIVE memory. Only the container's cgroup ceiling bounds the whole process tree, so these tests attack exactly that:
//   RF1 Java child process · RF2 C# child process · RF3 C# unmanaged allocation · RF-C cgroup ceiling read from INSIDE the
//   student program (runtime ceiling < old compile ceiling) · RF4 / RF5 normal programs still work · RF6 compilation keeps a
//   bounded compile allowance that the program never gets · RF7 no sandbox container and no gateway host write left behind in
//   any outcome.
// RF7 proves what the runner OWNS: (a) `docker ps -a --filter label=…` (and the sa-coding-* name) is empty after every outcome,
// (b) the gateway process performs no host-filesystem write / temp call while the real executions run (the artifact stays in
// gateway memory, see tests/helpers/host-fs-guard.js). It no longer diffs the host's whole os.tmpdir(): on a shared CI host
// systemd / apport / Docker / the Actions runner create temp entries of their own (main run 36840521927 failed on a
// `systemd-private-…-apport-coredump-hook@…` directory that no SmartAssess code created).
// Requires Docker and the built worker images (a missing daemon / image FAILS).
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { installHostWriteGuard } = require("../helpers/host-fs-guard.js");
const hostWrites = installHostWriteGuard();            // BEFORE the gateway module loads, so even destructured fs imports are wrapped
const { createDockerSandbox } = require("../../gateway/sandbox.js");
const { resolveLanguage } = require("../../gateway/registry.js");

const MB = 1024 * 1024;
const CHILD_MB = 480;                              // far above the 64 MB budget, below the OLD compile ceilings (768 / 1024 MB)
const OLD_COMPILE_CEILING_MB = { java: 768, csharp: 1024 };
const LOW = { timeMs: 8000, memoryMb: 64, outputBytes: 8192 };
const sandbox = createDockerSandbox();
let n = 0;
const run = (language, source, limits = {}, stdin = "") => sandbox.run(resolveLanguage(language, 1), { requestId: "req_mem_" + (++n), language, languageVersion: 1, source, stdin, limits: { ...LOW, ...limits } });
const orphans = () => spawnSync("docker", ["ps", "-aq", "--filter", "label=smartassess.coding-runner=1"], { encoding: "utf8" }).stdout.trim();
const namedLeftovers = () => spawnSync("docker", ["ps", "-a", "--filter", "name=^sa-coding-", "--format", "{{.Names}}"], { encoding: "utf8" }).stdout.trim();
const childPy = "x = b'x' * (" + CHILD_MB + " * 1024 * 1024); print('CHILD-ALLOCATED', len(x) // 1048576)";

// The cgroup memory ceiling as the STUDENT PROGRAM sees it (cgroup v2: memory.max, v1: memory.limit_in_bytes).
const JAVA_CEILING = "import java.nio.file.*;\npublic class Main { public static void main(String[] a) throws Exception {\n  for (String f : new String[] { \"/sys/fs/cgroup/memory.max\", \"/sys/fs/cgroup/memory/memory.limit_in_bytes\" }) { Path p = Paths.get(f); if (Files.exists(p)) { System.out.println(\"CEILING=\" + Files.readString(p).trim()); return; } }\n  System.out.println(\"CEILING=unknown\"); } }\n";
const CS_CEILING = "foreach (var f in new[] { \"/sys/fs/cgroup/memory.max\", \"/sys/fs/cgroup/memory/memory.limit_in_bytes\" }) { if (File.Exists(f)) { Console.WriteLine(\"CEILING=\" + File.ReadAllText(f).Trim()); return; } }\nConsole.WriteLine(\"CEILING=unknown\");\n";
const PY_CEILING = "import os\nfor f in ('/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes'):\n    if os.path.exists(f):\n        print('CEILING=' + open(f).read().strip()); break\nelse:\n    print('CEILING=unknown')\n";
const ceilingOf = r => { const m = /CEILING=(\d+)/.exec(r.stdout); assert.ok(m, "no numeric cgroup ceiling in: " + JSON.stringify(r)); return Number(m[1]); };

test("preflight: Docker and the java / csharp / python worker images exist", () => {
  assert.equal(spawnSync("docker", ["version"], { encoding: "utf8" }).status, 0, "docker daemon unreachable");
  for (const l of ["python", "java", "csharp"]) assert.equal(spawnSync("docker", ["image", "inspect", resolveLanguage(l, 1).image]).status, 0, "missing image for " + l);
});

test("RF-C runtime cgroup ceiling seen by the student program is derived from memoryMb, far below the old compile ceiling", async () => {
  for (const [language, source] of [["java", JAVA_CEILING], ["csharp", CS_CEILING], ["python", PY_CEILING]]) {
    const r = await run(language, source);
    assert.equal(r.status, "success", language + ": " + r.stderr);
    const ceiling = ceilingOf(r);
    const entry = resolveLanguage(language, 1);
    assert.equal(ceiling, (LOW.memoryMb + entry.runtimeOverheadMb) * MB, language + " runtime ceiling must be exactly memoryMb + runtimeOverheadMb");
    if (OLD_COMPILE_CEILING_MB[language]) assert.ok(ceiling < OLD_COMPILE_CEILING_MB[language] * MB, language + ": runtime ceiling " + ceiling + " is not below the old compile ceiling");
    assert.ok(ceiling < entry.compileMemoryMb * MB || !OLD_COMPILE_CEILING_MB[language], language + ": runtime ceiling must be below the compile allowance");
  }
});

test("RF1 Java: a child process cannot allocate far beyond the question's 64 MB (no allocation-success sentinel)", async () => {
  const src = "public class Main { public static void main(String[] a) throws Exception {\n  Process p = new ProcessBuilder(\"/usr/local/bin/python3\", \"-c\", \"" + childPy.replace(/"/g, "\\\"") + "\").redirectErrorStream(true).start();\n  String out = new String(p.getInputStream().readAllBytes());\n  System.out.println(\"child-exit=\" + p.waitFor());\n  System.out.print(out); } }\n";
  const r = await run("java", src);
  assert.doesNotMatch(r.stdout, /CHILD-ALLOCATED/, "Java child reached the allocation sentinel: " + JSON.stringify(r).slice(0, 400));
  assert.equal(orphans(), "");
});

test("RF2 C#: a System.Diagnostics.Process child cannot allocate far beyond the question's 64 MB", async () => {
  const src = "var psi = new System.Diagnostics.ProcessStartInfo(\"/usr/local/bin/python3\") { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };\npsi.ArgumentList.Add(\"-c\"); psi.ArgumentList.Add(" + JSON.stringify(childPy) + ");\nusing var p = System.Diagnostics.Process.Start(psi)!;\nvar o = p.StandardOutput.ReadToEnd(); p.WaitForExit();\nConsole.WriteLine(\"child-exit=\" + p.ExitCode); Console.Write(o);\n";
  const r = await run("csharp", src);
  assert.doesNotMatch(r.stdout, /CHILD-ALLOCATED/, "C# child reached the allocation sentinel: " + JSON.stringify(r).slice(0, 400));
  assert.equal(orphans(), "");
});

test("RF3 C#: unmanaged (native) memory cannot be consumed far beyond the question's 64 MB", async () => {
  const src = "long n = " + CHILD_MB + "L * 1024 * 1024;\nvar p = System.Runtime.InteropServices.Marshal.AllocHGlobal((IntPtr)n);\nfor (int i = 0; i < n; i += 4096) System.Runtime.InteropServices.Marshal.WriteByte(p, i, 1);\nConsole.WriteLine(\"NATIVE-ALLOCATED \" + (n / 1048576));\n";
  const r = await run("csharp", src);
  assert.doesNotMatch(r.stdout, /NATIVE-ALLOCATED/, "C# native allocation reached the sentinel: " + JSON.stringify(r).slice(0, 400));
  assert.notEqual(r.status, "success");
  assert.equal(orphans(), "");
});

test("RF4 Java: a normal program within its 64 MB limit compiles and runs", async () => {
  const r = await run("java", "import java.util.*;\npublic class Main { public static void main(String[] a) { Scanner s = new Scanner(System.in); int k = s.nextInt(); long[] big = new long[4 * 1024 * 1024]; for (int i = 0; i < big.length; i++) big[i] = i % k; long t = 0; for (long v : big) t += v; System.out.println(t); } }\n", {}, "7\n");
  assert.equal(r.status, "success", r.stderr);
  assert.equal(r.stdout, "12582907\n");
});

test("RF5 C#: a normal program within its 64 MB limit compiles and runs", async () => {
  const r = await run("csharp", "int k = int.Parse(Console.ReadLine()!);\nvar big = new long[4 * 1024 * 1024];\nfor (int i = 0; i < big.Length; i++) big[i] = i % k;\nlong t = 0; foreach (var v in big) t += v;\nConsole.WriteLine(t);\n", {}, "7\n");
  assert.equal(r.status, "success", r.stderr);
  assert.equal(r.stdout, "12582907\n");
});

test("RF6 compilation keeps its bounded compile allowance at the platform's MINIMUM memoryMb (16), which the program never gets", async () => {
  const javaMethods = Array.from({ length: 400 }, (_, i) => "  static int f" + i + "(int x) { return x + " + i + "; }").join("\n");
  const java = await run("java", "import java.nio.file.*;\npublic class Main {\n" + javaMethods + "\n  public static void main(String[] a) throws Exception { int s = 0; for (int i = 0; i < 400; i++) s += (int) Main.class.getDeclaredMethod(\"f\" + i, int.class).invoke(null, 1); System.out.println(s);\n    for (String f : new String[] { \"/sys/fs/cgroup/memory.max\", \"/sys/fs/cgroup/memory/memory.limit_in_bytes\" }) { Path p = Paths.get(f); if (Files.exists(p)) { System.out.println(\"CEILING=\" + Files.readString(p).trim()); return; } } } }\n", { memoryMb: 16 });
  assert.equal(java.status, "success", java.stderr);
  assert.match(java.stdout, /^80200\n/);
  assert.ok(ceilingOf(java) < resolveLanguage("java", 1).compileMemoryMb * MB);
  const csMethods = Array.from({ length: 400 }, (_, i) => "  public static int F" + i + "(int x) => x + " + i + ";").join("\n");
  const cs = await run("csharp", "class Program {\n" + csMethods + "\n  static void Main() { int s = 0; foreach (var m in typeof(Program).GetMethods()) if (m.Name.StartsWith(\"F\")) s += (int)m.Invoke(null, new object[] { 1 })!; Console.WriteLine(s);\n  foreach (var f in new[] { \"/sys/fs/cgroup/memory.max\", \"/sys/fs/cgroup/memory/memory.limit_in_bytes\" }) { if (File.Exists(f)) { Console.WriteLine(\"CEILING=\" + File.ReadAllText(f).Trim()); return; } } } }\n", { memoryMb: 16 });
  assert.equal(cs.status, "success", cs.stderr);
  assert.match(cs.stdout, /^80200\n/);
  assert.ok(ceilingOf(cs) < resolveLanguage("csharp", 1).compileMemoryMb * MB);
});

test("RF8 the fixed runtime overhead is sufficient: each language can use 80 % of memoryMb (256 and 512) inside its runtime ceiling", async () => {
  for (const mem of [256, 512]) {
    const fill = Math.floor(mem * 0.8);
    const java = await run("java", "public class Main { public static void main(String[] a) { byte[][] h = new byte[" + fill + "][]; for (int i = 0; i < h.length; i++) { h[i] = new byte[1 << 20]; h[i][4096] = 1; } System.out.println(\"OK \" + h.length); } }\n", { memoryMb: mem });
    const cs = await run("csharp", "var l = new System.Collections.Generic.List<byte[]>(); for (int i = 0; i < " + fill + "; i++) { var b = new byte[1 << 20]; for (int k = 0; k < b.Length; k += 4096) b[k] = 1; l.Add(b); } Console.WriteLine(\"OK \" + l.Count);\n", { memoryMb: mem });
    const py = await run("python", "x = [bytearray(b'x' * (1 << 20)) for _ in range(" + fill + ")]\nprint('OK', len(x))\n", { memoryMb: mem });
    for (const [l, r] of [["java", java], ["csharp", cs], ["python", py]]) { assert.equal(r.status, "success", l + "@" + mem + ": " + r.stderr.slice(0, 300)); assert.equal(r.stdout, "OK " + fill + "\n"); }
  }
});

test("RF7 no sandbox container and no gateway host write is left behind after success, memory failure, timeout and compile failure", async () => {
  const cases = [
    ["java", "public class Main { public static void main(String[] a) { System.out.println(1); } }\n", {}, "success"],
    ["csharp", "var l = new System.Collections.Generic.List<byte[]>(); while (true) l.Add(new byte[1 << 20]);\n", {}, "runtime-error"],
    ["java", "public class Main { public static void main(String[] a) { while (true) {} } }\n", { timeMs: 1000 }, "timeout"],
    ["csharp", "int x = ;\n", {}, "compile-error"],
    ["java", "public class Main { int x = ; }\n", {}, "compile-error"]
  ];
  assert.equal(orphans(), "", "labelled sandbox containers already present before RF7"); assert.equal(namedLeftovers(), "");
  hostWrites.reset();                                   // the ownership-scoped window: what THIS gateway process does from here on
  const statuses = [];
  for (const [language, source, limits, expected] of cases) {
    statuses.push((await run(language, source, limits)).status);
    // (a) runtime cleanup, after EVERY outcome: no container carries the runner label or the sandbox name prefix
    assert.equal(orphans(), "", "labelled sandbox container left behind after " + expected + " (" + language + ")");
    assert.equal(namedLeftovers(), "", "sa-coding-* container left behind after " + expected + " (" + language + ")");
  }
  assert.deepEqual(statuses, cases.map(c => c[3]));
  // (b) host filesystem: the gateway wrote nothing to the host while compiling / running — the artifact stayed in memory
  assert.deepEqual(hostWrites.summary(), [], "the gateway touched the host filesystem during real executions");
});
