# Review Response Checklist

Use this checklist when handling review feedback as a Phase C continuation.

## 1. Scope Anchor

- [ ] Original `Issue` / `tasks/*.md` remains the source of truth.
- [ ] Review feedback is treated as delta input, not a new spec.
- [ ] Any scope expansion is explicitly justified or escalated.

## 2. Thread Triage

- [ ] Actionable unresolved threads are identified.
- [ ] Informational, outdated, or already-resolved threads are separated.
- [ ] Each actionable cluster maps to a bounded fix or explicit no-code response.

## 3. Risk Gate

- [ ] Execution profile is re-judged.
- [ ] Contract-sensitive surfaces are re-checked.
- [ ] `Replan Gate` is applied when scope, compatibility, dependency, or CI assumptions change.

## 4. Validation Gate

- [ ] Required validation from `QUALITY.md` is re-run for the final state.
- [ ] Required audit is re-run when the work is `High-Risk`.
- [ ] Pass/fail/skip evidence is recorded with concrete reason.
- [ ] If the trigger was CI / validate output, the rerun command surface matches or exceeds the failing command surface.
- [ ] If there are no actionable unresolved threads, the no-op conclusion is stated explicitly.

## 5. GitHub Write-back Gate

- [ ] Thread reply explains the final implementation state, not an intermediate attempt.
- [ ] Thread is resolved only after the reply is posted.
- [ ] Re-review is requested only after no unresolved actionable thread remains.
- [ ] Each GitHub write-back effect is confirmed by returned URL/id or read-back.
