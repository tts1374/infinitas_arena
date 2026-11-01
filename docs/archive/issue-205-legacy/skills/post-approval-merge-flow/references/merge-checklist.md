# Post-Approval Merge Checklist

- Is the target PR uniquely identified?
- Is the source of truth (`Issue` / `tasks/*.md`) still within bounded scope?
- Is there human approval?
- Are required checks green?
- Are unresolved actionable review threads absent?
- If the PR is `High-Risk`, is there explicit merge authorization or auto-merge permission?
- Was the merge method chosen or confirmed from repo default?
- Was merged state verified by PR read-back, merged flag, or merge commit SHA?
- If close was requested, was closure evidence confirmed before Issue close?
- If cleanup was requested, was cleanup run only after merge confirmation and then verified by read-back?
