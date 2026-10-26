"""Isolated, dependency-free Harness v2 CLI (Python 3.11+)."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import time
import tomllib
from datetime import datetime, timezone

from policy import COMMANDS, PRODUCT_BASE, clean_path, completion, operation, route, stub, under, validate_goal

HERE = Path(__file__).resolve().parent
SOURCE_ROOT = HERE.parent.parent
SECRET = re.compile(r"(?i)(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{8,}|(?:authorization\s*:\s*bearer\s+)\S+|(?:token|password|secret|api_key)\s*[=:]\s*[^\s,;]+)")
JSON_SECRET = re.compile(r'''(?is)(["'](?:token|password|secret|api_key|authorization)["']\s*:\s*)(["'])(?:\\.|(?!\2).)*?\2''')
SECRET_KEYS = {"token", "password", "secret", "api_key", "authorization"}


def _redact_text(text):
    text = JSON_SECRET.sub(lambda m: m[1] + '"[REDACTED]"', text)
    return SECRET.sub("[REDACTED]", text)


def redact_value(value):
    """Mask JSON values before serialization, preserving keys and data types."""
    if isinstance(value, dict):
        return {k: "[REDACTED]" if k.lower() in SECRET_KEYS else redact_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [redact_value(v) for v in value]
    return _redact_text(value) if isinstance(value, str) else value


def redact(text):
    """Preserve valid JSON/JSONL framing; plain logs use best-effort masking."""
    try:
        return json.dumps(redact_value(json.loads(text)), ensure_ascii=True)
    except json.JSONDecodeError:
        lines = []
        for line in text.split("\n"):
            try:
                lines.append(json.dumps(redact_value(json.loads(line)), ensure_ascii=True))
            except json.JSONDecodeError:
                lines.append(_redact_text(line))
        return "\n".join(lines)


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_new(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as f:
        f.write(json_bytes(value))


def git(root, *args):
    return subprocess.check_output(["git", "--no-optional-locks", "-C", str(root), *args], stderr=subprocess.PIPE)


def snapshot(root):
    """No stash writes, no worktree locks; hash WIP bytes and index separately."""
    root = Path(root).resolve()
    head = git(root, "rev-parse", "HEAD").decode().strip()
    paths = set()
    for args in (("diff", "--name-only", "-z", "HEAD"),
                 ("diff", "--cached", "--name-only", "-z"),
                 ("ls-files", "--others", "--exclude-standard", "-z")):
        paths.update(p.decode("utf-8") for p in git(root, *args).split(b"\0") if p)
    files = {}
    for p in sorted(paths):
        clean_path(p)
        f = root / p
        if f.is_symlink():
            files[p] = "symlink:" + digest(os.readlink(f).encode())
        elif f.is_file():
            files[p] = digest(f.read_bytes())
        else:
            files[p] = "deleted"
    result = {
        "head": head, "branch": git(root, "branch", "--show-current").decode().strip(),
        "status_hash": digest(git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all")),
        "index_diff_hash": digest(git(root, "diff", "--cached", "--binary")),
        "worktree_diff_hash": digest(git(root, "diff", "--binary")),
        "stash_hash": digest(git(root, "stash", "list", "--format=%H %gd %gs")),
        "files": files,
    }
    result["fingerprint"] = digest(json_bytes(result))
    return result


def changed_paths(root, base_revision):
    # Include committed, staged, unstaged and untracked changes since Goal start.
    # A publish/commit cannot erase its own validation scope.
    paths = {p.decode("utf-8") for p in git(root, "diff", "--no-renames", "--name-only", "-z", base_revision).split(b"\0") if p}
    paths.update(p.decode("utf-8") for p in git(root, "diff", "--cached", "--no-renames", "--name-only", "-z", base_revision).split(b"\0") if p)
    paths.update(p.decode("utf-8") for p in git(root, "ls-files", "--others", "--exclude-standard", "-z").split(b"\0") if p)
    return sorted(clean_path(p) for p in paths)


def publication_fingerprint(root, base_revision):
    """Immutable content selection for PR-only requests, stable across staging.

    Preserve staged-only content as well as the working tree. Staging a matching
    working file or committing it does not change this digest.
    """
    root = Path(root)
    staged = {p.decode("utf-8") for p in git(root, "diff", "--cached", "--name-only", "-z", base_revision).split(b"\0") if p}
    modes = {}
    for entry in git(root, "ls-files", "--stage", "-z").split(b"\0"):
        if entry:
            metadata, name = entry.split(b"\t", 1)
            modes[name.decode("utf-8")] = metadata.decode().split()[0]
    rows = []
    for p in changed_paths(root, base_revision):
        f = root / p
        if f.is_symlink():
            current, mode = digest(os.readlink(f).encode()), "120000"
        elif f.is_file():
            current = digest(f.read_bytes())
            mode = modes.get(p, "100644") if os.name == "nt" else ("100755" if f.stat().st_mode & 0o111 else "100644")
        else:
            current, mode = "deleted-or-link", "deleted"
        index = None
        if p in staged:
            try:
                index_hash = digest(git(root, "show", ":" + p))
            except subprocess.CalledProcessError:
                index_hash = "deleted-or-link"
            if index_hash != current:
                index = index_hash
        rows.append({"path": p, "worktree": current, "mode": mode, "different_staged_content": index})
    return digest(json_bytes({"base_revision": base_revision, "files": rows}))


def fingerprint(root, goal):
    # Goal includes current authority, referenced revisions and semantics; modifying
    # these invalidates old evidence even if no product source changed.
    return digest(json_bytes({"snapshot": snapshot(root), "goal": goal}))


def assert_contained(root, rel):
    clean_path(rel)
    target = root / rel
    if not target.resolve().is_relative_to(root.resolve()):
        raise ValueError("symlink path escapes trial root")
    return target


def install(source, destination, revision, harness_revision=None):
    """Export committed product + current v2 assets into a NEW independent repo.

    Never mutate source checkout/index/stash, nor overlay any existing directory.
    A trial export is deliberately not a shared git worktree: its stash/index and
    paused branches cannot alias #192 or another user's checkout.
    """
    source = Path(source).resolve()
    destination = Path(destination).absolute()
    if destination.exists() or destination.is_symlink():
        raise ValueError("destination must not exist (WIP protected)")
    if destination.parent.resolve().is_relative_to(source):
        raise ValueError("trial must be outside source repository")
    if source != SOURCE_ROOT.resolve():
        raise ValueError("product/harness source must be this tool's checkout; use a clean pinned checkout")
    before = snapshot(source)
    if harness_revision and (harness_revision != before["head"] or before["files"]):
        raise ValueError("frozen harness revision requires matching clean source HEAD")
    commit = git(source, "rev-parse", "--verify", revision + "^{commit}").decode().strip()
    raw = git(source, "archive", "--format=tar", commit)
    destination.mkdir(parents=True)
    inactive_reference = ".codex/skills/fsm-protocol-guard/references/fsm-protocol-invariants.md"
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        for member in archive:
            rel = member.name.rstrip("/")
            if not rel or (under(rel, ".codex") and rel != inactive_reference) or under(rel, ".agents") or Path(rel).name in {"AGENTS.md", "AGENTS.override.md"} or rel in {"WORKFLOW.md", "QUALITY.md"}:
                continue
            target = assert_contained(destination, rel)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                target.parent.mkdir(parents=True, exist_ok=True)
                data = archive.extractfile(member).read()
                target.write_bytes(data)
                if rel == "scripts/check-design-contracts.mjs":
                    reference = assert_contained(destination, ".harness-v2-legacy/check-design-contracts.mjs")
                    reference.parent.mkdir(parents=True, exist_ok=True)
                    reference.write_bytes(data)
            else:
                raise ValueError("non-regular archive member refused")
    # Source runtime files are copied only to this newly created owned destination.
    for f in (HERE / "runtime").rglob("*"):
        if f.is_file():
            target = assert_contained(destination, f.relative_to(HERE / "runtime").as_posix())
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(f.read_bytes())
    # Product-base exports predate this tool; keep tool and frozen #196 inputs.
    for rel in ("tools/harness-v2", "docs/harness-v2"):
        src = SOURCE_ROOT / rel
        for f in src.rglob("*"):
            if f.is_file() and "__pycache__" not in f.parts and f.suffix != ".pyc":
                target = assert_contained(destination, (Path(rel) / f.relative_to(src)).as_posix())
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(f.read_bytes())
    runtime_hash = digest(b"".join(f.relative_to(HERE).as_posix().encode() + f.read_bytes()
                                  for f in sorted((HERE / "runtime").rglob("*")) if f.is_file()))
    write_new(destination / ".harness-v2.json", {
        "mode": "harness-v2-prototype", "product_base": commit,
        "harness_revision": harness_revision or ("worktree:" + before["fingerprint"] if before["files"] else before["head"]),
        "runtime_sha256": runtime_hash, "source_fingerprint": before["fingerprint"],
        "model": "gpt-6.1-sol", "created_at": now(),
        "warning": "prototype; not #198 adoption or #199 migration",
    })
    subprocess.run(["git", "init", "-b", "codex/harness-v2-trial", str(destination)], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(destination), "add", "."], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(destination), "-c", "user.name=Harness trial", "-c", "user.email=harness-trial@example.invalid", "commit", "-m", "Isolated product base with Harness v2 overlay"], check=True, capture_output=True)
    after = snapshot(source)
    if before != after:
        raise ValueError("source changed during export; preserve both snapshots and investigate")
    return read_json(destination / ".harness-v2.json")


def check_assets():
    config = tomllib.loads((HERE / "runtime/.codex/config.toml").read_text(encoding="utf-8"))
    if config["model"] != "gpt-6.1-sol" or config["agents"]["default_subagent_model"] != config["model"]:
        raise ValueError("model mismatch")
    agents = []
    for p in (HERE / "runtime/.codex/agents").glob("*.toml"):
        a = tomllib.loads(p.read_text(encoding="utf-8"))
        if a["name"] != p.stem or not a.get("description") or not a.get("developer_instructions"):
            raise ValueError("invalid agent definition")
        agents.append(a["name"])
    skills = []
    for p in (HERE / "runtime/.agents/skills").glob("*/SKILL.md"):
        data = p.read_text(encoding="utf-8")
        if not data.startswith("---\nname: " + p.parent.name + "\n") or "\ndescription: " not in data:
            raise ValueError("invalid skill manifest")
        skills.append(p.parent.name)
    return {"model": config["model"], "agents": sorted(agents), "skills": sorted(skills), "static_only": True}


def membership(root, paths):
    """Detect manual script omission, never assume test names mean execution."""
    root = Path(root)
    result = []
    for p in paths:
        if not p.endswith((".test.ts", ".test.tsx", ".test.mjs")):
            continue
        workspace = next((w for w in ("apps/client", "apps/worker", "apps/web") if under(p, w)), None)
        if workspace:
            package = read_json(root / workspace / "package.json")
            relative = p[len(workspace) + 1:]
            script = package.get("scripts", {}).get("test", "")
            # Explicit membership only. Glob/dynamic test discovery needs a run log.
            listed = relative in script.split()
            result.append({"path": p, "explicitly_listed": listed,
                           "runtime": "standard-command+log" if listed else "explicit-command+log required",
                           "types": "root typecheck plus include/exclude review required",
                           "suggested_argv": ["npx", "--no-install", "tsx", "--test", p]})
    return result


def run_check(root, goal, key, output):
    """Only fixed local validation argv. No arbitrary executable/remote commands."""
    if key not in COMMANDS:
        raise ValueError("unknown validation ID")
    if goal["ceiling"] == "read-only" or goal.get("paused"):
        raise ValueError("build/test may write outputs; read-only/paused Goal")
    root = Path(root).resolve()
    output = Path(output).resolve()
    if output.is_relative_to(root):
        raise ValueError("logs must be outside repo to avoid evidence self-invalidation")
    if output.exists():
        raise ValueError("log already exists; keep failed attempts")
    marker = read_json(root / ".harness-v2.json")
    if marker.get("mode") != "harness-v2-prototype":
        raise ValueError("local checks require marked trial")
    before = fingerprint(root, goal)
    argv = list(COMMANDS[key])
    if os.name == "nt" and argv[0] in {"npm", "npx"}:
        argv[0] += ".cmd"
    cwd = root / "apps/worker" if key == "worker-bundle" else root
    start, tick = now(), time.monotonic()
    output.parent.mkdir(parents=True, exist_ok=True)
    timeout = False
    try:
        process = subprocess.run(argv, cwd=cwd, capture_output=True, timeout=600)
        captured, exit_code = process.stdout + process.stderr, process.returncode
    except subprocess.TimeoutExpired as exc:
        captured, exit_code, timeout = (exc.stdout or b"") + (exc.stderr or b""), 124, True
    output.write_text(redact(captured.decode("utf-8", errors="replace")), encoding="utf-8", newline="\n")
    return {"command": key, "argv": COMMANDS[key], "exit_code": exit_code, "timeout": timeout,
            "log": str(output), "log_sha256": digest(output.read_bytes()),
            "fingerprint": before, "after_fingerprint": fingerprint(root, goal),
            "started_at": start, "ended_at": now(), "elapsed_seconds": time.monotonic() - tick}


def resume(goal, checkpoint, current):
    validate_goal(goal)
    owner = checkpoint.get("owner")
    reasons = []
    if not owner or checkpoint.get("owner_status") not in {"stopped", "complete"}:
        reasons.append("previous writer must be identified and stopped before takeover")
    if goal.get("paused"):
        reasons.append("paused Goal needs explicit current request resume")
    if checkpoint.get("request_id") != goal["request_id"]:
        reasons.append("new request: rebind current authority; do not inherit grants")
    fresh = checkpoint.get("fingerprint") == current
    return {"status": "BLOCKED" if reasons else "READY", "reasons": reasons,
            "reuse_validation": fresh and not reasons, "decisions": checkpoint.get("decisions", []),
            "unfinished": checkpoint.get("unfinished", []),
            "integration_complete": checkpoint.get("integration_complete") is True and fresh and not reasons}


def metrics(path, metadata):
    """Only observed CLI JSONL fields; never infer tokens from bytes/steps."""
    events = [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]
    usage = [e["usage"] for e in events if e.get("type") == "turn.completed" and isinstance(e.get("usage"), dict)]
    return {**metadata, "event_log_sha256": digest(Path(path).read_bytes()),
            "usage": usage or None, "usage_coverage": "CLI parent turn.completed only; child/reasoning unavailable" if usage else "unmeasured",
            "spawn_ids": metadata.get("spawn_ids"), "retries": metadata.get("retries"),
            "active_seconds": None, "reasoning_tokens": None,
            "all_agents_total_tokens": None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("assets")
    p = sub.add_parser("install")
    p.add_argument("--source", default=str(SOURCE_ROOT))
    p.add_argument("--destination", required=True)
    p.add_argument("--product-base", default=PRODUCT_BASE)
    p.add_argument("--harness-revision")
    p = sub.add_parser("snapshot")
    p.add_argument("--root", required=True)
    for command in ("select", "authorize", "stub", "complete", "resume", "run"):
        p = sub.add_parser(command)
        p.add_argument("--goal", required=True)
        p.add_argument("--root", default=".")
        if command == "select":
            p.add_argument("--paths", nargs="*")
        if command in {"authorize", "stub"}:
            p.add_argument("--operation", required=True)
            p.add_argument("--target", required=True)
            p.add_argument("--evidence")
            if command == "stub":
                p.add_argument("--readback")
        if command in {"complete", "resume"}:
            p.add_argument("--evidence", required=True)
        if command == "run":
            p.add_argument("--check", required=True, choices=sorted(COMMANDS))
            p.add_argument("--log", required=True)
    p = sub.add_parser("metrics")
    p.add_argument("--events", required=True)
    p.add_argument("--metadata", required=True)
    args = parser.parse_args()
    if args.cmd == "assets":
        result = check_assets()
    elif args.cmd == "install":
        result = install(args.source, args.destination, args.product_base, args.harness_revision)
    elif args.cmd == "snapshot":
        result = snapshot(args.root)
    elif args.cmd == "metrics":
        result = metrics(args.events, read_json(args.metadata))
    else:
        goal = validate_goal(read_json(args.goal))
        if args.cmd == "select":
            paths = args.paths if args.paths is not None else changed_paths(args.root, goal["base_revision"])
            result = route(goal, paths)
            result["test_membership"] = membership(args.root, paths)
            result["fingerprint"] = fingerprint(args.root, goal)
            result["publication_fingerprint"] = publication_fingerprint(args.root, goal["base_revision"])
        elif args.cmd == "authorize":
            reasons = operation(goal, args.operation, args.target, read_json(args.evidence) if args.evidence else {})
            result = {"status": "BLOCKED" if reasons else "READY", "reasons": reasons, "decision_only": True}
        elif args.cmd == "stub":
            result = stub(goal, args.operation, args.target,
                          read_json(args.evidence) if args.evidence else {},
                          read_json(args.readback) if args.readback else {})
        elif args.cmd == "run":
            result = run_check(args.root, goal, args.check, args.log)
        elif args.cmd == "resume":
            result = resume(goal, read_json(args.evidence), fingerprint(args.root, goal))
        else:
            plan = route(goal, changed_paths(args.root, goal["base_revision"]))
            plan["publication_fingerprint"] = publication_fingerprint(args.root, goal["base_revision"])
            result = completion(goal, plan, fingerprint(args.root, goal), read_json(args.evidence))
    print(redact(json.dumps(result, ensure_ascii=True, indent=2)))
    return 2 if result.get("status") == "BLOCKED" or result.get("blockers") or result.get("exit_code", 0) else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError, subprocess.SubprocessError) as exc:
        print(json.dumps({"status": "BLOCKED", "reason": redact(str(exc))}, ensure_ascii=True))
        sys.exit(2)
