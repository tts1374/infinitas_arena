# FSM/Protocol Checklist Template

Use this template for high-risk pre-implementation review, contract review, or implementation audit support.

## Risk Recommendation

High-risk: yes | no
Plan Mode recommendation: required | not required
Reason:
- <matched risk trigger>

## Invariant Impact

- INV-01: preserved | tightened | changed
  - Note: <impact summary>
- INV-02: preserved | tightened | changed
  - Note: <impact summary>

## Required Validation Groups

- [ ] QUALITY section 1 (technical checks)
- [ ] QUALITY section 2 (diff checks)
- [ ] QUALITY section 3 (FSM/Protocol checks)
- [ ] QUALITY section 4 (source I/O checks, if touched)
- [ ] QUALITY section 5 (E2E checks, if touched)

## Validation Status

- <check>: pass | fail | not run
  - Evidence: <one-line proof>

## Residual Risks

- <risk from failed/not-run checks or None>

## Notes

* Do not treat this checklist as a substitute for orchestration or audit ownership.
* If contract behavior changes, update `docs/design/*` first.
* Keep scope minimal and avoid unrelated refactors.
* If checks remain `not run`, make the resulting risk explicit rather than implying completion.
