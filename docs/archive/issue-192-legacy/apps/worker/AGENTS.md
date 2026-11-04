# apps/worker AGENTS

## 0. Scope

`apps/worker` は Worker 入口と DO authoritative runtime の責務を持つ。

対象:
- HTTP/WS entry
- Durable Object room lifecycle
- timer/deadline/TTL
- acceptance/idempotency
- aggregation/result generation
- lobby summary maintenance
- recovery/hibernation handling

共通ガバナンス:
- root `AGENTS.md`
- `WORKFLOW.md`
- `QUALITY.md`
- `packages/shared/AGENTS.md`（sharedを触る場合）

---

## 1. Invariants

- Worker route は thin を維持
- lifecycle/timer/acceptance authority は DO に集約
- LobbyDirectoryDO を public summary の唯一 source とする
- read path cleanup は probe 時点より新しい summary を削除してはならない
- freshness 判定に使う token は、同一 ms 衝突をまたいでも単調性を失わない形を優先する
- lobby cleanup / freshness のための persisted helper state は bounded であるか、明示 reclamation を持つ
- generation/recreation/recovery 意味を暗黙化しない
- `ROOM_STATE_LOST` を汎用 close へ downgrade しない

---

## 2. Contract-sensitive Triggers

次は高リスク扱い:
- FSM 遷移変更
- WS schema/type/payload 変更
- timer/TTL semantics 変更
- idempotency/expected_key 変更
- lobby summary schema/filter 変更
- persistence/recovery compatibility 変更

上記に該当する場合:
- Plan/監査要否は `WORKFLOW.md` に従う
- 検証は `QUALITY.md` の該当マトリクスを満たす

---

## 3. Validation Focus

worker 変更時は最低限次を確認:
- state transition の妥当性
- timer/deadline start/expiry 挙動
- acceptance boundary/current-round enforcement
- idempotency duplicate/replay
- lobby visibility/TTL
- stale cleanup vs newer upsert/recreate race
- lobby helper state の growth / reclaim / restore compatibility
- recovery/reconnect/`ROOM_STATE_LOST`
