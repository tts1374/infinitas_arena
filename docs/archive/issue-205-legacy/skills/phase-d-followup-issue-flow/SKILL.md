---
name: phase-d-followup-issue-flow
description: "Turn Phase D findings into issue-ready follow-up artifacts. Use when Codex has implementation summaries, audit findings, or closure notes and needs to produce bounded next-cycle Issue text with acceptance criteria, validation, execution-profile guidance, and delegation hints."
---

# Phase D Followup Issue Flow

## Overview

Use this skill to prevent Phase D from ending with only a priority list.
Convert accepted follow-up candidates into artifacts that can be pasted into Issues or kickoff comments.
This includes governance/process/prompt/snippet improvements when they are explicit Phase D findings.
Return issue-ready artifacts and prioritization evidence, not a generic retrospective.

## Inputs

- Implementation summary
- Audit findings
- Current constraints and non-goals
- Release timing or cycle boundary, if known
- Governance/process gaps, if any
- Source worktree / branch hygiene incidents, if any

## Workflow

1. Merge implementation and audit evidence.
2. Separate:
   - urgent correctness work
   - bounded maintenance work
   - optional polish
   - governance/process/prompt improvements
   - branch/worktree hygiene improvements
3. Decide which items deserve their own follow-up Issue versus a bundle.
4. For promoted items, emit an `Issue-ready artifact` using the repository-root `docs/issue_ready_followup_template.md`.
5. Add:
   - recommended execution profile
   - Plan Mode recommendation
   - delegation hint or no-delegate basis
6. Use [references/followup-checklist.md](references/followup-checklist.md) to keep granularity stable.

Do not:
- replace product or governance judgment with auto-promoted backlog churn
- treat a weak observation as issue-ready unless the artifact is actually bounded

## Output Contract

Always return:
1. `Phase D summary`
2. `Prioritized follow-ups`
3. `Issue-ready artifacts`
4. `Bundle candidates`
5. `Out-of-cycle items`
6. `Next step recommendation`

Apply these rules:
- Promote only actionable items.
- Do not stop at title-only backlog entries.
- Keep each issue-ready artifact bounded enough to re-enter Phase A/B without re-discovery.
- If an item still needs a human product decision, mark it explicitly instead of pretending it is ready.
- Do not auto-convert every governance observation into a docs patch. Promote only recurring or reusable gaps.
- Governance/process follow-ups should identify the affected doc/skill/agent/prompt surface explicitly.
- Source worktree residue on default/base branches is a promotable governance/process gap when it recurs or risks user confusion.
