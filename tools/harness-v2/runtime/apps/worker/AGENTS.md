# Worker boundary — Harness v2

Routeはthin、FSM/時刻/受付/集計はRoomDO、public summaryはLobbyDirectoryDOの正本を守る。古いcleanupがnewer/recreateを消さず、同ms token再一致を防ぎ、helper stateにbounded/reclaim方針を持つ。generation/recoveryを暗黙化せずROOM_STATE_LOSTを汎用closeへ落とさない。

詳細と検証条件は `docs/harness-v2/requirements.md` Q01〜Q08/Q10、`docs/design/01_fsm.md` / `02_ws_protocol.md` / `07_constants.md` / `10_regression_guard_addendum.md`。正常/拒否遷移、期限境界、replay、probe race、restore/reconnectを確認する。mock復元を実hibernationの実証と呼ばない。
