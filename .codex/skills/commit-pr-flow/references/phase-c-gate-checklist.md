# Phase C Gate Checklist

Use this checklist before creating commits and PRs in Phase C.

## 1. Scope Gate

- [ ] Changed files match declared in-scope files/subtree.
- [ ] Current request ceiling permits commit/PR work.
- [ ] Unrelated local diff is isolated or deferred before staging.
- [ ] No unrelated refactor, rename, reorder, or formatting-only change.
- [ ] Any scope expansion is explicitly justified.

## 2. Diff Gate

- [ ] Diff is minimal and task-focused.
- [ ] Generated artifacts are isolated when present.
- [ ] No accidental lockfile or build-output changes unless intended.
- [ ] If clean worktree isolation was used, the source worktree reconciliation plan is known before commit/PR.

## 3. Validation Gate

Always run universal checks unless impossible:

- [ ] Build/typecheck for touched layer
- [ ] Lint for touched layer
- [ ] Relevant tests for changed behavior
- [ ] Diff sanity (`git status`, targeted diff inspection)
- [ ] Validation surface matches or exceeds repo CI for touched files
- [ ] New or changed test files are included in the standard test/typecheck surface, or compensating commands are recorded

Run additional checks when matched by touched areas:

- Contract/FSM/protocol impact:
  - [ ] Contract-sensitive checks and related audits
- Persistence/settings/snapshot impact:
  - [ ] Compatibility-focused checks
- Cross-layer impact:
  - [ ] Integration-path checks

If any required check is not run, document reason and residual risk.

## 4. Commit Gate

- [ ] One logical purpose per commit.
- [ ] Commit unit aligns to selected plan item.
- [ ] Staged files only include intended ownership scope.
- [ ] Commit message is concrete and reviewable.

Recommended commit title format:

```text
<type>(<scope>): <what changed>
```

Examples:

```text
feat(settings): add collapsible section toggles
fix(room): prevent stale generation action handling
test(client): cover source validation boundary
```

## 5. PR Gate

- [ ] PR has one purpose.
- [ ] PR body includes objective and non-goals.
- [ ] PR body lists impact area and validation evidence.
- [ ] PR body lists regression checks.
- [ ] High-risk work includes rollback and compatibility notes.
- [ ] Source worktree final status is confirmed before returning `COMPLETE`.

Use:
- `pr-template-phase-c.md`
