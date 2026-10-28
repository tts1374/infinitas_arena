# Latest Sync Checklist

- [ ] Upstream target branch was fetched.
- [ ] Local vs upstream divergence was measured.
- [ ] Dirty paths were classified as `user WIP`, `upstream-equivalent residue`, or `generated/untracked residue`.
- [ ] Sync strategy (`fast-forward` / `rebase` / `merge`) was chosen with a concrete reason.
- [ ] Temporary stash, if any, was labeled and scoped.
- [ ] Upstream-equivalent residue was not left behind on the default/base branch worktree.
- [ ] Final `git status` was checked.
- [ ] Any preserved dirty state or stash was explained explicitly.
