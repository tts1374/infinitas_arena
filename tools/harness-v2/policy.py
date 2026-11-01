"""Harness v2 policy evaluator. Pure decisions; no shell or external writes.

Goal JSON is a parent-curated record, never an Issue/tool-output authority source.
This is an evidence gate, not an OS sandbox or a proof of semantic completeness.
"""
from pathlib import PurePosixPath

OPERATIONS = {
    "edit", "commit", "push", "pr", "issue-post", "reply", "resolve",
    "merge", "issue-close", "deploy", "release", "cleanup", "self-approve",
}
KINDS = {"change", "review-response", "issue-draft", "pr-publish", "release-draft", "release"}
CEILINGS = {"read-only", "planning-only", "kickoff-only", "implementation"}
SEMANTICS = {
    "ui", "fsm", "ws", "timer", "idempotency", "reconnect", "restore",
    "lobby", "history", "storage", "source", "shared", "security", "authority",
    "native", "governance", "unknown",
}
PRODUCT_BASE = "4b600d3445edc71d0599058809c9a89b04591760"
CONTRACTS = {
    "fsm": ["Q01", "Q02", "Q03", "Q04", "Q05"],
    "ws": ["Q01", "Q03", "Q04", "Q05", "Q10"],
    "timer": ["Q01", "Q02", "Q04", "Q05"],
    "idempotency": ["Q03", "Q04", "Q07"],
    "reconnect": ["Q01", "Q04", "Q05", "Q11"],
    "restore": ["Q02", "Q04", "Q05", "Q06", "Q08"],
    "lobby": ["Q02", "Q05", "Q06", "Q08", "Q10"],
    "history": ["Q04", "Q07", "Q08", "Q10"],
    "storage": ["Q05", "Q07", "Q08", "Q10"],
    "source": ["Q03", "Q04", "Q09", "Q11"],
    "shared": [f"Q{i:02}" for i in range(1, 11)],
    "security": ["Q13", "Q15", "Q16"],
    "authority": ["Q01", "Q03", "Q13", "Q15", "Q16"],
    "native": ["Q08", "Q09", "Q11"],
    "governance": ["Q12", "Q13", "Q14", "Q15", "Q16"],
}
# IDs are stable evidence keys, not shell commands supplied by untrusted text.
COMMANDS = {
    "lint": ["npm", "run", "lint"],
    "types": ["npm", "run", "typecheck"],
    "client-build": ["npm", "run", "build:client"],
    "client-test": ["npm", "--workspace", "@infinitas/client", "run", "test"],
    "stats": ["npm", "run", "test:client-stats"],
    "worker-test": ["npm", "run", "test:worker"],
    "design": ["npm", "run", "check:design-contracts"],
    "web-types": ["npm", "run", "typecheck:web"],
    "web-build": ["npm", "run", "build:web"],
    "web-test": ["npm", "run", "test:web"],
    "native-check": ["cargo", "check", "--manifest-path", "apps/client/src-tauri/Cargo.toml"],
    "native-test": ["cargo", "test", "--manifest-path", "apps/client/src-tauri/Cargo.toml"],
    "worker-bundle": ["npx", "--no-install", "wrangler", "deploy", "--dry-run"],
    "harness-test": ["python", "-m", "unittest", "discover", "-s", "tools/harness-v2", "-p", "test_*.py"],
}


def clean_path(value):
    if not isinstance(value, str) or not value or "\\" in value or ":" in value:
        raise ValueError("paths must be relative POSIX paths")
    p = PurePosixPath(value)
    if p.is_absolute() or ".." in p.parts or value != str(p) or value == ".":
        raise ValueError("non-canonical or escaping path")
    return value


def under(path, scope):
    return path == scope or path.startswith(scope + "/")


def validate_goal(g):
    for key in ("request_id", "base_revision", "objective", "acceptance", "non_goals", "kind", "ceiling",
                "allowed_paths", "forbidden_paths", "grants", "references", "stop_conditions",
                "owners", "semantics", "implementers", "target"):
        if key not in g:
            raise ValueError(f"missing Goal field: {key}")
    if not g["request_id"] or not g["objective"] or not g["stop_conditions"]:
        raise ValueError("empty objective/request/stop boundary")
    if len(g["base_revision"]) not in {40, 64} or any(c not in "0123456789abcdef" for c in g["base_revision"]):
        raise ValueError("base_revision must be immutable full commit hash")
    if g["kind"] not in KINDS or g["ceiling"] not in CEILINGS:
        raise ValueError("unknown kind/ceiling")
    if not g["acceptance"] or any(not a.get("id") or not a.get("text") for a in g["acceptance"]):
        raise ValueError("AC needs unique ID and text")
    if len({a["id"] for a in g["acceptance"]}) != len(g["acceptance"]):
        raise ValueError("duplicate AC ID")
    if not g["references"] or any(not r.get("path") or not r.get("revision") for r in g["references"]):
        raise ValueError("references need path and revision/hash")
    for p in g["allowed_paths"] + g["forbidden_paths"] + g.get("artifact_paths", []):
        clean_path(p)
    if not set(g["semantics"]) <= SEMANTICS:
        raise ValueError("unknown semantic tag; use unknown, never silently ignore")
    for grant in g["grants"]:
        if grant.get("operation") not in OPERATIONS or not grant.get("target"):
            raise ValueError("unknown operation/empty grant target")
    for owner in g["owners"]:
        if not owner.get("owner") or owner.get("status") not in {"active", "stopped", "complete"}:
            raise ValueError("invalid ownership")
        for p in owner["paths"]:
            clean_path(p)
    if not g["implementers"]:
        raise ValueError("implementation identities required")
    for d in g.get("decisions", []):
        if not all(k in d for k in ("id", "blocking", "affects", "deadline", "interim")):
            raise ValueError("decision needs impact/deadline/interim")
    return g


def route(g, paths):
    validate_goal(g)
    paths = [clean_path(p) for p in paths]
    tags = set(g["semantics"])
    for p in paths:
        if under(p, "packages/shared"):
            tags.add("shared")
        elif under(p, "apps/worker"):
            tags.update(("fsm", "ws", "restore", "lobby"))
        elif under(p, "apps/client/src-tauri"):
            tags.update(("native", "source", "storage"))
        elif under(p, "apps/client"):
            tags.add("ui")
            lower = p.lower()
            for needle, tag in (("source", "source"), ("submission", "source"),
                                ("snapshot", "storage"), ("archive", "history"),
                                ("stats", "history"), ("persist", "storage"),
                                ("room-store", "ws"), ("reconnect", "reconnect")):
                if needle in lower:
                    tags.add(tag)
        elif under(p, "tools/harness-v2") or under(p, ".codex") or p in {"AGENTS.md", "WORKFLOW.md", "QUALITY.md"}:
            tags.add("governance")
        elif under(p, "docs/design"):
            tags.add("shared")
        elif not (under(p, "docs") or under(p, "apps/web")):
            tags.add("unknown")
    if "unknown" in tags:
        tags.update(CONTRACTS)
    q = {"Q12", "Q13", "Q15", "Q16"}
    for tag in tags:
        q.update(CONTRACTS.get(tag, ["Q11"] if tag == "ui" else []))
    independent = bool(tags & CONTRACTS.keys())
    if independent:
        q.add("Q14")
    commands = set()
    manual = {"scope-and-meaning", "ci-surface-parity", "secret-and-untrusted-input"}
    product = any(p.startswith(("apps/", "packages/")) for p in paths)
    if product or "unknown" in tags:
        # CI quick is a floor even for a local client change.
        commands.update(("lint", "types", "stats", "worker-test"))
    if any(under(p, "apps/client") for p in paths) or "shared" in tags:
        commands.update(("client-build", "client-test", "stats", "types", "lint"))
    if any(under(p, "apps/web") for p in paths):
        commands.update(("web-types", "web-build", "web-test"))
    if tags & {"fsm", "ws", "timer", "idempotency", "reconnect", "restore", "lobby", "shared"}:
        commands.update(("design", "worker-test", "worker-bundle", "lint", "types"))
        manual.add("contract-and-behavior-cases")
    if tags & {"fsm", "ws", "shared", "source", "reconnect"}:
        manual.add("real-client-worker-source-e2e")
    if tags & {"restore", "lobby", "reconnect"}:
        manual.add("clock-barrier-restore-replay-growth-and-runtime")
    if tags & {"storage", "history", "shared"}:
        manual.add("old-new-writer-reader-corrupt-future-matrix")
    if tags & {"source", "native"}:
        commands.update(("native-check", "native-test"))
        manual.add("real-watcher-parser-native-window")
    if "ui" in tags or "shared" in tags:
        manual.add("visual-source-states-width-keyboard")
    if "governance" in tags:
        commands.update(("harness-test", "design"))
        manual.add("actual-codex-load-and-rollback")
    if tags & {"shared", "ws", "storage", "history"}:
        manual.add("compatibility-and-rollout-decision")
    if "unknown" in tags:
        manual.add("unknown-impact-classification")
    blockers = []
    for p in paths:
        if not any(under(p, s) for s in g["allowed_paths"]) or any(under(p, s) for s in g["forbidden_paths"]):
            blockers.append(f"scope: {p}")
        owners = [o for o in g["owners"] if o["status"] == "active" and any(under(p, s) for s in o["paths"])]
        if len(owners) != 1:
            blockers.append(f"exactly one active owner required: {p}")
        if any(under(p, s) for s in g.get("paused_paths", [])):
            blockers.append(f"paused: {p}")
    active = [o for o in g["owners"] if o["status"] == "active"]
    for i, a in enumerate(active):
        for b in active[i + 1:]:
            if any(under(x, y) or under(y, x) for x in a["paths"] for y in b["paths"]):
                blockers.append("overlapping active write ownership")
    for d in g.get("decisions", []):
        if d["blocking"] and any(under(p, s) for p in paths for s in d["affects"]):
            blockers.append(f"decision: {d['id']}")
    if any(p.endswith((".test.ts", ".test.tsx", ".test.mjs")) for p in paths):
        manual.add("changed-test-runtime-and-type-membership")
    return {
        "mode": "harness-v2-prototype", "kind": g["kind"], "paths": sorted(paths),
        "execution": "short-plan" if independent else "direct-parent",
        "delegation": "independent-review-required" if independent else "on-demand-only",
        "semantics": sorted(tags), "quality": sorted(q), "commands": sorted(commands),
        "manual": sorted(manual), "blockers": sorted(set(blockers)),
    }


def authorized(g, op, target):
    return any(x.get("operation") == op and x.get("target") == target
               and x.get("source") == "user" and x.get("request_id") == g["request_id"]
               and bool(x.get("evidence")) for x in g["grants"])


def operation(g, op, target, e=None):
    """Return deny reasons; callers must not call any real remote executor."""
    validate_goal(g)
    e = e or {}
    reasons = []
    if op not in OPERATIONS or op == "self-approve":
        return ["unknown operation or self-approve forbidden"]
    if g.get("paused"):
        reasons.append("Goal is paused")
    if g["ceiling"] == "read-only":
        reasons.append("read-only ceiling")
    if g["ceiling"] in {"planning-only", "kickoff-only"}:
        if op != "edit" or not any(under(target, s) for s in g.get("artifact_paths", [])):
            reasons.append("artifact-only ceiling")
    kind = g["kind"]
    permitted = {
        "issue-draft": {"edit", "issue-post"},
        "release-draft": {"edit"},
        "pr-publish": {"commit", "push", "pr"},
        "review-response": {"edit", "commit", "push", "pr", "reply", "resolve"},
        "release": {"edit", "commit", "push", "deploy", "release"},
        "change": OPERATIONS,
    }[kind]
    if op not in permitted:
        reasons.append("operation outside request kind")
    if not authorized(g, op, target):
        # Narrow bot Standard merge lane: explicit post-merge handling delegation,
        # never inferred from PR publication or the external review body.
        bot_lane = op == "merge" and e.get("profile") == "Standard" and e.get("author_is_bot") is True
        if not (bot_lane and authorized(g, "merge", "post-merge:" + target)):
            reasons.append("no current user grant for operation/target")
    if op == "edit":
        try:
            clean_path(target)
            if not any(under(target, p) for p in g["allowed_paths"]) or any(under(target, p) for p in g["forbidden_paths"]):
                reasons.append("edit outside scope")
        except ValueError as exc:
            reasons.append(str(exc))
        if any(under(target, p) for p in g.get("paused_paths", [])):
            reasons.append("paused path")
        owners = [o for o in g["owners"] if o["status"] == "active" and any(under(target, p) for p in o["paths"])]
        if len(owners) != 1:
            reasons.append("exactly one active write owner required")
        if kind in {"issue-draft", "release-draft"} and not any(under(target, p) for p in g.get("artifact_paths", [])):
            reasons.append("draft request permits artifact writes only")
        if target in e.get("preexisting_dirty", []) and not e.get("wip_edit_authorized", False):
            reasons.append("preexisting WIP needs ownership/authorization")
    if op in {"push", "pr", "merge", "deploy", "release"}:
        if not e.get("expected_head") or e.get("head") != e.get("expected_head"):
            reasons.append("HEAD mismatch or missing read-back")
    if op == "merge":
        if type(e.get("author_is_bot")) is not bool or not e.get("author_login"):
            reasons.append("author lane not read back")
        if e.get("profile") not in {"Standard", "High-Risk"}:
            reasons.append("unknown merge risk")
        if e.get("checks") != "green" or e.get("actionable_threads") != 0 or e.get("followup_done") is not True:
            reasons.append("checks/threads/follow-up gate")
        if e.get("profile") == "Standard" and e.get("author_is_bot") is False:
            fallback = e.get("same_account_deadlock") is True and bool(e.get("deadlock_evidence")) and authorized(g, op, target)
            if not (e.get("human_approved") is True or fallback):
                reasons.append("normal review or evidenced strict fallback required")
            # Approval alone never grants user-authored merge (checked above).
        elif e.get("human_approved") is not True:
            reasons.append("independent human review required")
        if e.get("profile") == "High-Risk" and not authorized(g, op, target):
            reasons.append("explicit High-Risk merge grant required")
    if op in {"deploy", "release"}:
        if not all(e.get(k) is True for k in ("compatibility_decided", "checks_green", "rollback_ready")):
            reasons.append("publication compatibility/checks/rollback gate")
    if op == "resolve" and not (e.get("reply_readback") and e.get("validation_passed")):
        reasons.append("review reply read-back and validation required")
    if op == "issue-close":
        if not e.get("closure_evidence_readback"):
            reasons.append("closure evidence read-back required")
        if e.get("merge_required", True) and e.get("merged_readback") is not True:
            reasons.append("merge read-back required before close")
    if op == "cleanup":
        if not all(e.get(k) is True for k in ("task_owned", "clean", "integrated", "absolute_target_verified", "issue_closed_readback")):
            reasons.append("cleanup ownership/clean/integration/path/order gate")
        branch = e.get("branch", "")
        if not branch.startswith("codex/") or branch in e.get("protected_branches", ["v1"]) or branch == e.get("current_branch"):
            reasons.append("current/base/protected/non-task branch")
        if e.get("paused_target") or e.get("user_wip"):
            reasons.append("paused target/WIP protected")
    return reasons


def stub(g, op, target, evidence=None, readback=None):
    reasons = operation(g, op, target, evidence)
    if reasons:
        return {"status": "BLOCKED", "called": False, "reasons": reasons}
    if not readback or readback.get("operation") != op or readback.get("target") != target or readback.get("confirmed") is not True:
        return {"status": "BLOCKED", "called": True, "reasons": ["stub result unconfirmed by read-back"]}
    return {"status": "COMPLETE", "called": True, "stub_only": True, "readback": readback}


def completion(g, plan, fingerprint, evidence):
    reasons = list(plan["blockers"])
    if g.get("paused"):
        reasons.append("Goal is paused")
    if g["kind"] == "pr-publish":
        # Validate the already authorized immutable patch, without granting edits
        # in a PR-publication-only request. A changed patch must be rebound by the
        # parent to current user scope; the gate never updates this hash itself.
        if (g["ceiling"] != "implementation" or not authorized(g, "pr", g["target"])
                or not g.get("publication_fingerprint")
                or plan.get("publication_fingerprint") != g["publication_fingerprint"]):
            reasons.append("PR-only request needs current grant and unchanged authorized patch")
    else:
        for p in plan["paths"]:
            reasons.extend(f"{p}: {reason}" for reason in operation(g, "edit", p))
    if evidence.get("fingerprint") != fingerprint:
        reasons.append("stale evidence fingerprint")
    for ac in g["acceptance"]:
        row = evidence.get("acceptance", {}).get(ac["id"], {})
        if row.get("status") != "pass" or not row.get("evidence"):
            reasons.append("unproven AC: " + ac["id"])
    for key in plan["quality"]:
        row = evidence.get("quality", {}).get(key, {})
        if row.get("status") != "pass" or not row.get("evidence"):
            reasons.append("unproven quality: " + key)
    for key in plan["commands"]:
        rows = evidence.get("commands", {}).get(key, [])
        if not rows or rows[-1].get("exit_code") != 0 or not rows[-1].get("log") or rows[-1].get("fingerprint") != fingerprint:
            reasons.append("missing/failed/stale command: " + key)
    for key in plan["manual"]:
        row = evidence.get("manual", {}).get(key, {})
        if row.get("status") != "pass" or not row.get("evidence"):
            reasons.append("unproven manual gate: " + key)
    if plan["delegation"] == "independent-review-required":
        r = evidence.get("review", {})
        if (r.get("status") != "COMPLETE" or not r.get("reviewer") or r.get("reviewer") in g["implementers"] or r.get("independent") is not True
                or r.get("fingerprint") != fingerprint or not r.get("evidence")
                or not {"contract", "behavior"} <= set(r.get("coverage", []))):
            reasons.append("fresh independent contract+behavior review required")
    for f in evidence.get("findings", []):
        if not all(f.get(k) for k in ("id", "severity", "disposition", "evidence", "remaining_risk")):
            reasons.append("finding ledger incomplete")
        if f.get("severity") in {"Blocker", "Must fix"} and f.get("disposition") != "fixed":
            reasons.append("unresolved significant finding: " + f.get("id", "?"))
    return {"status": "BLOCKED" if reasons else "COMPLETE", "reasons": reasons}
