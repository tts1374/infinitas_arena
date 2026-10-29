---
name: branch-latest-sync-flow
description: "Safely sync a base/default branch such as `v1` to the latest upstream state while classifying dirty paths, preserving real user WIP, and reconciling upstream-equivalent residue."
---

# Branch Latest Sync Flow

## Overview

Use this skill when the user asks to make a branch such as `v1` latest/current with upstream.
This flow is for branch synchronization, not for cleanup of arbitrary worktrees or for destructive history rewrites.
Return a sync decision and reconciliation artifact, not a generic git troubleshooting narrative.

## Inputs

- Target branch (default: `v1`)
- Current git state (`status`, current branch, worktree list)
- Upstream branch/ref
- Any sticky user constraints about preserving WIP
- Whether the target branch is a default/base branch worktree

## Workflow

1. Fetch the upstream target branch.
2. Classify dirty paths before syncing:
   - `user WIP`
   - `upstream-equivalent residue`
   - `generated/untracked residue`
3. Measure divergence between local and upstream.
4. Choose sync strategy:
   - fast-forward when possible
   - rebase when local commits should be preserved cleanly
   - merge only when explicitly appropriate
5. If temporary stash is needed, use a labeled targeted stash rather than stashing unrelated paths blindly.
6. Perform the sync.
7. Reconcile temporary residue/stash:
   - restore or clean upstream-equivalent in-scope residue
   - preserve explicit user WIP
   - record keep/drop disposition for temporary stash entries
8. Report final branch status and whether the target worktree is clean.

Do not:
- replace the caller's ownership of branch policy or WIP preservation decisions
- treat procedural completion as success unless final branch/read-back evidence is clear

## Output Contract

Always return:
1. `Target branch`
2. `Upstream ref`
3. `Divergence summary`
4. `Dirty-path classification`
5. `Sync strategy`
6. `Stash actions`
7. `Final branch status`
8. `Final status`

Use this template:

```text
Target branch: <branch>
Upstream ref: <ref>

Divergence summary:
- <summary>

Dirty-path classification:
- user WIP: <paths or "none">
- upstream-equivalent residue: <paths or "none">
- generated/untracked residue: <paths or "none">

Sync strategy:
- <fast-forward|rebase|merge>
- reason: <why>

Stash actions:
- <none or labeled stash + disposition>

Final branch status:
- branch head: <sha>
- worktree status: <clean|dirty>
- residual note: <note or "none">

Final status: <COMPLETE|BLOCKED|ESCALATION>
```

## Rules

- Treat `v1を最新化` as a sync request that includes fetch and local branch reconciliation.
- Do not destroy user-owned WIP.
- Do not leave a default/base branch worktree dirty when the remaining paths are only upstream-equivalent residue.
- Empty status reporting is not enough; classify why paths are dirty before choosing stash/rebase/merge.
- If final status is dirty, explain exactly what was preserved and why.
- Do not use destructive reset/checkout unless the user explicitly requests it.
- Do not invent extra sync steps when divergence, residue class, and final cleanliness are already proven.

## References

- `references/latest-sync-checklist.md`
