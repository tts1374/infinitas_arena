# packages/shared AGENTS

## 0. Scope

`packages/shared` は client/worker 間の契約境界。

対象:
- enums/constants/models
- protocol-facing types
- cross-layer identifiers
- compatibility-relevant schema fields

共通ガバナンス:
- root `AGENTS.md`
- `WORKFLOW.md`
- `QUALITY.md`

---

## 1. Invariants

- shared は cross-layer contract のみを置く
- client-only / worker-only convenience を持ち込まない
- additive/breaking を明示せずに変更しない
- one-sided migration を残さない

---

## 2. Contract-sensitive Triggers

常に contract-sensitive とみなす候補:
- `RoomState`
- `CloseReason`
- `SourceType`
- WS message `type/payload`
- result/snapshot/settings compatibility fields
- shared constants / cross-layer IDs

ルール:
- 必要なら design docs 先行更新
- 変更時は consumer coverage を明示
- staged rollout は互換期間と撤去条件を明示

---

## 3. Validation Focus

shared 変更時は最低限次を確認:
- affected client/worker usage の整合
- exhaustive switch / parser / serializer 破綻なし
- additive/breaking 分類の明示
- `QUALITY.md` の契約検証要件を満たす