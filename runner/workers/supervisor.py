"""SmartAssess coding sandbox supervisor (Phase 17B).

Runs INSIDE one disposable sandbox container as PID 1 and as the unprivileged sandbox user (uid 10001). It is the image
ENTRYPOINT; the gateway never passes a command or arguments. Every execution uses at most TWO separate sandboxes:

  phase "compile" (only for toolchains with a "compile" step — Java, C#): a COMPILE sandbox whose memory ceiling is the
      compiler's fixed allowance. It compiles the source with the trusted toolchain compiler and NEVER runs student code.
          stdin : {"phase":"compile", "source": str, "stdin": "", "limits": {...}}
          stdout: {"status":"compiled", "artifact":[{"path": rel, "data": base64}]}  or a "compile-error" result
  phase "run": a RUNTIME sandbox whose cgroup memory ceiling is derived ONLY from the question's memoryMb (+ a fixed runtime
      overhead). It receives either the source (no compile step: Python, after a syntax check) or the bounded compiled
      artifact (Java, C#) — never compiles — and runs the program.
          stdin : {"phase":"run", "source"|"artifact": …, "stdin": str, "limits": {...}}
          stdout: {"status", "stdout", "stderr", "exitCode"?, "durationMs"?}

What it does, data-driven by /opt/runner/toolchain.json (fixed at image build; no language branches here):
  1. writes the source / artifact to the tmpfs workspace (the only writable places are the tmpfs /workspace and /tmp, both
     noexec); artifact paths are validated (relative, safe characters, bounded count and size, no links);
  2. compile phase: compiles (bounded time; failure -> "compile-error" with the bounded compiler diagnostics) and returns
     the bounded artifact; run phase: optional syntax check, then runs the program with the job's stdin, in a new session,
     with rlimits (no core dumps, bounded file size / open files, optional address-space limit, CPU-time backstop) and
     oom_score_adj=1000 (the kernel kills the program, not the supervisor);
  3. reads stdout / stderr WHILE the program runs and stops it at the output cap ("output-limit") or at the time limit
     ("timeout"); kills the whole process group; reports "success" / "runtime-error" from the exit status.
The supervisor marks itself non-dumpable so the (same-uid) student program cannot open its /proc file descriptors or memory.
Output is decoded as UTF-8 after a cut that never splits a multi-byte sequence.
"""
import base64
import codecs
import ctypes
import json
import os
import re
import resource
import selectors
import signal
import subprocess
import sys
import time

TOOLCHAIN_PATH = "/opt/runner/toolchain.json"
WORKSPACE = "/workspace"
MAX_JOB_BYTES = 16 * 1024 * 1024
ARTIFACT_MAX_FILES = 256
ARTIFACT_MAX_BYTES = 8 * 1024 * 1024
ARTIFACT_SEGMENT = re.compile(r"^[A-Za-z0-9_$][A-Za-z0-9_$.-]{0,127}$")
SOURCE_MAX_BYTES = 64 * 1024
STDIN_MAX_BYTES = 16 * 1024
STDERR_MAX_BYTES = 64 * 1024
COMPILE_OUTPUT_MAX_BYTES = 32 * 1024
FILE_SIZE_LIMIT = 16 * 1024 * 1024
CHILD_ENV_BASE = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": "/tmp", "TMPDIR": "/tmp", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"}
BOUNDS = {"timeMs": (250, 10000), "memoryMb": (16, 512), "outputBytes": (1024, 262144), "compileTimeoutMs": (1000, 30000)}


def emit(result):
    sys.stdout.write(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def internal_error():
    emit({"status": "internal-error", "stdout": "", "stderr": ""})
    sys.exit(0)


def make_non_dumpable():
    try:
        ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0)  # PR_SET_DUMPABLE = 4
    except Exception:
        internal_error()


def utf8_text(data, cap):
    """The longest prefix of data within cap bytes that is complete UTF-8 (invalid bytes become U+FFFD)."""
    decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
    return decoder.decode(data[:cap], final=False)


def safe_relpath(rel):
    """A relative artifact path made only of safe segments (no absolute path, no '..', no empty segment), else None."""
    if not isinstance(rel, str) or len(rel) > 512:
        return None
    parts = rel.split("/")
    if len(parts) > 16 or any(not ARTIFACT_SEGMENT.match(p) or p in (".", "..") for p in parts):
        return None
    return parts


def read_job(toolchain):
    raw = sys.stdin.buffer.read(MAX_JOB_BYTES + 1)
    if len(raw) > MAX_JOB_BYTES:
        internal_error()
    job = json.loads(raw.decode("utf-8"))
    if not isinstance(job, dict) or job.get("phase") not in ("compile", "run") or not isinstance(job.get("stdin"), str):
        internal_error()
    if len(job["stdin"].encode("utf-8")) > STDIN_MAX_BYTES:
        internal_error()
    compiled = bool(toolchain.get("compile"))
    if job["phase"] == "compile" or not compiled:
        # the source goes to the compile sandbox (compiled toolchains) or straight to the runtime sandbox (interpreted ones)
        if job["phase"] == "compile" and not compiled:
            internal_error()
        if not isinstance(job.get("source"), str) or len(job["source"].encode("utf-8")) > SOURCE_MAX_BYTES or "artifact" in job:
            internal_error()
    else:
        # a compiled toolchain's runtime sandbox gets ONLY the artifact — it never compiles and never sees the source
        if "source" in job or not isinstance(job.get("artifact"), list):
            internal_error()
    limits = job.get("limits")
    if not isinstance(limits, dict):
        internal_error()
    for name, (lo, hi) in BOUNDS.items():
        value = limits.get(name)
        if not isinstance(value, int) or isinstance(value, bool) or value < lo or value > hi:
            internal_error()
    return job, limits


def collect_artifact(directory):
    """The compiled output as [{path, data}] — regular files only, safe names, bounded count / size; anything else fails."""
    files, total = [], 0
    for root, dirs, names in os.walk(directory, followlinks=False):
        for d in dirs:
            if os.path.islink(os.path.join(root, d)):
                return None
        for name in sorted(names):
            full = os.path.join(root, name)
            if os.path.islink(full) or not os.path.isfile(full):
                return None
            rel = os.path.relpath(full, directory).replace(os.sep, "/")
            if safe_relpath(rel) is None:
                return None
            with open(full, "rb") as f:
                data = f.read(ARTIFACT_MAX_BYTES + 1)
            total += len(data)
            if total > ARTIFACT_MAX_BYTES or len(files) >= ARTIFACT_MAX_FILES:
                return None
            files.append({"path": rel, "data": base64.b64encode(data).decode("ascii")})
    return files if files else None


def write_artifact(directory, artifact):
    """Re-validates and writes the artifact into the runtime workspace (exclusive creation, no links). False on any violation."""
    if not isinstance(artifact, list) or not artifact or len(artifact) > ARTIFACT_MAX_FILES:
        return False
    total = 0
    for entry in artifact:
        if not isinstance(entry, dict) or set(entry) != {"path", "data"} or not isinstance(entry["data"], str):
            return False
        parts = safe_relpath(entry["path"])
        if parts is None:
            return False
        try:
            data = base64.b64decode(entry["data"], validate=True)
        except (ValueError, TypeError):
            return False
        total += len(data)
        if total > ARTIFACT_MAX_BYTES:
            return False
        target = os.path.join(directory, *parts)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "wb") as f:
            f.write(data)
    return True


def expand(value, limits):
    """Substitutes the ONLY two placeholders a toolchain may use: {memoryMb} (decimal MiB) and {memoryBytesHex} (bytes in
    hexadecimal, the format of DOTNET_* runtime settings)."""
    return value.replace("{memoryMb}", str(limits["memoryMb"])).replace("{memoryBytesHex}", format(limits["memoryMb"] * 1024 * 1024, "x"))


def child_setup(address_space_bytes, cpu_seconds):
    def setup():
        for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGPIPE, signal.SIGXFSZ):
            signal.signal(sig, signal.SIG_DFL)
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        resource.setrlimit(resource.RLIMIT_FSIZE, (FILE_SIZE_LIMIT, FILE_SIZE_LIMIT))
        resource.setrlimit(resource.RLIMIT_NOFILE, (256, 256))
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds + 1))
        if address_space_bytes:
            resource.setrlimit(resource.RLIMIT_AS, (address_space_bytes, address_space_bytes))
        try:
            with open("/proc/self/oom_score_adj", "w") as f:
                f.write("1000")
        except OSError:
            pass
    return setup


def kill_group(proc):
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass


def execute(argv, stdin_bytes, timeout_ms, out_cap, err_cap, env, address_space_bytes=0):
    """Runs one step. Returns dict(code, out, err, timed_out, over, duration_ms). Never raises for program behaviour."""
    started = time.monotonic()
    proc = subprocess.Popen(
        argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=WORKSPACE, env=env,
        start_new_session=True, close_fds=True, preexec_fn=child_setup(address_space_bytes, max(1, -(-timeout_ms // 1000)) + 1),
    )
    try:
        proc.stdin.write(stdin_bytes)
    except (BrokenPipeError, OSError):
        pass
    try:
        proc.stdin.close()
    except OSError:
        pass
    buffers = {proc.stdout: bytearray(), proc.stderr: bytearray()}
    caps = {proc.stdout: out_cap, proc.stderr: err_cap}
    sel = selectors.DefaultSelector()
    for stream in buffers:
        os.set_blocking(stream.fileno(), False)
        sel.register(stream, selectors.EVENT_READ)
    deadline = started + timeout_ms / 1000.0
    timed_out = over = False
    exited_at = None
    while sel.get_map():
        now = time.monotonic()
        if now >= deadline:
            timed_out = proc.poll() is None
            break
        if exited_at is None and proc.poll() is not None:
            exited_at = now
        if exited_at is not None and now - exited_at > 0.2:
            break  # the program exited; a leftover background process keeps the pipes open — stop waiting for it
        for key, _ in sel.select(timeout=min(0.05, max(0.0, deadline - now))):
            try:
                chunk = os.read(key.fileobj.fileno(), 65536)
            except BlockingIOError:
                continue
            if not chunk:
                sel.unregister(key.fileobj)
                continue
            buf = buffers[key.fileobj]
            buf.extend(chunk)
            if len(buf) > caps[key.fileobj]:
                over = True
        if over:
            break
    kill_group(proc)
    try:
        code = proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        code = None
    sel.close()
    for stream in buffers:
        stream.close()
    return {
        "code": code, "out": bytes(buffers[proc.stdout]), "err": bytes(buffers[proc.stderr]),
        "timed_out": timed_out, "over": over, "duration_ms": int((time.monotonic() - started) * 1000),
    }


def main():
    for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, signal.SIG_IGN)
    make_non_dumpable()
    try:
        with open(TOOLCHAIN_PATH, "rb") as f:
            toolchain = json.loads(f.read().decode("utf-8"))
        job, limits = read_job(toolchain)
    except Exception:
        internal_error()

    os.umask(0o077)
    out_dir = os.path.join(WORKSPACE, "out")
    os.makedirs(out_dir, exist_ok=True)
    if "source" in job:
        with open(os.path.join(WORKSPACE, toolchain["sourceFile"]), "w", encoding="utf-8", newline="") as f:
            f.write(job["source"])

    def step_env(step):
        env = dict(CHILD_ENV_BASE)
        for k, v in list(toolchain.get("env", {}).items()) + list(step.get("env", {}).items()):
            env[k] = expand(v, limits)
        return env

    def checked(step):
        """Runs a compile / syntax-check step; emits compile-error and returns False on failure."""
        r = execute([expand(a, limits) for a in step["argv"]], b"", limits["compileTimeoutMs"], COMPILE_OUTPUT_MAX_BYTES, COMPILE_OUTPUT_MAX_BYTES, step_env(step))
        if r["timed_out"]:
            emit({"status": "compile-error", "stdout": "", "stderr": "Compilation timed out."})
            return False
        if r["code"] != 0 or r["over"]:
            diagnostics = utf8_text(r["out"] + r["err"], min(COMPILE_OUTPUT_MAX_BYTES, limits["outputBytes"]))
            emit({"status": "compile-error", "stdout": "", "stderr": diagnostics, "exitCode": r["code"] if isinstance(r["code"], int) else -1})
            return False
        return True

    if job["phase"] == "compile":
        if not checked(toolchain["compile"]):
            return
        artifact = collect_artifact(out_dir)
        if artifact is None:
            internal_error()
        emit({"status": "compiled", "artifact": artifact})
        return

    if "artifact" in job:
        if not write_artifact(out_dir, job["artifact"]):
            internal_error()
    elif toolchain.get("check") and not checked(toolchain["check"]):
        return

    run_step = toolchain["run"]
    address_space = 0
    if run_step.get("addressSpaceOverheadMb") is not None:
        address_space = (limits["memoryMb"] + int(run_step["addressSpaceOverheadMb"])) * 1024 * 1024
    out_cap = limits["outputBytes"]
    err_cap = min(limits["outputBytes"], STDERR_MAX_BYTES)
    step = execute([expand(a, limits) for a in run_step["argv"]], job["stdin"].encode("utf-8"), limits["timeMs"], out_cap, err_cap, step_env(run_step), address_space)

    code = step["code"]
    if step["timed_out"]:
        status = "timeout"
    elif step["over"]:
        status = "output-limit"
    elif code == 0:
        status = "success"
    else:
        status = "runtime-error"
    result = {"status": status, "stdout": utf8_text(step["out"], out_cap), "stderr": utf8_text(step["err"], err_cap), "durationMs": step["duration_ms"]}
    if isinstance(code, int):
        result["exitCode"] = code if code >= 0 else 128 - code
    emit(result)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        emit({"status": "internal-error", "stdout": "", "stderr": ""})
