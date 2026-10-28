---
name: post-approval-merge-flow
description: "Merge a reviewed PR after human approval using repository merge gates, then optionally continue through Issue close and local cleanup. Use when Codex is asked to own the post-approval sequence for a bot-created or task-owned PR."
---

# Post Approval Merge Flow

## Overview

Use this skill when the user wants Codex to take over after human review and approval.
This flow governs merge authorization, merged-state verification, and the optional downstream sequence of Issue close and local cleanup.
Return merge-gate evidence and downstream status, not a substitute for explicit merge authority.

## Inputs

- Target PR URL or number
- Source of truth:
  - Issue
  - `tasks/*.md`
  - accepted bounded scope
- Execution profile (`Standard` or `High-Risk`)
- PR read-back of `author.login` / `author.is_bot`
- Merge authority lane derived from read-back (`bot-created PR` / `task-owned / user-authored PR`)
- Human approval state
- Required checks state
- Review thread state
- Whether single-maintainer same-account deadlock is claimed
- Whether current request includes:
  - merge only
  - merge + close
  - merge + close + cleanup

## Workflow

1. Confirm request boundary:
   - Stop if the current request does not authorize merge.
   - Keep scope anchored to the PR's source Issue / `tasks/*.md`.

2. Confirm merge gate:
   - Verify the human reviewer approval state. If `Standard` + `task-owned / user-authored PR` strict fallback is claimed, record whether approval is unavailable because of same-account deadlock instead of pretending approval exists.
   - Verify required checks are green, or stop with `BLOCKED` unless explicit skip authority exists.
   - Verify unresolved actionable review threads do not remain.
   - Verify follow-up detection / close prerequisites are ready if close will follow.
   - Read back `author.login` / `author.is_bot` and stop as `BLOCKED` if the merge lane cannot be fixed from evidence.

3. Apply approval authority rule:
   - Determine the merge authority lane from `author.login` / `author.is_bot`, not from the intended publish path.
   - `Standard` + `bot-created PR`: a human `Approve` may serve as merge authorization when all merge gates are green.
   - `Standard` + `task-owned / user-authored PR`: do not reuse the bot-created lane. If same-account single-maintainer deadlock is not proven, keep the normal approval requirement and stop as `BLOCKED` when it is missing. If deadlock is proven, require explicit user merge authorization (`mergeしてOK` or equivalent), required checks green, no unresolved actionable review threads, and follow-up detection / close prerequisites ready. Human `Approve` alone is not enough for this strict fallback.
   - `High-Risk`: require explicit user merge authorization or auto-merge permission in addition to approval.

4. Merge the PR:
   - Use the repository/default merge method unless the user asked for a specific one.
   - Do not self-approve.
   - Do not merge if approval/check/thread state is ambiguous.

5. Confirm merged state:
   - Require PR read-back showing merged state, merge commit SHA, or equivalent strong evidence.
   - Empty or silent write responses are not enough.

6. Run downstream steps only if requested:
   - `merge + close`: run `$issue-close-evidence-flow`
   - `merge + close + cleanup`: after close, run `$worktree-branch-cleanup-guard`

7. Report final status:
   - `COMPLETE` only if every requested downstream step finished and was verified.
   - Otherwise return `BLOCKED` or `ESCALATION` with the exact missing gate.

Do not:
- replace user/approval authority with skill-local assumptions
- treat an intended publish lane as evidence of the actual merge lane

## Output Contract

Always return:
1. `Merge recommendation`
2. `Missing merge evidence`
3. `Merge execution summary`
4. `Downstream sequence status`
5. `Final status`

Use this template:

```text
Merge recommendation:
- <READY|BLOCKED|ESCALATION>
- reason: <summary>

Missing merge evidence:
- <none or list>

Merge execution summary:
- target PR: <pr>
- execution profile: <profile>
- author identity: <author.login / author.is_bot>
- merge lane: <bot-created PR / task-owned / user-authored PR>
- approval state: <summary>
- required checks: <summary>
- review threads: <summary>
- merge result: <not run|merged>
- merged evidence: <merge commit sha / PR merged flag / URL>

Downstream sequence status:
- close: <not requested|complete|blocked>
- cleanup: <not requested|complete|blocked>

Final status: <COMPLETE|BLOCKED|ESCALATION>
```

## Rules

- Do not treat Codex-authored approval as merge authorization.
- Do not infer `bot-created PR` from the intended publish path when read-back evidence says otherwise or is missing.
- Do not use `task-owned / user-authored PR` strict fallback without explicit user merge authorization and deadlock evidence.
- Do not merge a `High-Risk` PR on approval alone.
- Do not merge with pending/failing required checks unless explicit authority exists and the skip is recorded.
- Do not close the Issue before merged state is confirmed.
- Do not run local cleanup before merged state is confirmed.
- Do not claim completion while any requested merge/close/cleanup step lacks read-back evidence.
- Do not invent extra process steps when merge authority, merged-state evidence, and requested downstream scope already determine the outcome.

## References

- `references/merge-checklist.md`
