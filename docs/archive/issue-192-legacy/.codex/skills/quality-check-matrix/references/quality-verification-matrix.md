# QUALITY Verification Matrix

Use this matrix to choose the minimum required checks for the current change.
Always apply universal checks first, then add conditional checks by touched area.

## Universal Checks (Always Required)

Source: `QUALITY.md` sections 1 and 2.

- Build succeeds (no type errors) where applicable.
- Lint passes (no lint errors) where applicable.
- Tests pass where applicable.
- No unnecessary dependency additions.
- Diff is limited to intended files.
- No unrelated formatting-only changes.
- Generated outputs are updated only when intentional.
- UTF-8 (no BOM) and LF consistency is preserved.

## Conditional Checks by Change Area

| Touched area | Required additional checks | Source |
| --- | --- | --- |
| Room FSM, timers, aggregation, host authority, authoritative acceptance, idempotency, WS protocol payload/schema | Run all FSM/Protocol checks | `QUALITY.md` section 3.1 |
| Lobby summary, freshness tokens, stale cleanup, helper-state persistence | Run lobby freshness/cleanup checks | `QUALITY.md` section 3.2 |
| Monitoring watcher/parser, source formats (`inf-notebook`, `daken_counter_v3`, `reflux`, legacy `inf_daken_counter` when enabled), source failure handling | Run all monitoring source checks | `QUALITY.md` section 3.3 |
| Multi-player room flow behavior (ARENA/BPL), timeout/force advance/skip, recovery/failure behavior, DO state loss flow | Run all required E2E/scenario checks | `QUALITY.md` section 3.4 |
| Release prep tasks | Run release precondition and evidence checks | `.codex/skills/phase-d-release-flow/SKILL.md`, `WORKFLOW.md` Phase D rules |
| Persistence/settings/snapshot compatibility changes | Run compatibility-focused validation required by root/local governance | root/local governance, `QUALITY.md` |
| Agent/governance definition changes | Run agent/design-contract checks and responsibility-boundary validation | `QUALITY.md` section 3.5, root `AGENTS.md`, `WORKFLOW.md` |
| Workflow artifacts and closure tasks | Check phase ceiling, delegation evidence, validation parity, write-back confirmation, and applicable closure/cleanup gates | `QUALITY.md` section 3.6 |
| UI implementation with a design source/wireframe reference | Check source evidence and implementation parity | `QUALITY.md` section 3.7 |

## FSM/Protocol Checklist Scope

When section 3.1 is required, include:

- RoomState transitions.
- Timer/deadline/TTL behavior.
- expected-key / authoritative acceptance enforcement under the current contract.
- idempotency by `client_msg_id`.
- host permissions.
- public lobby summary behavior (visibility filtering, stale/expired listing handling).

## Monitoring Source Checklist Scope

When section 3.3 is required, include:

- `inf-notebook` extraction (`SCORE`, `MISSCOUNT`).
- `daken_counter_v3` extraction.
- `reflux` extraction.
- `inf_daken_counter` extraction when legacy support is enabled.
- `observed_key == expected_key` enforcement where relevant.
- `SOURCE_UNAVAILABLE` behavior with TECH skip guidance.

## E2E Checklist Scope

When section 3.4 is required, include:

- create -> ready -> pick -> play -> result, including ARENA/BPL scenarios where applicable.
- Duplicate pick replacement.
- TIMEOUT and FORCE_ADVANCE behavior.
- `SKIP_HOST_ASSIGN` rejection behavior.
- DO state loss to `ROOM_STATE_LOST` and room close.
- Recovery/reconnect behavior where the changed area makes it relevant.

## Agent/Governance Checklist Scope

When section 3.5 is required, include:

- `npm run check:agents` and `npm run check:design-contracts`.
- Approved repository/default subagent model settings and canonical role references.
- Portable skill paths, unified status/severity vocabulary, and Japanese user-facing output.
- Consistent objective/success/stop boundaries across root docs, agents, and skills.
- Agent-owned judgment and implementer/auditor continue vs. BLOCKED/ESCALATION boundaries.

For sections 3.2, 3.6, and 3.7, use the corresponding root `QUALITY.md` checklist directly.

## Practical Rule

- If uncertain whether a conditional area is touched, include the extra checks.
- If an environment constraint prevents execution, mark the check as `not run`, explain why, and note residual risk.
- Do not claim completion from universal checks alone when behavior semantics changed.