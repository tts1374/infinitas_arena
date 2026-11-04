---
name: quality-check-matrix
description: "Reference skill for validation-scope selection. Used by orchestrators, implementers, or auditors to map touched areas to the minimum required verification groups from QUALITY.md. This skill does not replace audit/completion decisions and does not by itself declare a task complete."
---

# Quality Check Matrix

## Overview

Use this skill only as a reference aid for `strategy-orchestrator`, `execution-coordinator`, implementers, or auditors when deciding which verification groups are required for a given change.
Return a validation recommendation artifact, not a pass/fail judgment.

This skill does not:
- replace implementation ownership
- replace audit ownership
- declare a task complete by itself
- decide pass/fail for the whole task by itself

It only helps determine:
- which validation groups are required now
- which validation groups are not required
- what residual risk remains when checks are not run

## Inputs

- Requested change summary
- Current task framing from the calling agent
- Expected changed files/layers
- Current execution mode if already known (`Local Execution Mode` or `Plan Mode`)
- Repository quality rules:
  - `QUALITY.md`
  - `AGENTS.md`
  - `WORKFLOW.md`

Invoke this skill only after the calling agent has framed the task enough to identify the likely touched areas.

## Workflow

1. Identify touched areas from the request and expected changed files/layers.
2. Load `references/quality-verification-matrix.md`.
3. Select required checks:
   - Always include universal checks.
   - Add conditional checks only for matched areas.
   - Add workflow-artifact checks when the task is governance-heavy, closure-heavy, or explicitly about Phase C/D operation.
4. Return only:
   - required validation groups
   - not-required validation groups with reasons
   - residual risks when checks are expected to remain `not run`
   - artifact/evidence reminders when the task is planning/closure oriented

Do not:
- execute implementation work
- declare completion by yourself
- replace audit verdicts by yourself
- infer task success from procedure completion alone

## Decision Rules

- Include all universal checks on every task.
- Include area-specific checks only when the touched area matches the matrix.
- Include workflow-artifact checks when the task updates governance docs, performs closure work, or produces C Kickoff / follow-up / issue-close evidence artifacts.
- If uncertain whether a conditional area is touched, recommend including the safer additional checks.
- If an environment constraint may prevent execution, keep the check in scope and surface the resulting residual risk explicitly.

These rules support execution and review. They do not replace orchestrator, implementer, or auditor ownership of final decisions.

## Output Format

Validation recommendation

Required now:
- [ ] <check group or concrete check>
- [ ] <check group or concrete check>

Not required:
- <check group>: <reason>

Residual risks if not run:
- <risk or None>

Artifact reminders:
- <artifact or None>

## References

* `references/quality-verification-matrix.md`
* `references/validation-output-template.md`
