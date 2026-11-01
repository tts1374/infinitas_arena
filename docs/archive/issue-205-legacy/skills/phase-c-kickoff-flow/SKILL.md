---
name: phase-c-kickoff-flow
description: "Create Phase C kickoff artifacts before implementation starts. Use when Phase A/B is already decided and Codex needs to restate the source of truth, re-judge execution profile, apply the Spawn Gate, and emit a `delegation execution record` from an Issue, `tasks/*.md`, or, only when concrete task artifacts are not required, an A-lite agreement."
---

# Phase C Kickoff Flow

## Overview

Use this skill only after Phase A/B inputs are already available.
Do not use it for initial requirement shaping or task breakdown.
Use it to restate execution boundaries and kickoff evidence, not to prescribe implementation micro-steps.

## Inputs

- Source of truth:
  - `tasks/*.md`
  - `Issue`
  - A-lite agreement summary (only when governing context does not require a concrete task artifact)
- Current Phase A/B result, if already stated
- Expected touched layers
- Current request ceiling / next unlock condition, if already fixed
- Objective / success criteria / stop condition, if already fixed in the source artifact
- Applicable governance:
  - `AGENTS.md`
  - `WORKFLOW.md`
  - `QUALITY.md`

## Workflow

1. Confirm that Phase C is the next intended step.
2. Confirm whether the governing context requires a concrete `tasks/*.md` artifact.
3. Identify the source of truth and restate it explicitly.
4. Re-judge:
   - execution profile
   - Plan Mode status
   - Spawn Gate result
5. State:
   - current request ceiling
   - whether implementation is authorized now
   - next unlock condition
   - any already-fixed success or stop conditions that bound the kickoff
6. Emit `delegation execution record` entries for each role that matters now.
7. If a concrete task artifact is required and missing, return `BLOCKED` instead of falling back to A-lite.
8. If a mandatory spawn path is missing, return `BLOCKED` instead of silently continuing.
9. Use [references/kickoff-checklist.md](references/kickoff-checklist.md) and the repository-root `docs/c_kickoff_comment_template.md` to keep output shape stable.

## Output Contract

Always return these sections in this order:
1. `C Kickoff status`
2. `Source of truth`
3. `Execution profile re-judgment`
4. `Plan Mode`
5. `Current request boundary`
6. `Implementation authorization`
7. `Spawn Gate result`
8. `delegation execution record`
9. `Replan triggers`

Write user-facing kickoff output in Japanese unless the user explicitly requests another language.
Keep fixed protocol labels, role names, file paths, and status tokens unchanged.

Use this template:

```text
C Kickoff status: <READY|BLOCKED>

Source of truth:
- <Issue / tasks file / A-lite summary>

Execution profile re-judgment:
- <Local-Fast|Standard|High-Risk>

Plan Mode:
- <YES|NO>

Current request boundary:
- <ceiling>
- allowed now: <outputs>
- forbidden now: <outputs>
- next unlock condition: <condition>

Implementation authorization:
- <YES|NO>

Spawn Gate result:
- <result>

delegation execution record:
- role: <role-name>
- spawned: <yes|no>
- objective: <objective>
- agent id: <actual agent id when yes; N/A when no>
- ownership scope: <assigned files/layer when yes; N/A when no>
- status: <actual agent status when yes; N/A when no>
- no-delegate reason: <reason or N/A>

Replan triggers:
- <trigger or "none">
```

## Rules

- Do not start implementation in the same output block.
- `READY` kickoff does not by itself authorize implementation.
- Do not invent extra process steps when the source artifact already defines the success boundary clearly.
- If the user already explicitly requested `Phase C implementation` / `C〜D execution` and the source artifact does not declare a narrower ceiling such as `kickoff-only` / `task-authoring-only` / `planning-only`, set the current request boundary to `implementation-ready`, set `Implementation authorization: YES`, and use `next unlock condition: none` instead of inventing another explicit authorization step.
- Do not omit the source of truth.
- Do not mark kickoff `READY` if a mandatory High-Risk spawn path is still missing.
- Use `delegation execution record` consistently in kickoff output; do not replace it with `delegation execution plan`.
- For `spawned: yes`, record the actual agent id, assigned ownership scope, and current status; future spawn plans are not execution evidence. For `spawned: no`, mark these fields `N/A` and explain the no-delegate reason.
- If governing context requires `tasks/*.md`, do not fall back to an A-lite agreement when the artifact is missing; return `BLOCKED`.
- A-lite fallback is allowed only when the workflow explicitly permits no concrete task artifact.
- If current request ceiling is kickoff-only / task-authoring-only / planning-only, stop after kickoff even when kickoff is `READY`.
- If missing artifact is the only blocker and artifact creation is allowed, creating that artifact does not automatically authorize same-turn implementation unless the same request already explicitly authorizes downstream implementation.
