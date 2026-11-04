# FSM/Protocol Risk Matrix

Use this matrix to decide whether the change must be treated as high-risk.
If one or more rows match, recommend high-risk treatment and usually `Plan Mode`.

| Risk trigger | Examples | Source |
| --- | --- | --- |
| Durable Object FSM/timer/aggregation/authority change | Room transition logic, timer behavior, host-only actions, aggregation flow | `WORKFLOW.md` 2, local worker governance |
| WS schema/payload contract change | message `type`, payload shape, required/optional fields | `WORKFLOW.md` 2, root/shared governance |
| Idempotency behavior change | de-dup key changes, replay handling change, dedupe lifetime change | local worker governance, `QUALITY.md` |
| expected-key / acceptance enforcement change | accept rules, timing windows, round checks, authoritative submission rules | local worker governance, `QUALITY.md` |
| Public lobby summary behavior change | summary schema, visibility filtering, TTL/listing behavior | `WORKFLOW.md` 2, local worker/shared governance |
| Recovery / failure-mode change | `ROOM_STATE_LOST`, reconnect/recovery assumptions, hibernation-resume behavior | local worker governance, `QUALITY.md` |
| Cross-layer contract change | client + worker + shared message/flow coupling | `WORKFLOW.md` 2, root/shared governance |
| Design-contract update required | update `docs/design/*` before implementation | root `AGENTS.md`, `WORKFLOW.md` 2 |

## Usually not this skill's target

- Local UI wording/display-only fixes
- Minor validation changes inside existing responsibility
- Test additions without behavior or contract change
- Static web LP/join presentation work
- Updater-only version/channel/metadata work