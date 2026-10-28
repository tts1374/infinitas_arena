# Validation Output Template

Use this template for validation planning and reporting.
Write user-facing validation summaries in Japanese unless the user explicitly requests another language.
Keep command names, file paths, and fixed status tokens unchanged.

## Validation Recommendation

Required now:
- [ ] <check 1>
- [ ] <check 2>

Not required:
- <conditional check group>: <reason>

## Execution Results

- <check>: pass | fail | not run
  - Evidence: <one-line result>
- <check>: pass | fail | not run
  - Evidence: <one-line result>

## Residual Risks

- <risk from any failed or not-run check, or `None`>

## Notes

* Keep the checklist aligned to changed areas only.
* Do not report checks outside scope as mandatory.
* Keep evidence concise and factual.
* If checks remain `not run`, make the resulting risk explicit rather than implying completion.
* Do not use this template as a substitute for audit or completion ownership.
