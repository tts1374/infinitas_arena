# WebSocketプロトコル設計（Ph1 / Cloudflare Workers + Durable Objects）

## 0. 前提（Cloudflare）
- ルーム = 1 Durable Object（DO）
- WorkerはHTTP/WSの入口（ルーティング）。FSM・権限・タイマー・集計はDO内で完結。
- WebSocket Upgrade は Worker で受け、対象DOへ転送する（DO側で accept）。
- 先着順・時刻基準は DO の `Date.now()` を正とする。
- 冪等化: クライアント送信は `client_msg_id`（UUID）必須。DO内で `(player_id, client_msg_id)` を重複排除。

## 1. 接続経路（推奨）
- `POST /api/rooms`（HTTP）: ルーム作成（room_id払い出し、RoomDO初期化、LobbyDirectoryDO登録）
- `GET /api/lobby`（HTTP）: 公開ロビー一覧（LobbyDirectoryDO読み）
- `GET /api/rooms/:room_id/ws?join_code=...`（WS Upgrade）: ルームへ接続（Workerがroom_idのDOへルーティング）
- `GET /api/charts`（HTTP）: 全体譜面検索（設定条件での候補取得）
- `GET /api/rooms/:room_id/charts`（HTTP）: ルーム文脈付き譜面検索（`match_song_unlock_filter` を反映）
- `GET /api/song-packs`（HTTP）: 楽曲パック一覧取得
- `GET /api/chart-aliases/resolve`（HTTP）: alias exact 解決（runtime alias）

## 2. 共通Envelope

### 2.1 Client -> DO（via WS）
```json
{
  "type": "MSG_TYPE",
  "client_msg_id": "uuid",
  "room_id": "string",
  "player_id": "string",
  "payload": {}
}
```

### 2.2 DO -> Client（via WS）
```json
{
  "type": "MSG_TYPE",
  "server_msg_id": "uuid",
  "server_time": "ISO8601",
  "room_id": "string",
  "payload": {}
}
```

## 3. メッセージ一覧（Client -> DO）

### 3.1 ルーム
- `ROOM_JOIN`
  - payload（PLAYER）: `{ session_kind?: "PLAYER", join_code?: string, display_name: string, source: "inf_daken_counter"|"inf-notebook"|"daken_counter_v3"|"reflux", client_version?: string, client_capabilities?: object }`
  - payload（SPECTATOR）: `{ session_kind: "SPECTATOR", join_code?: string, client_version?: string }`
  - 備考: WS接続直後に必ず送る（DOがJOIN完了するまでstate配信しない）
  - 備考: `client_capabilities.song_unlocks = { bit_unlocked: boolean, djp_unlocked: boolean, allow_leggendaria: boolean, owned_pack_ids: number[] }` を送ると、`START_MATCH` 時の共通解禁フィルタ計算に利用される
  - 備考: `session_kind="SPECTATOR"` は read-only 観戦セッションを要求する（player slot 非消費）
- `ROOM_LEAVE`
  - payload: `{ generation: number }`

### 3.2 LOBBY
- `READY_SET`
  - payload: `{ ready: boolean, generation: number }`
- `START_MATCH`（ホスト）
  - payload: `{ request_id: string, generation: number }`
- `RETURN_TO_LOBBY`（ホスト）
  - payload: `{ request_id: string, generation: number }`

### 3.2.1 RESULT（自動再戦）
- `AUTO_REMATCH_STOP`（ホスト）
  - payload: `{ request_id: string }`
- `AUTO_REMATCH_OPT_OUT`（本人）
  - payload: `{ request_id: string }`
- `SOURCE_STATUS_SET`（本人）
  - payload: `{ request_id: string, available: boolean }`

### 3.2.2 LOBBY / PICKING（クイックチャット）
- `QUICK_CHAT_POST`（本人）
  - payload: `{ request_id: string, phrase_ids: QuickChatPhraseId[] }`
  - 備考: `phrase_ids` は共有 quick-chat catalog の ID のみ受理する。DO が ID 順に表示文字列を結合し、空文字または20文字超過は拒否する
  - 備考: 任意 free-text は送信不可。spectator は read-only として拒否される

### 3.3 PICKING
- `PICK_SUBMIT`
  - payload: `{ request_id: string, pick_chart_key: string }`

### 3.4 PLAYING（提出/スキップ/強制）
- `RESULT_SUBMIT`
  - payload: `{ request_id: string, generation: number, round_index: number, observed_key: ExpectedKey, metric_value: number, source_meta?: object }`
- `SKIP_SELF`
  - payload: `{ request_id: string, round_index: number, reason: "UNOWNED"|"TECH"|"OTHER" }`
- `SKIP_HOST_ASSIGN`（ホスト / 予約）
  - payload: `{ request_id: string, round_index: number, target_player_id: string, reason: "UNOWNED"|"TECH"|"OTHER" }`
  - 備考: 現行v1では受理しない。未確定者の強制確定は `FORCE_ADVANCE` を用いる
- `FORCE_ADVANCE`（ホスト）
  - payload: `{ request_id: string }`

### 3.5 状態同期/疎通
- `STATE_GET`
  - payload: `{}`
- `PING`
  - payload: `{}`
  - 備考: 現行クライアント実装では `PICKING/PLAYING` かつ host のみ送信

## 4. メッセージ一覧（DO -> Client）

### 4.1 ルーム
- `ROOM_JOIN_ACCEPTED`
  - payload: `{ room_state_snapshot: RoomStateSnapshot, session_role?: "HOST"|"PLAYER"|"SPECTATOR" }`
- `ROOM_JOIN_REJECTED`
  - payload: `{ reason: string }`
  - 備考: `client_version` が最小対応版未満または未送信の場合、`reason` には `CLIENT_VERSION_UNSUPPORTED: ...` を返す
- `ROOM_UPDATED`
  - payload: `{ room_state_snapshot: RoomStateSnapshot }`
- `ROOM_CLOSED`
  - payload: `{ close_reason: CloseReason, closed_at: "ISO8601", result_ready: boolean, event_id: string }`
- `ROOM_NOTIFICATION`
  - payload: `{ kind: "match_found"|"count_beep"|"phase_locked"|"count_go"|"cancel"|"error", event_id: string, scheduled_at: "ISO8601" }`

### 4.2 LOBBY
- `READY_STATUS_CHANGED`
  - payload: `{ player_id: string, ready: boolean }`
- `QUICK_CHAT_POSTED`
  - payload: `{ message: QuickChatMessage }`
  - 備考: `LOBBY/PICKING` で受理された quick-chat を全参加セッションへ配信する。同期正本は `RoomStateSnapshot.quick_chat_messages` にも含める
- `START_MATCH_REJECTED`
  - payload: `{ reason: string }`

### 4.3 PICKING
- `PICK_ACCEPTED`
  - payload: `{ player_id: string, pick_chart_key: string, accepted_at: "ISO8601" }`
- `PICK_REJECTED`
  - payload: `{ reason: string }`
- `PICK_FROZEN`
  - payload: `{ frozen_rounds: FrozenRound[] }`

### 4.4 PLAYING
- `ROUND_BEGIN`
  - payload: `{ round_index: number, expected_key: ExpectedKey, round_started_at: "ISO8601", soft_ttl_seconds: number }`
- `PLAYER_ROUND_CONFIRMED`
  - payload: `{ round_index: number, player_id: string, status: "PLAYED"|"SKIPPED"|"TIMEOUT", metric_value: number, reason?: string|null, submitted_at: "ISO8601", submitted_by: "SELF"|"HOST"|"SYSTEM", source_meta?: object|null }`
- `ROUND_ENDED`
  - payload: `{ round_index: number }`
- `FORCE_ADVANCE_APPLIED`
  - payload: `{ round_index: number, timed_out_players: string[] }`
- 備考: Round Result（曲別リザルト）は専用WSメッセージを持たず、`ROUND_ENDED` と `STATE_SNAPSHOT/ROOM_UPDATED` を用いたクライアント表示フェーズで扱う
- 備考: 非最終ラウンドは `PLAYING -> Round Result -> PLAYING` の表示順序で次ラウンドへ進む

### 4.5 RESULT
- `RESULT_READY`
  - payload: `{ summary: { match_id, mode, win_metric, total_rounds, completed_rounds, winner_player_ids, is_draw, is_rated, rated_block_reason, rating_before, rating_after, rating_delta }, per_round: { rounds: RoundResult[] }, per_player: { players: PlayerResult[] } }`
  - 備考: `per_round.rounds[].results[]` には `status / metric_value / reason / submitted_at / submitted_by / source_meta?` を必須で含める
  - 備考: `rated_block_reason` は最低限 `private_room | missing_submission | mismatch_observed_key | incomplete_match | skip_occurred | timeout_occurred | force_advanced | result_conflict` を扱う
  - 備考: v1 では `RESULT_READY.summary.is_rated` がレート適用可否の権威情報
  - 備考: v1 では `RESULT_READY.summary.match_id` を結果確定時の統計識別子の正本とし、欠落時のみ `room_id` fallback を許容
  - 備考: 進行中セッション識別は `RoomStateSnapshot.current_match_id` を正本とする（`RESULT_READY.summary.match_id` と同一であること）
  - 備考: 通常フローでは `PLAYING -> RESULT` 遷移時に配信し、`RESULT -> LOBBY` 復帰まで保持して表示する
  - 備考: 最終ラウンド完了時は `RESULT` 内で `Final Round Result -> Match Result` の順で表示する（Round Result は表示フェーズであり追加メッセージは不要）

### 4.6 同期/エラー
- `STATE_SNAPSHOT`
  - payload: `{ room_state_snapshot: RoomStateSnapshot }`
- `ERROR`
  - payload: `{ code: string, message: string }`
- `PONG`
  - payload: `{}`

## 5. 型定義（最小）

### 5.1 ExpectedKey
```json
{
  "play_style": "SP|DP",
  "difficulty": "NORMAL|HYPER|ANOTHER|LEGGENDARIA|...",
  "title_search_key": "string",
  "chart_id": "number|null (optional)"
}
```

### 5.2 FrozenRound
```json
{
  "round_index": 0,
  "expected_key": { "play_style":"DP","difficulty":"NORMAL","title_search_key":"...", "chart_id": 12345 },
  "display": { "title":"string", "level": 12 }
}
```

### 5.3 RoomStateSnapshot（Ph1最小）
```json
{
  "room_id": "string",
  "generation": 1,
  "current_match_id": "string",
  "room_state": "LOBBY|PICKING|PLAYING|RESULT|CLOSED",
  "settings": { "...": "..." },
  "auto_rematch_enabled": false,
  "auto_rematch_countdown_started_at": "ISO8601|null",
  "auto_rematch_due_at": "ISO8601|null",
  "auto_rematch_generation": 0,
  "auto_rematch_cancelled": false,
  "auto_rematch_block_reason": "string|null",
  "next_match_opt_out_player_ids": [],
  "last_match_end_reason": "string|null",
  "host_player_id": "string",
  "players": [
    { "player_id": "string", "display_name": "string", "source": "inf_daken_counter|inf-notebook|daken_counter_v3|reflux", "song_unlocks": { "bit_unlocked": false, "djp_unlocked": false, "allow_leggendaria": false, "owned_pack_ids": [] }, "connected": true, "ready": false }
  ],
  "match_song_unlock_filter": { "include_bit": false, "include_djp": false, "include_leggendaria": false, "common_pack_ids": [] },
  "quick_chat_messages": [
    { "message_id": "uuid", "player_id": "string", "phrase_ids": ["a-001"], "message": "お願いします", "posted_at": "ISO8601" }
  ],
  "picks": [
    { "player_id": "string", "pick_chart_key": "string", "accepted_at": "ISO8601" }
  ],
  "frozen_rounds": [
    { "round_index": 0, "expected_key": { "play_style":"DP","difficulty":"NORMAL","title_search_key":"...", "chart_id": 12345 }, "display": { "title":"...", "level":12 } }
  ],
  "current_round": {
    "round_index": 0,
    "round_started_at": "ISO8601",
    "soft_ttl_seconds": 300,
    "confirmed": [
      { "player_id":"string", "status":"PLAYED|SKIPPED|TIMEOUT", "metric_value": 1234, "reason":"UNOWNED|TECH|OTHER|null", "submitted_at":"ISO8601", "submitted_by":"SELF|HOST|SYSTEM", "source_meta": { "...": "..." } }
    ]
  },
  "timers": {
    "ready_check_deadline": "ISO8601|null",
    "picking_deadline": "ISO8601|null",
    "match_deadline": "ISO8601|null",
    "result_deadline": "ISO8601|null"
  },
  "result_ready": false,
  "close_reason": "CloseReason|null"
}
```

- `timers.result_deadline` は通常 `null`。`settings.auto_match=true` の場合は RESULT 自動解散期限を保持する

### 5.4 CloseReason
`ROOM_CLOSED.close_reason` / `RoomStateSnapshot.close_reason` は以下を扱う。
- `ALL_ROUNDS_COMPLETED`
- `MATCH_TTL_EXPIRED`
- `READY_CHECK_TTL_EXPIRED`
- `HOST_DISCONNECTED`
- `HOST_ABORTED`
- `PICKING_ABORTED`
- `FORCE_CLOSED`
- `ROOM_STATE_LOST`

## 6. DO側ガード（必須）
- 状態ガード: 状態に合わない操作は `ERROR` または `*_REJECTED`
- 冪等化: `(player_id, client_msg_id)` は二重適用しない
- 操作系は `(player_id, type, request_id)` でも二重適用しない
- 先着順: `PICK_SUBMIT` の採用順はDO受信順（DOがaccepted_at付与）
- `SKIP_HOST_ASSIGN`: 現行v1では `INVALID_STATE` を返して受理しない
- `FORCE_ADVANCE`: `room_state=PLAYING` かつ未確定者ありのときのみ許可し、未確定者を `TIMEOUT` / `submitted_by=SYSTEM` で確定する
- START_MATCH: `players >= 2` かつ `room_state=LOBBY` かつ全員READY かつ前マッチ揮発状態クリア済みのみ
- START_MATCH: `settings.auto_match=true` の部屋では手動開始を拒否し、参加者充足時の内部開始のみ許可する
- START_MATCH: 成功時に `match_song_unlock_filter` を固定し、そのマッチ中は選曲候補とランダム抽選へ適用する
- START_MATCH: 成功時に `current_match_id` を新規発行し、同一ルーム内の再戦と統計識別を分離する
- RETURN_TO_LOBBY: `room_state=RESULT` のみ。復帰時は全員readyと前マッチ揮発状態をリセットする
- RETURN_TO_LOBBY: `settings.auto_match=true` の部屋では受理しない
- RETURN_TO_LOBBY: 復帰時は `current_match_id=room_id` に戻す（次戦開始までは provisional 識別子）
- AUTO_REMATCH_STOP: `room_state=RESULT` かつホストのみ許可
- AUTO_REMATCH_OPT_OUT: `room_state=RESULT` のみ許可（本人のみ）
- SOURCE_STATUS_SET: 本人の source 可用性を更新し、`available=false` が自動再戦中に届いた場合は自動再戦を停止する
- RESULT_SUBMIT: `observed_key == expected_key` かつ `round_index == current_round_index` のみ採用（accept_window=0）
  - `play_style/difficulty/title_search_key` は常に一致必須
  - `chart_id` は双方にある場合のみ一致必須。`expected_key.chart_id` がある `daken_counter_v3` 観測で `observed_key.chart_id` 欠落時は不採用
- ROOM_JOIN: `client_version >= MIN_SUPPORTED_CLIENT_VERSION` を満たさない場合は `ROOM_JOIN_REJECTED` を返す
- SPECTATOR: `ROOM_JOIN/ROOM_LEAVE/STATE_GET/PING` 以外は `ERROR(code="INVALID_STATE")` で拒否する
- SPECTATOR: `PRIVATE` ルームでは player と同様に `join_code` 認可を必須化する
- SPECTATOR: 配信する `room_state_snapshot` は redacted 形（少なくとも `settings.join_code=null`）で返す
- `READY_SET / START_MATCH / RETURN_TO_LOBBY / RESULT_SUBMIT / ROOM_LEAVE` は `payload.generation == current_generation` のときのみ受理し、不一致時は操作を拒否する
- PICKING timeout: 未pickプレイヤーへランダム割当を行ってから `PICK_FROZEN` / `ROUND_BEGIN` を配信
- `RESULT_READY` 生成後の `RESULT` / `CLOSED` では提出系はすべて拒否（勝敗改変防止）

---

## 6. Host開催 protocol v1（Issue #188）

通常room protocolは変更しない。`HOST_EVENT_PROTOCOL = 1`を加法追加し、`GET /api/capabilities`は `{ host_event_protocol: 1, host_event_accept_new: boolean }` を返す。404、未知版、版不一致では新clientは開催UIを無効にするが通常対戦を維持する。`POST /api/event-rooms`はprotocol/client version、Host、`EventRoomSettings`を検証し、`room_id / generation / join_code / settings`を返す。`HOST_EVENT_ACCEPT_NEW=false`では新規開催作成と既存開催への新participant ID入室を拒否し、既存eventのHost/既存participant再接続、大会固定名簿の復帰、進行・結果回収は許可する。

開催recordへの最初のWS messageは`EVENT_JOIN`とする。通常recordへの`EVENT_JOIN`、開催recordへの`ROOM_JOIN`/SPECTATORはsnapshot送信前に拒否する。開催には通常の`ROOM_JOIN_ACCEPTED / ROOM_UPDATED / PLAYER_ROUND_CONFIRMED / RESULT_READY`を送らない。

### 6.1 client -> server

- `EVENT_JOIN`: protocol、client_version、join_code、player_id、display_name、source/所持解禁情報を送る。roleはserverが決定し、専任Hostにsourceを要求しない。
- `EVENT_ACTION`: actionで判別するunion。全操作に`request_id / generation`、開始後は`event_id`、曲操作は`round_id`、選曲/準備/開始は`selection_revision`を含める。
- action: `START_EVENT | CONFIRM_PICK | CANCEL_PICK | SET_READY | START_ROUND | SUBMIT | SKIP | CLOSE_ROUND | NEXT_PICK | INVALIDATE_ROUND | KICK | LEAVE | END_EVENT | STATE_GET | RESULTS_GET`。
- `SUBMIT`は`observed_key / metric_value / source_meta?`を含むが、全体revision一致を条件にせず、現行generation/event/round/expected_key/socket/資格/未提出をserverで検証する。

### 6.2 server -> client

- `EVENT_JOIN_ACCEPTED | EVENT_STATE | EVENT_ACTION_ACK | EVENT_RESULTS | EVENT_ERROR`を開催専用message mapとして加法追加する。
- 公開stateはphase、選曲、名簿/接続/準備/提出状態、Host期限、公開済み曲結果/大会総合だけを含む。
- `PLAYING`中の未確定`metric_value / score / misscount / source_meta / rank`はHostを含む全接続に送らない。再接続state、ACK、ERROR、debug、RESULTS_GETにも含めない。SUBMIT ACKは採否だけを返す。
- 曲別結果は確定保存後にrevision付きで一斉公開する。無効化は対象曲の新revisionと再集計した大会総合を配信する。合同プレーには総合points/rankを生成しない。
- live stateは現行曲と直前公開結果を中心とし、過去公開曲は`RESULTS_GET`で最大50曲ずつ返す。cursorは公開revisionを含み、途中無効化で不整合なら再同期を要求する。未公開曲は返さない。

### 6.3 authority / idempotency / durability

- 自己操作は`SET_READY/SUBMIT/SKIP/LEAVE`、進行/KickはHostだけ。兼任Hostの自己Kickは禁止する。Host切断中の新規mutationは開始済み曲の有効な`SUBMIT`だけを許可し、`SKIP`と進行操作を拒否する。`EVENT_JOIN`/再接続、`STATE_GET`、`RESULTS_GET`、`PING/PONG`は許可し、未確定score非送信を維持する。
- 同一`request_id`/`client_msg_id`の再送は保存済み処理結果を返し、二重適用しない。同じkeyを異なるpayloadで再利用した場合は`EVENT_ERROR(code="IDEMPOTENCY_CONFLICT")`とし、以前の処理結果を別payloadへ流用しない。
- 状態、結果、冪等記録は同じ確定境界で永続化し、保存成功後にのみACK/公開通知する。保存失敗時は成功を通知しない。
