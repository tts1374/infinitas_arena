# Task Plan Template

Use this template when `Plan Mode` is required.
Create `tasks/<branch-or-pr-name>.md` before implementation.
Write user-facing plan content in Japanese unless the user explicitly requests another language.
Keep fixed section labels, status tokens, file paths, and command names unchanged.

# <task-name>

## Purpose
- <what this task changes>

## Non-goals
- <what this task explicitly does not change>

## Current Request Boundary
- Ceiling: <task authoring only / kickoff only / implementation ready / ...>
- Allowed outputs now: <artifacts or phases allowed in this turn>
- Forbidden outputs now: <phases or outputs not allowed in this turn>
- Next unlock condition: <none when already implementation-ready / what explicit event allows the next phase>

## Changes
- <implementation item 1>
- <implementation item 2>

## Impact
- Users: <impact or none>
- Data: <impact or none>
- Compatibility: <impact or none>
- Cloudflare: <impact or none>

## Target Files / Layers
- Files: <explicit file list>
- Layers: <client / worker / shared / docs / CI / web / update-worker>

## Test Focus
- <build/lint/test and area-specific checks>

## Rollback Plan
- <how to disable/revert safely>

## Commit Split Plan
1. <logical commit 1>
2. <logical commit 2>

## Checklist
- [ ] Design doc alignment confirmed (if required)
- [ ] Impact scope identified
- [ ] Implementation completed
- [ ] Tests completed
- [ ] Regression checks completed
- [ ] Documentation updates completed (if required)

## Usage Notes

* Keep the plan minimal and directly tied to the requested change.
* Write user-facing descriptions in Japanese unless another language is explicitly requested.
* Do not start implementation before this file exists.
* Do not treat file existence alone as implementation authorization; honor the current request boundary.
* If the same user request already authorizes `Phase C implementation` / `C〜D execution` and the source artifact does not declare a narrower ceiling, set `Ceiling` to `implementation ready` and `Next unlock condition` to `none` instead of synthesizing another explicit authorization step.
* Keep one PR per purpose and avoid unrelated changes.
* Use explicit non-goals to prevent scope drift.
* If the task spans multiple layers, keep the dependency order visible.
* If the task includes contract-sensitive or compatibility-sensitive work, make the rollout and validation intent explicit.
