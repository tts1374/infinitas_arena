# FSM/Protocol Invariants

Use these invariant IDs when reporting impact.

| ID | Invariant | Source |
| --- | --- | --- |
| INV-01 | Worker route is thin; Durable Object owns FSM, timers, aggregation, authoritative acceptance, broadcast, and idempotency | local worker governance |
| INV-02 | Room lifecycle follows the current design contract for room states and explicit transitions | `docs/design/01_fsm.md`, `QUALITY.md` |
| INV-03 | Timer/deadline behavior remains consistent with explicit contract start points, durations, and timeout handling | `docs/design/07_constants.md`, `QUALITY.md` |
| INV-04 | Authoritative submission acceptance remains tied to expected key, valid round/match context, and server-side rules | local worker/shared governance, `QUALITY.md` |
| INV-05 | Idempotency de-duplicates by `(player_id, client_msg_id)` with intentional lifetime semantics across recovery/recreation boundaries | local worker governance, `QUALITY.md` |
| INV-06 | Host authority boundaries remain intact for host-only actions and forced progression behavior | local worker governance, `QUALITY.md` |
| INV-07 | Public lobby summary remains lightweight, visibility-filtered, and free of stale/expired listing state | local worker/shared governance, `QUALITY.md` |
| INV-08 | State loss or unrecoverable authoritative state results in explicit `ROOM_STATE_LOST` handling rather than silent continuation | local worker governance, `QUALITY.md` |
| INV-09 | Recovery/reconnect/hibernation behavior does not invent lifecycle progress or rely on unrecoverable in-memory assumptions | local worker governance, `QUALITY.md` |

## Impact Review Questions

For each changed area, answer:

- Which invariant IDs are affected?
- Is behavior preserved, tightened, or changed?
- If changed, which design docs are updated first?
- Which validation groups prove safety?
- What residual risk remains if some checks are not yet executed?