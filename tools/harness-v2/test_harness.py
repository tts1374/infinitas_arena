"""P1-P8 executable probes. All remote operations use policy.stub only."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import harness
from policy import clean_path, completion, operation, route, stub


def goal(**updates):
    g = harness.read_json(harness.HERE / "goal.example.json")
    g.update(updates)
    return g


def grant(g, op, target, **updates):
    row = {"operation": op, "target": target, "source": "user", "request_id": g["request_id"], "evidence": "synthetic current user instruction"}
    row.update(updates)
    g["grants"].append(row)


def merge_evidence(**updates):
    e = {"profile": "Standard", "author_login": "fixture-bot", "author_is_bot": True,
         "human_approved": True, "checks": "green", "actionable_threads": 0, "followup_done": True,
         "head": "immutable-head", "expected_head": "immutable-head"}
    e.update(updates)
    return e


def evidence_for(g, p, fp="fresh"):
    return {"fingerprint": fp,
            "acceptance": {a["id"]: {"status": "pass", "evidence": "fixture assertion"} for a in g["acceptance"]},
            "quality": {q: {"status": "pass", "evidence": "fixture evidence"} for q in p["quality"]},
            "commands": {c: [{"exit_code": 0, "log": "fixture.log", "fingerprint": fp}] for c in p["commands"]},
            "manual": {m: {"status": "pass", "evidence": "fixture inspection"} for m in p["manual"]},
            "review": {"status": "COMPLETE", "reviewer": "independent-fixture", "independent": True, "fingerprint": fp,
                       "coverage": ["contract", "behavior"], "evidence": "fixture review"},
            "findings": []}


class RoutingTests(unittest.TestCase):
    def test_low_risk_parent_alone(self):
        p = route(goal(), ["docs/trial-note.md"])
        self.assertEqual(p["execution"], "direct-parent")
        self.assertEqual(p["delegation"], "on-demand-only")
        self.assertEqual(p["blockers"], [])

    def test_local_ui_and_ci_floor(self):
        g = goal(allowed_paths=["apps/client"], forbidden_paths=[], owners=[{"owner": "parent", "status": "active", "paths": ["apps/client"]}])
        p = route(g, ["apps/client/src/components/SongSearchModalView.tsx"])
        self.assertEqual(p["delegation"], "on-demand-only")
        self.assertTrue({"types", "lint", "stats", "worker-test", "client-test", "client-build"} <= set(p["commands"]))
        self.assertIn("visual-source-states-width-keyboard", p["manual"])

    def test_semantic_triggers_even_under_innocent_path(self):
        for tag in ("fsm", "ws", "timer", "idempotency", "reconnect", "restore", "history", "storage", "source", "shared", "authority", "security", "lobby"):
            with self.subTest(tag=tag):
                p = route(goal(semantics=[tag]), ["docs/trial-note.md"])
                self.assertEqual(p["delegation"], "independent-review-required")
                self.assertIn("Q14", p["quality"])

    def test_cross_layer_parent_can_own_shared(self):
        g = goal(allowed_paths=["apps/client", "apps/worker", "packages/shared"], forbidden_paths=[],
                 owners=[{"owner": "parent", "status": "active", "paths": ["apps/client", "apps/worker", "packages/shared"]}])
        p = route(g, ["apps/client/src/a.ts", "apps/worker/src/b.ts", "packages/shared/src/c.ts"])
        self.assertEqual(p["blockers"], [])
        self.assertIn("old-new-writer-reader-corrupt-future-matrix", p["manual"])
        self.assertIn("real-client-worker-source-e2e", p["manual"])

    def test_unknown_paths_conservative(self):
        g = goal(allowed_paths=["scripts"], forbidden_paths=[], owners=[{"owner": "parent", "status": "active", "paths": ["scripts"]}])
        self.assertIn("unknown-impact-classification", route(g, ["scripts/something.mjs"])["manual"])

    def test_unknown_semantic_cannot_silently_pass(self):
        with self.assertRaises(ValueError):
            route(goal(semantics=["typo-restore"]), [])

    def test_nonblocking_decision_does_not_stop(self):
        d = {"id": "naming", "blocking": False, "affects": ["docs"], "deadline": "before-submit", "interim": "parent chooses"}
        self.assertEqual(route(goal(decisions=[d]), ["docs/trial-note.md"])["blockers"], [])
        d["blocking"] = True
        self.assertTrue(route(goal(decisions=[d]), ["docs/trial-note.md"])["blockers"])
        d["affects"] = ["packages/shared"]
        self.assertEqual(route(goal(decisions=[d]), ["docs/trial-note.md"])["blockers"], [])

    def test_no_omitted_test_membership_claim(self):
        result = harness.membership(harness.SOURCE_ROOT, ["apps/client/src/features/room/room-page-compose.test.ts"])
        self.assertFalse(result[0]["explicitly_listed"])
        self.assertIn("explicit-command", result[0]["runtime"])


class AuthorityProbes(unittest.TestCase):
    def test_p1_ceilings(self):
        for ceiling in ("read-only", "planning-only", "kickoff-only"):
            g = goal(ceiling=ceiling)
            grant(g, "merge", "pr:1")
            self.assertTrue(operation(g, "merge", "pr:1", merge_evidence()))
            if ceiling != "read-only":
                self.assertEqual(operation(g, "edit", "docs/trial-note.md"), [])
            else:
                self.assertTrue(operation(g, "edit", "docs/trial-note.md"))
            grant(g, "edit", "apps/client/a.ts")
            self.assertTrue(operation(g, "edit", "apps/client/a.ts"))

    def test_p2_current_explicit_authority_replaces_old(self):
        g = goal(authority_history=[{"request_id": "previous", "ceiling": "read-only"}])
        grant(g, "pr", "repo/pr")
        self.assertEqual(operation(g, "pr", "repo/pr", merge_evidence()), [])
        g["grants"][-1]["request_id"] = "previous"
        self.assertTrue(operation(g, "pr", "repo/pr", merge_evidence()))

    def test_p3_request_kinds(self):
        cases = [
            ("change", "edit", "docs/trial-note.md", True),
            ("review-response", "reply", "thread:1", True),
            ("issue-draft", "issue-post", "issue:1", True),
            ("issue-draft", "edit", "apps/client/a.ts", False),
            ("pr-publish", "pr", "pr:1", True),
            ("pr-publish", "edit", "docs/trial-note.md", False),
            ("release-draft", "release", "production", False),
            ("release-draft", "deploy", "production", False),
            ("release", "release", "production", True),
        ]
        for kind, op, target, allowed in cases:
            with self.subTest(kind=kind, operation=op):
                g = goal(kind=kind)
                grant(g, op, target)
                e = merge_evidence(compatibility_decided=True, checks_green=True, rollback_ready=True)
                self.assertEqual(not operation(g, op, target, e), allowed)

    def test_draft_kind_stops_manifest_and_product_even_with_edit_grant(self):
        for kind in ("issue-draft", "release-draft"):
            g = goal(kind=kind, allowed_paths=["package.json", "apps/client"], forbidden_paths=[],
                     owners=[{"owner": "parent", "status": "active", "paths": ["package.json", "apps/client"]}])
            for p in ("package.json", "apps/client/a.ts"):
                grant(g, "edit", p)
                self.assertIn("draft request permits artifact writes only", operation(g, "edit", p))

    def test_ungranted_commit_push_pr_merge_deploy_release_close_cleanup(self):
        for op in ("commit", "push", "pr", "merge", "deploy", "release", "issue-close", "cleanup"):
            with self.subTest(op=op):
                self.assertFalse(stub(goal(), op, "production", merge_evidence())["called"])

    def test_p4_one_writer_and_takeover(self):
        g = goal()
        g["owners"].append({"owner": "other", "status": "active", "paths": ["docs"]})
        self.assertTrue(route(g, ["docs/trial-note.md"])["blockers"])
        self.assertTrue(operation(g, "edit", "docs/trial-note.md"))
        g["owners"][0]["status"] = "stopped"
        self.assertEqual(route(g, ["docs/trial-note.md"])["blockers"], [])
        g["owners"] = []
        self.assertTrue(route(g, ["docs/trial-note.md"])["blockers"])

    def test_p5_checkpoint_freshness_and_partial_integration(self):
        g = goal()
        cp = {"request_id": g["request_id"], "owner": "parent", "owner_status": "stopped", "fingerprint": "old", "unfinished": ["AC2"], "integration_complete": False}
        r = harness.resume(g, cp, "new")
        self.assertEqual(r["status"], "READY")
        self.assertFalse(r["reuse_validation"])
        self.assertFalse(r["integration_complete"])
        cp["owner_status"] = "active"
        self.assertEqual(harness.resume(g, cp, "old")["status"], "BLOCKED")
        cp["owner_status"] = "stopped"
        cp.pop("owner")
        self.assertEqual(harness.resume(g, cp, "old")["status"], "BLOCKED")

    def test_p6_wip_paused_and_protected_cleanup(self):
        g = goal()
        self.assertTrue(operation(g, "edit", "docs/trial-note.md", {"preexisting_dirty": ["docs/trial-note.md"]}))
        g["paused_paths"] = ["docs"]
        self.assertTrue(route(g, ["docs/trial-note.md"])["blockers"])
        self.assertTrue(operation(g, "edit", "docs/trial-note.md"))
        grant(g, "cleanup", "trial")
        e = {k: True for k in ("task_owned", "clean", "integrated", "absolute_target_verified", "issue_closed_readback")}
        e.update(branch="codex/trial", current_branch="v1")
        self.assertEqual(operation(g, "cleanup", "trial", e), [])
        for branch in ("v1", "main", "unrelated", "codex/current"):
            self.assertTrue(operation(g, "cleanup", "trial", {**e, "branch": branch, "current_branch": "codex/current"}))
        for key in ("clean", "task_owned", "integrated", "absolute_target_verified"):
            self.assertTrue(operation(g, "cleanup", "trial", {**e, key: False}))
        self.assertTrue(operation(g, "cleanup", "trial", {**e, "paused_target": True}))

    def test_p7_merge_positive_and_negative_matrix(self):
        rows = [
            ("bot-postmerge", {"author_is_bot": True}, "post", True),
            ("user-approval-alone", {"author_is_bot": False}, None, False),
            ("user-fallback", {"author_is_bot": False, "human_approved": False, "same_account_deadlock": True, "deadlock_evidence": "fixture account equality"}, "explicit", True),
            ("user-no-review", {"author_is_bot": False, "human_approved": False}, "explicit", False),
            ("high-bot-approval", {"profile": "High-Risk"}, "post", False),
            ("high-user-approval", {"profile": "High-Risk", "author_is_bot": False}, "post", False),
            ("high-bot-explicit", {"profile": "High-Risk"}, "explicit", True),
            ("high-user-explicit", {"profile": "High-Risk", "author_is_bot": False}, "explicit", True),
            ("unknown-author", {"author_is_bot": None}, "explicit", False),
            ("no-login", {"author_login": ""}, "explicit", False),
            ("failed-checks", {"checks": "failed"}, "explicit", False),
            ("pending-checks", {"checks": "pending"}, "explicit", False),
            ("thread-open", {"actionable_threads": 1}, "explicit", False),
            ("missing-followup", {"followup_done": False}, "explicit", False),
            ("head-drift", {"head": "new"}, "explicit", False),
        ]
        for label, changes, authority, expected in rows:
            with self.subTest(row=label):
                g = goal()
                if authority:
                    grant(g, "merge", "post-merge:pr:1" if authority == "post" else "pr:1")
                self.assertEqual(not operation(g, "merge", "pr:1", merge_evidence(**changes)), expected)
        g = goal(kind="pr-publish")
        grant(g, "merge", "pr:1")
        self.assertTrue(operation(g, "merge", "pr:1", merge_evidence()))

    def test_p7_readback_order_and_no_self_approval(self):
        g = goal()
        grant(g, "merge", "pr:1")
        self.assertEqual(stub(g, "merge", "pr:1", merge_evidence(), {"operation": "merge", "target": "pr:1", "confirmed": False})["status"], "BLOCKED")
        grant(g, "issue-close", "issue:1")
        self.assertTrue(operation(g, "issue-close", "issue:1", {"closure_evidence_readback": True, "merged_readback": False}))
        self.assertEqual(operation(g, "issue-close", "issue:1", {"closure_evidence_readback": True, "merged_readback": True}), [])
        grant(g, "self-approve", "pr:1")
        self.assertTrue(operation(g, "self-approve", "pr:1"))

    def test_p8_untrusted_grants_and_redaction(self):
        for source in ("issue", "review", "tool"):
            g = goal()
            grant(g, "deploy", "production", source=source)
            self.assertTrue(operation(g, "deploy", "production", merge_evidence(compatibility_decided=True, checks_green=True, rollback_ready=True)))
        value = "synthetic fixture: token=FAKESECRET sk-FIXTURE_SECRET_123 authorization: bearer SYNTHETIC"
        redacted = harness.redact(value)
        for secret in ("FAKESECRET", "FIXTURE_SECRET", "SYNTHETIC"):
            self.assertNotIn(secret, redacted)
        quoted = '{"password": "SYNTHETIC_SECRET_197", "api_key": "SYNTHETIC_API_197"}'
        self.assertNotIn("SYNTHETIC", harness.redact(quoted))

    def test_reply_resolve_gate(self):
        g = goal(kind="review-response")
        grant(g, "resolve", "thread:1")
        self.assertTrue(operation(g, "resolve", "thread:1"))
        self.assertEqual(operation(g, "resolve", "thread:1", {"reply_readback": "comment-url", "validation_passed": True}), [])

    def test_paths_fail_closed(self):
        for p in ("../other", "C:/work/a", "/root", "a/../b", "a\\b", "./a", ""):
            with self.subTest(path=p), self.assertRaises(ValueError):
                clean_path(p)


class EvidenceTests(unittest.TestCase):
    def test_redaction_preserves_json_values_and_jsonl_metrics(self):
        event = {"type": "turn.completed", "reason": "failed token=SYNTHETIC_VALUE",
                 "usage": {"input_tokens": 123, "output_tokens": 5},
                 "nested": [{"Password": "SYNTHETIC_PASSWORD", "ok": True}, None, 7],
                 "quoted": 'failure "api_key": "SYNTHETIC_API"'}
        with tempfile.TemporaryDirectory() as tmp:
            events = Path(tmp) / "events.jsonl"
            for serialized in (json.dumps(event), json.dumps(event, indent=2),
                               json.dumps({"reason": "failed token=SYNTHETIC_VALUE"})):
                masked = harness.redact(serialized)
                decoded = json.loads(masked)
                self.assertNotIn("SYNTHETIC", masked)
                self.assertIn("[REDACTED]", decoded["reason"])
            raw = json.dumps({"type": "turn.started", "reason": "token=SYNTHETIC_START"}) + "\n" + json.dumps(event) + "\n"
            events.write_text(harness.redact(raw), encoding="utf-8")
            rows = [json.loads(line) for line in events.read_text().splitlines()]
            self.assertEqual(rows[1]["usage"], event["usage"])
            self.assertEqual(rows[1]["nested"], [{"Password": "[REDACTED]", "ok": True}, None, 7])
            self.assertNotIn("SYNTHETIC", events.read_text())
            self.assertEqual(harness.metrics(events, {})["usage"], [event["usage"]])

    def test_cli_redaction_output_remains_parseable_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            events, metadata = Path(tmp) / "events.jsonl", Path(tmp) / "metadata.json"
            events.write_text('{"type":"turn.completed","usage":{"input_tokens":9}}\n', encoding="utf-8")
            metadata.write_text(json.dumps({"reason": "failed token=SYNTHETIC_VALUE", "nested": {"api_key": "SYNTHETIC_KEY"}}), encoding="utf-8")
            process = subprocess.run([sys.executable, str(harness.HERE / "harness.py"), "metrics", "--events", str(events), "--metadata", str(metadata)], check=True, capture_output=True)
            decoded = json.loads(process.stdout)
            self.assertNotIn(b"SYNTHETIC", process.stdout)
            self.assertEqual(decoded["nested"]["api_key"], "[REDACTED]")
            self.assertEqual(decoded["usage"], [{"input_tokens": 9}])

    def test_pr_publication_validates_existing_patch_without_authorizing_new_edit(self):
        g = goal(kind="pr-publish", publication_fingerprint="fixed-patch", grants=[])
        grant(g, "pr", g["target"])
        p = route(g, ["docs/trial-note.md"])
        p["publication_fingerprint"] = "fixed-patch"
        self.assertEqual(completion(g, p, "fresh", evidence_for(g, p))["status"], "COMPLETE")
        g["paused"] = True
        self.assertEqual(completion(g, p, "fresh", evidence_for(g, p))["status"], "BLOCKED")
        g["paused"] = False
        self.assertTrue(operation(g, "edit", "docs/trial-note.md"))
        p["publication_fingerprint"] = "changed-patch"
        self.assertEqual(completion(g, p, "fresh", evidence_for(g, p))["status"], "BLOCKED")

    def test_unauthorized_diff_cannot_complete(self):
        for g in (goal(ceiling="read-only"), goal(grants=[])):
            p = route(g, ["docs/trial-note.md"])
            self.assertEqual(completion(g, p, "fresh", evidence_for(g, p))["status"], "BLOCKED")

    def test_complete_low_risk_requires_actual_evidence(self):
        g = goal()
        p = route(g, ["docs/trial-note.md"])
        self.assertEqual(completion(g, p, "fresh", {})["status"], "BLOCKED")
        e = evidence_for(g, p)
        self.assertEqual(completion(g, p, "fresh", e)["status"], "COMPLETE")
        self.assertEqual(completion(g, p, "changed", e)["status"], "BLOCKED")
        e["manual"]["ci-surface-parity"]["status"] = "skip"
        self.assertEqual(completion(g, p, "fresh", e)["status"], "BLOCKED")

    def test_high_risk_review_independence_freshness_coverage(self):
        g = goal(semantics=["restore"])
        p = route(g, ["docs/trial-note.md"])
        e = evidence_for(g, p)
        self.assertEqual(completion(g, p, "fresh", e)["status"], "COMPLETE")
        for key, value in (("reviewer", "parent"), ("fingerprint", "old"), ("coverage", ["contract"]), ("independent", False), ("status", "BLOCKED"), ("status", "ESCALATION"), ("status", None)):
            changed = copy.deepcopy(e)
            changed["review"][key] = value
            self.assertEqual(completion(g, p, "fresh", changed)["status"], "BLOCKED")

    def test_latest_failure_and_finding_disposition_not_hidden(self):
        g = goal(semantics=["restore"])
        p = route(g, ["docs/trial-note.md"])
        e = evidence_for(g, p)
        e["commands"]["worker-test"].append({"exit_code": 1, "log": "retry.log", "fingerprint": "fresh"})
        self.assertEqual(completion(g, p, "fresh", e)["status"], "BLOCKED")
        e["commands"]["worker-test"].append({"exit_code": 0, "log": "fixed.log", "fingerprint": "fresh"})
        e["findings"] = [{"id": "F1", "severity": "Must fix", "disposition": "deferred", "evidence": "x", "remaining_risk": "x"}]
        self.assertEqual(completion(g, p, "fresh", e)["status"], "BLOCKED")
        e["findings"][0]["disposition"] = "fixed"
        self.assertEqual(completion(g, p, "fresh", e)["status"], "COMPLETE")

    def test_metrics_missing_is_null_not_estimated(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "events.jsonl"
            path.write_text('{"type":"turn.started"}\n', encoding="utf-8")
            result = harness.metrics(path, {"run_id": "smoke"})
            self.assertIsNone(result["usage"])
            self.assertIsNone(result["spawn_ids"])
            self.assertIsNone(result["all_agents_total_tokens"])
            path.write_text('{"type":"turn.completed","usage":{"input_tokens":123,"cached_input_tokens":10,"output_tokens":5}}\n', encoding="utf-8")
            result = harness.metrics(path, {})
            self.assertEqual(result["usage"][0]["input_tokens"], 123)
            self.assertIsNone(result["all_agents_total_tokens"])


class IsolationTests(unittest.TestCase):
    def test_export_replaces_all_active_legacy_governance(self):
        with tempfile.TemporaryDirectory(prefix="harness-v2-export-test-") as tmp:
            destination = Path(tmp) / "trial"
            harness.install(harness.SOURCE_ROOT, destination, harness.PRODUCT_BASE)
            # Check every active location, not just the previously enumerated
            # client/worker/shared paths. Blueprint files are not active here.
            actual = {p.relative_to(destination).as_posix() for p in destination.rglob("AGENTS*.md")
                      if "tools/harness-v2/runtime/" not in p.relative_to(destination).as_posix()}
            self.assertEqual(actual, {"AGENTS.md", "apps/client/AGENTS.md", "apps/worker/AGENTS.md", "packages/shared/AGENTS.md"})
            for rel in actual:
                self.assertEqual((destination / rel).read_bytes(), (harness.HERE / "runtime" / rel).read_bytes())
            self.assertFalse((destination / "WORKFLOW.md").exists())
            self.assertFalse((destination / "QUALITY.md").exists())

    def test_timeout_keeps_partial_log_and_attempt(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "trial"
            root.mkdir()
            (root / ".harness-v2.json").write_text('{"mode":"harness-v2-prototype"}', encoding="utf-8")
            log = Path(tmp) / "timeout.log"
            with patch.object(harness, "fingerprint", return_value="fresh"), patch.object(harness.subprocess, "run", side_effect=subprocess.TimeoutExpired("fixture", 600, output=b"partial output", stderr=b"timeout stderr")):
                result = harness.run_check(root, goal(), "lint", log)
            self.assertEqual(result["exit_code"], 124)
            self.assertTrue(result["timeout"])
            self.assertIn("partial output", log.read_text())
            self.assertTrue(result["ended_at"])

    def test_existing_destination_refused_without_mutation(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "wip"
            dest.mkdir()
            wip = dest / "mine.txt"
            wip.write_bytes(b"user WIP")
            with self.assertRaises(ValueError):
                harness.install(harness.SOURCE_ROOT, dest, "HEAD")
            self.assertEqual(wip.read_bytes(), b"user WIP")

    def test_snapshot_observes_untracked_staged_and_worktree(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            def git(*args):
                subprocess.run(["git", "-C", tmp, *args], check=True, capture_output=True)
            git("init", "-b", "codex/test")
            file = root / "tracked.txt"
            file.write_bytes(b"base")
            git("add", ".")
            git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "base")
            first = harness.snapshot(root)
            base = first["head"]
            file.write_bytes(b"staged")
            git("add", ".")
            second = harness.snapshot(root)
            self.assertNotEqual(first["fingerprint"], second["fingerprint"])
            file.write_bytes(b"unstaged")
            (root / "untracked.txt").write_bytes(b"WIP")
            third = harness.snapshot(root)
            self.assertNotEqual(second["fingerprint"], third["fingerprint"])
            self.assertIn("untracked.txt", third["files"])
            self.assertEqual(harness.snapshot(root), third)
            # The index can hide a change even when worktree equals base.
            file.write_bytes(b"base")
            self.assertIn("tracked.txt", harness.changed_paths(root, base))
            file.write_bytes(b"unstaged")
            different_index = harness.publication_fingerprint(root, base)
            git("add", "tracked.txt")
            self.assertNotEqual(different_index, harness.publication_fingerprint(root, base))
            publication_untracked = harness.publication_fingerprint(root, base)
            git("add", ".")
            publication = harness.publication_fingerprint(root, base)
            self.assertEqual(publication_untracked, publication)
            git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "change")
            self.assertEqual(set(harness.changed_paths(root, base)), {"tracked.txt", "untracked.txt"})
            self.assertEqual(publication, harness.publication_fingerprint(root, base))

    def test_asset_formats_and_model(self):
        result = harness.check_assets()
        self.assertEqual(result["model"], "gpt-6.1-sol")
        self.assertEqual(result["agents"], ["independent-reviewer"])
        self.assertEqual(set(result["skills"]), {"verify-change", "submit-work"})


if __name__ == "__main__":
    unittest.main()
