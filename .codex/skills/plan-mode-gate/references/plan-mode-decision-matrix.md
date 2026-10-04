# Plan Mode Decision Matrix

Use this table to decide `Local Execution Mode` vs `Plan Mode`.
If one or more plan-required triggers match, choose `Plan Mode`.

## Plan-Required Triggers

| Trigger | Typical examples | Source |
| --- | --- | --- |
| Architecture change | Responsibility split changes, major flow redesign | `WORKFLOW.md` 2 |
| DO core behavior change | FSM, timers, aggregation, authority, idempotency | `WORKFLOW.md` 2, root/local worker governance |
| WebSocket contract change | `type`/`payload` schema changes | `WORKFLOW.md` 2, root/shared governance |
| Monitoring source I/O spec change | `inf_daken_counter` / `inf-notebook` / source acceptance behavior changes | `WORKFLOW.md` 2, root/local client/shared governance |
| Public lobby contract change | Schema/list/filtering/visibility behavior for lobby summaries | `WORKFLOW.md` 2, local worker/shared governance |
| Compatibility-impacting format change | `settings` / result snapshot / persistence-facing format changes | `WORKFLOW.md` 2, root/local client/shared governance |
| CI or deployment change | Wrangler, Workers, DO, updater/web deployment/resource config | `WORKFLOW.md` 2, root governance |
| Dependency update | Package/crate updates, lockfile change | `WORKFLOW.md` 2, root governance |
| Cross-layer change | Spans client + worker + shared, or requires coordinated contract rollout | `WORKFLOW.md` 2, root/shared governance |
| Security/reproducibility/integrity impact | Authz, replay safety, consistency constraints | `WORKFLOW.md` 2 |
| Requires design-doc contract update first | Implementation must follow updated `docs/design/*` | `WORKFLOW.md` 2, root `AGENTS.md` |
| Agent/governance definition change | Changes to agent role boundaries, orchestration rules, canonical `*.md` and `.toml` semantics | `WORKFLOW.md`, root `AGENTS.md` |

## Usually Local Execution

| Condition | Typical examples | Source |
| --- | --- | --- |
| Localized change in existing responsibility | Single-file bug fix, local validation tweak | `WORKFLOW.md` 1.A, 2 |
| UI-only update | Text, i18n, small rendering fix | `WORKFLOW.md` 1.A, 2 |
| Test-only reinforcement | Add test without behavior change | `WORKFLOW.md` 1.A, 2 |
| Canonical-to-derived sync only | Sync `.toml` from already-finalized `*.md` without semantic change | `WORKFLOW.md`, root `AGENTS.md` |

## Validation Scope Mapping

Always apply:
- Technical checks: build, lint, test, no unnecessary dependency additions.
- Diff checks: only intended files, no unrelated formatting, no generated noise, UTF-8 no BOM and LF consistency.

Add checks only when changed area matches:
- FSM/Protocol touched: apply `QUALITY.md` section 3.1 checks.
- Lobby summary/freshness/cleanup touched: apply `QUALITY.md` section 3.2 checks.
- Monitoring source touched: apply `QUALITY.md` section 3.3 checks.
- End-to-end room flow touched: apply `QUALITY.md` section 3.4 checks.
- Persistence/settings/snapshot compatibility touched: apply compatibility-focused checks required by root/local governance.
- Agent/governance definitions touched: apply `QUALITY.md` section 3.5 checks, including `npm run check:agents` and `npm run check:design-contracts`.
- Workflow artifacts/closure tasks touched: apply `QUALITY.md` section 3.6 checks.
- UI design source/wireframe requirements present: apply `QUALITY.md` section 3.7 checks.

## Tie-Breaker Rule

If classification is uncertain, choose `Plan Mode`.