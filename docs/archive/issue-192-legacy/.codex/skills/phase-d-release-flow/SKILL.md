---
name: phase-d-release-flow
description: Automate Phase D closure and release operations for this repository. Use when Phase D is complete and you need to run version bump, optional MIN_SUPPORTED_CLIENT_VERSION bump decision, version commit/push, conditional deploy workflow dispatch (worker/web/desktop), and GitHub Release notes update in a single bounded flow.
---

# Phase D Release Flow

## Overview

Run a repeatable Phase D release sequence with one script:
`scripts/release/phase-d-release.mjs`.

Use this skill only after Phase D is confirmed `COMPLETE`.
Return a release execution/evidence summary, not a release-policy substitute.

## Inputs

- `version` (required): next release version (`x.y.z`)
- `from-ref` (optional): diff base for update detection (default: latest tag)
- `MIN_SUPPORTED_CLIENT_VERSION` decision:
  - pass `--bump-min-supported`, or
  - pass `--no-bump-min-supported`
- optional deploy overrides:
  - `--force-*` / `--skip-*` for worker, web, desktop
- optional release-note URL source:
  - `--download-url`, or
  - `--public-r2-base-url`
- optional release-note section items (repeatable):
  - `--feature "<text>"`
  - `--fix "<text>"`
  - `--other "<text>"`
  - `--note "<text>"`

## Workflow

1. Ensure preconditions:
- run on clean git state unless explicitly overriding with `--allow-dirty`
- run on base branch `v1` unless explicitly overriding with `--allow-non-base-branch`

2. Detect update targets from `git diff <from-ref>..HEAD`:
- `apps/worker/**` or `packages/shared/**` -> worker deploy candidate
- `apps/web/**` -> web deploy candidate
- `apps/client/**` or `packages/shared/**` -> desktop release candidate

3. Resolve `MIN_SUPPORTED_CLIENT_VERSION` gate:
- if contract-sensitive files are included, script requires explicit decision flag
- do not continue with implicit default when gate is raised

4. Execute release flow:
- run `npm run version:bump -- <version> [--bump-min-supported]`
- commit version files
- push branch
- dispatch and optionally wait for target workflows:
  - `Deploy infinitas-arena Worker`
  - `Deploy INFINITAS ARENA Web to GitHub Pages`
  - `Release Desktop`
- update GitHub Release notes for `v<version>`

Do not:
- replace explicit release gating decisions with script-default assumptions
- treat dispatched commands as success without post-run evidence

5. Keep release-note body in this format:

```md
## Download URL

- Windows (windows-x86_64):

## 変更点

### 新機能

- 

### 不具合修正

- 

### その他

- 

### Notes

- 
```

## Command Templates

Standard run:

```bash
npm run release:phase-d -- --version 1.2.0 --no-bump-min-supported
```

Run with release-note section items:

```bash
npm run release:phase-d -- \
  --version 1.2.0 \
  --no-bump-min-supported \
  --feature "BPL 4 STAGE を追加" \
  --feature "PRIVATEルーム自動再戦フローを追加" \
  --fix "join導線の不具合を修正" \
  --other "運用ログ整備を実施" \
  --note "詳細は各PRを参照"
```

Run with explicit `MIN_SUPPORTED_CLIENT_VERSION` bump and R2 URL source:

```bash
npm run release:phase-d -- --version 1.2.0 --bump-min-supported --public-r2-base-url "https://updates.example.com"
```

Dry-run:

```bash
npm run release:phase-d -- --version 1.2.0 --no-bump-min-supported --dry-run
```

## Output Contract

Always report:
- selected diff base and detected target updates
- `MIN_SUPPORTED_CLIENT_VERSION` decision
- version bump commit and push result
- dispatched/skipped workflows
- release-note update result
- final status (`COMPLETE`, `BLOCKED`, or `ESCALATION`)

## Escalation Conditions

- diff base cannot be resolved (`--from-ref` required)
- `MIN_SUPPORTED_CLIENT_VERSION` decision gate is raised and not explicitly provided
- required workflow fails
- release tag does not exist and creation is not explicitly allowed

## Prohibited Behavior

- do not skip explicit `MIN_SUPPORTED_CLIENT_VERSION` decision when gate is raised
- do not push unrelated files
- do not bypass workflow failures as success
- do not silently create a missing release unless explicitly requested
- do not let the script path hide missing release evidence or ambiguous gate decisions
