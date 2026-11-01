# Client boundary — Harness v2

Worker/DOのauthorityを表示都合で上書きしない。host/non-host、stale/resync、source unavailable、fallback/authoritative結果を区別する。parser正本をUIで再実装しない。

詳細は `docs/harness-v2/requirements.md` Q03/Q05/Q07〜Q12、`docs/design/02_ws_protocol.md` / `06_source_io_spec.md` / `10_regression_guard_addendum.md` を該当時に読む。room state・WS解釈・保存・source・recoveryの意味変更はrootの独立レビュー対象。

Typed fixtureは公開型へ `satisfies` 等で照合し、required field/旧名driftを検出する。標準testと型includeが変更testへ到達するか確認し、対象外なら明示実行する。UI指定sourceを確認できなければ見た目準拠をPASSにしない。
