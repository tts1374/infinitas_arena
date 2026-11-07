---
name: phase-c-review-response-flow
description: "Handle a PR review iteration as a bounded Phase C continuation. Use when Codex receives review URLs or threads and needs to inspect actionable comments, keep scope anchored to the original Issue/task, rerun required validation/audit, and prepare or execute reply/resolve/re-review steps."
---

# Phase C Review Response Flow

## Overview

Use this skill when a user brings PR review feedback and expects Phase C work to continue from the existing source of truth.
Do not treat the review thread itself as a new specification.
Return a bounded review-response artifact and write-back plan, not a broad redesign of the task.

## Inputs

- Source of truth:
  - `Issue`
  - `tasks/*.md`
  - linked PR
- Review context:
  - review URL
  - inline thread URL
  - unresolved review threads
  - CI / validate output when the review signal comes from automation or failing checks
- Current execution state:
  - touched layer
  - execution profile
  - current branch / diff state
- Design source / wireframe reference when the review concerns UI fidelity
- Existing audit/review findings and disposition state, if any
- Applicable governance:
  - `AGENTS.md`
  - `WORKFLOW.md`
  - `QUALITY.md`

## Workflow

1. Restate that this is a `Phase C` continuation and keep the original `Issue` / `tasks/*.md` as the scope anchor.
2. Inspect review context with thread-aware reads and separate:
   - actionable unresolved threads
   - informational or already-resolved threads
   - CI-only actionable failures that have no human review thread yet
3. Re-judge:
   - execution profile
   - contract-sensitive surface
   - whether `Replan Gate` is triggered
4. If the review fix stays in-scope, convert each actionable cluster into a bounded fix packet.
5. For `High-Risk` work, rerun required implementer / contract audit / implementation audit on the current state.
6. Run required validation from `QUALITY.md`.
   - If the trigger was CI / validate output, rerun the same command surface or a broader one.
7. Build a findings disposition ledger:
   - each actionable finding / review thread
   - disposition (`fixed`, `deferred with explicit scope`, `not applicable`, or `blocked`)
   - evidence
   - remaining risk
8. Prepare GitHub write-back in this order:
   - thread reply
   - resolve addressed thread
   - re-review request after no unresolved actionable thread remains
   - confirm each GitHub write via returned URL/id or read-back
9. Use [references/review-response-checklist.md](references/review-response-checklist.md) to keep the loop stable.

Do not:
- replace the source-of-truth artifact with review-thread-local assumptions
- treat a review suggestion as automatic authorization for broader scope

## Output Contract

Always return:
1. `Review response kickoff`
2. `Source of truth`
3. `Actionable thread set`
4. `Execution profile re-judgment`
5. `Validation and audit plan`
6. `Findings disposition ledger`
7. `GitHub write-back plan or completed actions`
8. `Final status`

Use this template:

```text
Review response kickoff: <READY|BLOCKED>

Source of truth:
- <Issue / tasks file / PR>

Actionable thread set:
- <thread / summary / severity>

Execution profile re-judgment:
- <Local-Fast|Standard|High-Risk>

Validation and audit plan:
- <required checks>

Findings disposition ledger:
- <finding/thread / disposition / evidence / remaining risk>

GitHub write-back plan or completed actions:
- reply: <planned|done|N/A>
- resolve: <planned|done|N/A>
- re-review request: <planned|done|N/A>

Final status:
- <COMPLETE|BLOCKED|ESCALATION>
```

## Rules

- Do not expand scope just because a review comment suggests a broader cleanup.
- Do not mark review work complete while actionable unresolved threads remain unaddressed.
- Do not mark review work complete while `Blocker` or `Must fix` disposition is missing.
- Do not resolve a thread without a substantive response tied to the final implementation.
- Do not request re-review while unresolved actionable threads remain.
- If a review requires contract change, cross-layer expansion, dependency update, or CI change, stop with `ESCALATION`.
- If there are no actionable unresolved threads, return a no-op `COMPLETE` with evidence instead of fabricating write-back work.
- Do not treat a narrower local validation pass as equivalent to the originating CI failure surface.
- Do not invent extra procedural gates when actionable threads, validation, and write-back confirmation already determine the next step.
- User-facing review response summaries should be written in Japanese unless the user explicitly requests another language. Keep thread ids, commands, and fixed status tokens unchanged.
