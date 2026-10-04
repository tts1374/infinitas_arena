---
name: commit-pr-flow
description: "Run a Phase C commit and PR flow from bounded plan items with strict scope control, validation gating, and review-ready output. Use when implementation is done and you need to stage intended files only, verify plan-to-diff alignment, create logical commits, and prepare or open a PR."
---

# Commit Pr Flow

## Overview

Use this skill after bounded implementation work is complete and ready to be finalized in Phase C.
Convert a scoped diff into reviewable commits and a PR without expanding scope.
Return publish-ready evidence and status, not broad workflow re-planning.

## Inputs

- Task label or plan item label
- In-scope files or subtree
- Explicit non-goals and forbidden scope
- Required validation level from `QUALITY.md`
- Current git state (`status`, changed files, diff summary)
- Base branch (default: `v1`)
- CI/repo validation surface when relevant (`package.json` scripts, workspace `tsconfig`, `.github/workflows/*`)
- If this flow opens a PR, post-publish read-back of `author.login` / `author.is_bot`
- Audit/review findings that must be disposed before PR, if any

## Workflow

1. Confirm phase boundary:
- Run only in Phase C.
- Stop and escalate if requirement shaping or execution planning is still unresolved.

2. Confirm scope boundary:
- Compare changed files to declared in-scope files.
- If unrelated local changes exist, isolate the scoped work in a clean worktree or equivalent before staging.
- Isolate or defer unrelated changes.
- Keep `1 plan item = 1 logical commit` when practical.
- If clean worktree isolation is used, record the source worktree path and plan how it will be reconciled before returning `COMPLETE`.

3. Run commit gate:
- Check staged diff matches the selected plan item.
- Keep generated file changes separated from handwritten logic when possible.
- Do not stage files outside declared ownership.

4. Run validation gate:
- Select minimum required checks from `references/phase-c-gate-checklist.md`.
- Compare local candidate checks with repo CI validation surface.
- If local workspace checks are narrower than CI for touched files, promote the command set to CI-equivalent or broader.
- When new or changed test files are outside the standard test/typecheck surface, add an explicit compensating command or stop as `BLOCKED`.
- Execute required checks before commit.
- Record pass/fail/skip with concrete reason.

5. Create commit:
- Stage only intended files.
- Use a clear message with scope context.
- Do not amend unrelated commits.
- Do not hide failed checks.

6. Prepare PR:
- Use `references/pr-template-phase-c.md`.
- Include objective, changes, non-changes, impact, validation evidence, and regression checks.
- Add rollback and compatibility notes for high-risk changes.

7. Read back author identity when a PR is opened:
- Read back `author.login` and `author.is_bot` after PR publication.
- Record lane evidence as `bot-created PR` or `task-owned / user-authored PR`.
- Do not assume the intended publish path or task ownership determines the lane.
- If author identity cannot be read back, stop as `BLOCKED` before handing off to merge / close flows.

8. Run source worktree reconciliation gate:
- If a clean worktree or equivalent isolation was used, inspect the original source worktree before returning.
- If remaining dirty/untracked paths are limited to in-scope files that now match the committed branch or upstream, restore/clean them or place them in a labeled targeted stash.
- Do not leave the default/base branch source worktree dirty with upstream-equivalent in-scope residue unless the user explicitly asked to preserve it.
- Record the reconciliation action and final source worktree status.

9. Final consistency gate:
- Ensure diff remains within declared scope.
- Ensure required validation evidence is present.
- If audit/review findings exist, include a disposition ledger for each `Blocker`, `Must fix`, and relevant `Should fix`.
- Do not continue to PR handoff while unresolved `Blocker` or `Must fix` findings remain without explicit rescope/defer evidence.
- Ensure completion status is explicit (`COMPLETE`, `BLOCKED`, or `ESCALATION`).

Do not:
- replace agent/user judgment about scope changes, merge authority, or unresolved product decisions
- claim readiness from command execution alone when scope or evidence gates are still ambiguous

## Output Contract

Always return:
- Scope check result
- Validation result summary
- Validation surface parity note
- Findings disposition ledger when audit/review findings exist
- Source worktree reconciliation summary
- Commit units created (hash + message)
- PR title and body (or PR URL if created)
- PR author/lane evidence when a PR was created
- Open risks, if any
- Final status: `COMPLETE`, `BLOCKED`, or `ESCALATION`

User-facing summaries should be written in Japanese unless the user explicitly requests another language. Keep fixed protocol labels, command names, and code identifiers unchanged.

## Escalation Conditions

- Out-of-scope files are required to finish current task.
- Required validation fails.
- Contract-sensitive impact is discovered unexpectedly.
- Plan item is too broad to commit safely as one logical unit.

## Prohibited Behavior

- Do not stage all changes blindly.
- Do not open a PR with unresolved required checks unless explicitly approved.
- Do not mix unrelated cleanup with scoped implementation.
- Do not claim completion while `Blocker` or unresolved `Must fix` findings remain.
- Do not omit disposition evidence for audit/review findings that affected the commit or PR decision.
- Do not assume workspace `typecheck` covers touched test files.
- Do not assume a newly added test file is already part of the standard test script without checking.
- Do not assume a published PR is `bot-created PR` without read-back of `author.login` / `author.is_bot`.
- Do not finish with a dirty default/base branch source worktree when the remaining in-scope residue is already upstream-equivalent.
- Do not let commit mechanics hide missing success criteria, missing validation evidence, or out-of-scope drift.

## References

- `references/phase-c-gate-checklist.md`
- `references/pr-template-phase-c.md`
