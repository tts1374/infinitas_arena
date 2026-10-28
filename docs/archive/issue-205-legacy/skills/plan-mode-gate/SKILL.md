---
name: plan-mode-gate
description: "Reference skill for execution-profile and Plan Mode decision support. Used by strategy-orchestrator or execution-coordinator to classify `Local-Fast / Standard / High-Risk`, determine whether Plan Mode is required, and emit a Spawn Gate hint before implementation. This skill does not replace stage/routing decisions and does not by itself authorize implementation."
---

# Plan Mode Gate

## Overview

Use this skill only as a reference aid for `strategy-orchestrator` or `execution-coordinator` when deciding execution profile and whether work should run in Plan Mode.
Return an outcome-first decision artifact, not a downstream execution plan.

This skill does not:
- replace stage classification
- replace team-shape selection
- replace bounded handoff preparation
- authorize direct implementation by itself

It only supports the execution-profile and Plan Mode decision using repository governance.

## Inputs

- User request
- Current task framing from the orchestrating agent
- Expected affected files and layers (client, worker, shared, docs, CI, web, update-worker)
- Repository rules from:
  - `AGENTS.md`
  - `WORKFLOW.md`
  - `QUALITY.md`

This skill should be invoked only after the orchestrating agent has already framed the task enough to evaluate risk.

## Workflow

1. Summarize the requested change and expected outcome in 1 to 3 bullets.
2. Classify risk with `references/plan-mode-decision-matrix.md`.
3. Decide whether repository rules imply:
   - `Local-Fast`
   - `Standard`
   - `High-Risk`
4. Decide whether Plan Mode is required.
5. Add a Spawn Gate hint:
   - `non-spawn acceptable`
   - `execution-coordinator recommended`
   - `High-Risk mandatory spawn path`
4. Return only:
   - execution profile recommendation
   - Plan Mode recommendation
   - matched trigger(s) or local-execution basis
   - Spawn Gate hint
   - minimum validation scope implied by `QUALITY.md`
   - whether a plan artifact is required before implementation

Do not:
- perform stage classification beyond Plan Mode support
- prepare team shape
- create downstream handoff packets
- proceed into implementation by yourself
- replace the orchestrator's judgment with skill-local policy

## Decision Rules

- Default to `Plan Mode` for architecture changes, DO FSM/timers/aggregation/authority changes, WS schema changes, source I/O spec changes, public lobby contract changes, compatibility-impacting data format changes, CI/deploy changes, dependency updates including lockfile, cross-layer changes, security/reproducibility/integrity impact, and design-doc-first contract changes.
- Default to `Local Execution Mode` for local UI/text/validation fixes, single-file bug fixes inside existing responsibilities, and test additions without behavioral change.
- If uncertain, choose `Plan Mode`.

These rules support orchestration. They do not replace orchestrator ownership of scope/routing decisions.

## Output Formats

Write user-facing output in Japanese unless the user explicitly requests another language.
Keep fixed labels such as `Local-Fast`, `Standard`, `High-Risk`, and `Plan Mode` unchanged.

Execution profile recommendation: <Local-Fast|Standard|High-Risk>
Plan Mode recommendation: <required|not required>
Basis: <matched trigger(s) or local-fast basis>
Spawn Gate hint: <non-spawn acceptable|execution-coordinator recommended|High-Risk mandatory spawn path>
Required artifact: <tasks/<branch-or-pr-name>.md or none>
Suggested validation: <minimal required checks>

## References

* `references/plan-mode-decision-matrix.md`
* `references/task-plan-template.md`
