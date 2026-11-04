---
name: fsm-protocol-guard
description: "Reference skill for high-risk Room FSM and WebSocket protocol review support. Used by strategy-orchestrator, contract-auditor, or implementation-auditor to identify high-risk FSM/protocol work, impacted invariants, and required validation. This skill does not replace stage/routing/audit decisions and does not by itself authorize implementation or completion."
---

# FSM Protocol Guard

## Overview

Use this skill only as a reference aid for `strategy-orchestrator`, `contract-auditor`, or `implementation-auditor` when a task may touch high-risk room flow behavior.
Return risk evidence and invariant impact only; do not expand into execution ownership or implementation instructions.

This skill does not:
- replace stage classification
- replace team-shape selection
- replace contract review or implementation audit
- authorize implementation by itself
- declare the task complete by itself

It only helps identify:
- whether the task belongs to a high-risk FSM/protocol surface
- which invariants are affected
- which validation scope is required
- what residual risk must remain visible

## Inputs

- User request or bounded change summary
- Current task framing from the orchestrating/reviewing agent
- Expected affected files and layers
- Existing contract sources:
  - `AGENTS.md`
  - `WORKFLOW.md`
  - `QUALITY.md`
  - `docs/design/01_fsm.md`
  - `docs/design/02_ws_protocol.md`
  - `docs/design/03_data_model.md`
  - `docs/design/07_constants.md`

Invoke this skill only after the calling agent has framed the task enough to judge whether FSM/protocol risk may exist.

## Workflow

1. Detect whether the change touches FSM/protocol risk areas with `references/fsm-protocol-risk-matrix.md`.
2. Determine whether repository rules imply:
   - `high-risk treatment`
   - `Plan Mode recommendation`
3. Check invariant impact with `references/fsm-protocol-invariants.md`.
4. If contract behavior changes are implied, identify which design docs must be updated first.
5. Produce only:
   - risk recommendation
   - impacted invariants
   - required validation groups
   - residual risks or unresolved uncertainty

Do not:
- create downstream handoff packets
- proceed into implementation by yourself
- declare the task complete by yourself
- replace orchestrator/auditor judgment with skill-local verdicts

## Decision Rules

- Recommend high-risk treatment when the task touches FSM transitions, timer/deadline semantics, authoritative acceptance rules, idempotency behavior, public lobby summary behavior, failure/recovery behavior, or WS schema/payload contracts.
- Recommend `Plan Mode` when one or more plan-required triggers match.
- If uncertain, recommend the safer high-risk/Plan Mode path.

These rules support orchestration and review. They do not replace orchestrator or auditor ownership of final decisions.

## Output Format

Risk recommendation: <high-risk / not high-risk>
Plan Mode recommendation: <required / not required>
Matched triggers:
- <trigger 1>
- <trigger 2>

Invariants impacted:
- <invariant id>: preserved | tightened | changed
  - Note: <impact summary>

Required validation groups:
- <group>
- <group>

Residual risks:
- <risk or None>

## References

- `references/fsm-protocol-risk-matrix.md`
- `references/fsm-protocol-invariants.md`
- `references/fsm-protocol-checklist-template.md`
