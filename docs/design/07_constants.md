# 定数一覧（Ph1）

## 0. 目的
Ph1で固定するタイマー値、制約値、表示/運用上の定数を整理する。  
実装時はこの定数一覧を単一の共有定義として扱う。

---

## 1. ルーム/進行定数

## 1.1 LOBBY / READY
- `READY_CHECK_TTL_MINUTES = 20`
  - LOBBY開始または `RESULT -> LOBBY` 復帰から20分で解散
- `START_MIN_PLAYERS = 2`
  - `players < 2` の間はホスト `START_MATCH` 不可
- `PICKING_TTL_SECONDS = 120`
  - ARENA / BPL(3) の PICKING 制限時間
- `BPL4_PICKING_TTL_SECONDS = 180`
  - BPL4 の PICKING 制限時間

## 1.2 ラウンド進行
- `ROUND_SOFT_TTL_SECONDS = 300`
  - START音声時点から5分で未確定者をTIMEOUT確定
- `ROUND_RESULT_SECONDS = 10`
  - 各ラウンド確定後の Round Result（曲別リザルト）表示秒数
  - 最終ラウンド/非最終ラウンドで同一値を使用する
- `HOST_SKIP_UNLOCK_SECONDS = 240`
  - 現行v1では代理SKIP無効のため、将来拡張用の予約値
- `ROUND_MUSIC_SELECT_SECONDS = 45`
  - ROUND_BEGINから45秒間は `MUSIC SELECT`
- `ROUND_STAGE_COUNTDOWN_AT_SECONDS = 35`
  - ROUND_BEGINから35秒後に残り10秒カウント開始（`count_beep`）
- `ROUND_START_CALL_AT_SECONDS = 52`
  - ROUND_BEGINから52秒後に残り3秒カウント開始（`count_beep`）
- `ROUND_PLAY_BEGIN_AT_SECONDS = 55`
  - ROUND_BEGINから55秒後に実プレイ開始（`count_go`）

## 1.3 マッチ全体
- `MATCH_TTL_MINUTES = 30`
  - マッチ全体の寿命
  - TTL到達時は未確定をTIMEOUTとして結果を確定し、必要なら `RESULT` または `CLOSED` へ遷移
- `ROOM_RECREATE_WINDOW_MINUTES = 30`
  - `CLOSED` 後、最後のHOSTが同一 `room_id` を再作成できる猶予
- `AUTO_REMATCH_RESULT_SECONDS = 20`
  - `PRIVATE` + `auto_rematch=true` の `RESULT` で次戦開始まで待機する秒数
  - 自動マッチ部屋の `RESULT` 解散にも同値を再利用する

## 1.4 再入室
- `REJOIN_COOLDOWN_SECONDS = 40`
  - 同一ルームへ退出後すぐ再入室する場合のクールダウン
  - ホストが非明示切断した場合の再接続猶予

---

## 2. WebSocket / 通信定数

## 2.1 疎通確認
- `PING_INTERVAL_SECONDS = 20`
  - `PICKING/PLAYING` 中のみ、ホストクライアントからPING送信
- `PING_TIMEOUT_MISSES = 2`
  - 2回無応答相当を切断検知の目安とする

## 2.2 一覧API
- `LOBBY_POLL_INTERVAL_SECONDS = 10`
  - v1 のロビー一覧同期周期（polling）

## 2.3 クライアント version gate
- `MIN_SUPPORTED_CLIENT_VERSION = "1.4.0"`
  - `ROOM_JOIN` 時に `client_version` がこの値未満、または未送信の場合は参加拒否
- `CLIENT_VERSION_UNSUPPORTED`
  - `ROOM_JOIN_REJECTED.reason` の先頭識別子として利用（更新案内文を後続に含める）

---

## 3. ルーム設定関連定数

## 3.1 join_code
- `JOIN_CODE_LENGTH = 8`
- `JOIN_CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"`
  - `I`, `O`, `0`, `1` を除外
- `JOIN_CODE_CASE = UPPERCASE`
  - 比較時は大文字化して扱う

## 3.2 room_comment
- `ROOM_COMMENT_MAX_LENGTH = 80`
- `ROOM_COMMENT_ALLOW_EMPTY = true`
- `ROOM_COMMENT_ALLOW_NEWLINE = false`

## 3.3 プレイヤー数
- `MAX_PLAYERS_OPTIONS = [2, 3, 4]`

---

## 3.4 Quick Chat
- `QUICK_CHAT_MAX_COMPOSED_LENGTH = 20`
  - catalog phrase の表示文字列を選択順に `join("")` した後の最大長
- `QUICK_CHAT_HISTORY_LIMIT = 30`
  - RoomDO state / snapshot に保持する直近 quick-chat 件数
- `QUICK_CHAT_CATEGORIES`
  - kana-order: `あ行`, `か行`, `さ行`, `た行`, `な行`, `は行`, `ま行`, `や行`, `ら行`, `わ行`, `記号・英数字`
  - phrase は共有 catalog の `QuickChatPhraseId` で送信し、DO が表示文字列へ解決する

---

## 4. 勝敗/集計定数

## 4.1 metric
- `WIN_METRIC_OPTIONS = ["SCORE", "MISSCOUNT"]`

## 4.2 SCOREモード
- `SCORE_SKIP_VALUE = 0`
- `SCORE_TIMEOUT_VALUE = 0`

## 4.3 MISSCOUNTモード
- `MISSCOUNT_SKIP_VALUE = 9999`
- `MISSCOUNT_TIMEOUT_VALUE = 9999`

## 4.4 ARENA配点
- `ARENA_POINT_RANK_1 = 2`
- `ARENA_POINT_RANK_2 = 1`
- `ARENA_POINT_RANK_3 = 0`
- `ARENA_POINT_RANK_4 = 0`

## 4.5 BPL / BPL4
- `BPL_ROUNDS = 3`
  - BPL（3 STAGE）
- `BPL4_ROUNDS = 4`
  - BPL4（4 STAGE）

---

## 5. ソース監視定数

## 5.1 source options
- `SOURCE_OPTIONS = ["inf_daken_counter", "inf-notebook", "daken_counter_v3", "reflux"]`
- 設定UIでの選択対象は `inf-notebook` / `daken_counter_v3` / `reflux`（`inf_daken_counter` はlegacy非表示）
- `DAKEN_COUNTER_V3_DEFAULT_PORT = 8767`
- `DEPRECATED_SOURCE_OPTIONS = ["inf_daken_counter"]`
- `SOURCE_DEPRECATED_JOIN_REJECT = true`（legacy source 無効構成では `ROOM_JOIN` を拒否）

## 5.2 source制約
- `SOURCE_FIXED_PER_DEVICE = true`
- `SOURCE_CHANGE_ALLOWED_IN_ROOM = false`

## 5.3 監視異常
- `SOURCE_ERROR_CODE = "SOURCE_UNAVAILABLE"`
- 監視異常時は TECH スキップ誘導

---

## 6. ロビー関連定数

## 6.1 visibility
- `VISIBILITY_OPTIONS = ["PUBLIC", "PRIVATE"]`

## 6.2 LobbyDirectory 一覧保持
- `LOBBY_READY_CHECK_TTL_MS = 20 * 60 * 1000`
- `LOBBY_MATCH_TTL_MS = 30 * 60 * 1000`
- `LOBBY_STATUS_VISIBLE = ["LOBBY"]`
- TTL 判定は `ttlStartedAt` のみを使う

## 6.3 自動マッチング関連
- `MATCHMAKING_INITIAL_RATING_RANGE = 50`
- `MATCHMAKING_RATING_RANGE_STEP = 50`
- `MATCHMAKING_RATING_RANGE_STEP_SECONDS = 30`
- `MATCHMAKING_RATING_RANGE_MAX = 300`
- `MATCHMAKING_ARENA_MIN_PLAYERS = 2`
- `MATCHMAKING_ARENA_MAX_PLAYERS = 4`
- `MATCHMAKING_ARENA_PARTIAL_START_SECONDS = 90`

---

## 7. エラーコード一覧（Ph1）

- `ROOM_FULL`
- `JOIN_CODE_INVALID`
- `NOT_HOST`
- `INVALID_STATE`
- `START_REQUIRES_MIN_PLAYERS`
- `RESULT_KEY_MISMATCH`
- `ROUND_ALREADY_CONFIRMED`
- `HOST_SKIP_LOCKED`（互換性維持のため定義のみ残置）
- `ROOM_STATE_LOST`
- `SOURCE_UNAVAILABLE`
- `CLIENT_VERSION_UNSUPPORTED`（`ROOM_JOIN_REJECTED.reason` 識別子として利用）

---

## 8. ローカル設定定数

## 8.1 player
- `PLAYER_ID_GENERATION = UUID`
- `DISPLAY_NAME_PERSIST = true`
- `DISPLAY_NAME_DUPLICATE_ALLOWED = true`

## 8.2 ローカル保存
- `RESULT_SAVE_FORMAT = JSON`
- `SAVE_PER_ROUND = true`

---

## 9. 音通知定数

## 9.1 再生責務
- `SOUND_PLAYBACK_LOCAL_ONLY = true`

## 9.2 必須SE
- `round_intro`
- `count_beep`
- `match_found`
- `phase_locked`
- `count_go`
- `cancel`
- `error`

## 9.3 間隔制御
- `MATCH_FOUND_MIN_INTERVAL_MS = 400`

## 9.4 状態遷移時
- `SOUND_CLEAR_QUEUE_ON_STATE_CHANGE = true`
- `SOUND_STOP_CURRENT_ON_STATE_CHANGE = true`

---

## 10. 将来変更候補（Ph2以降）
以下はPh1では固定だが、将来拡張候補とする。

- `BPL_ROUNDS` を 5 に変更可能にする
- `ROOM_LIST_PAGE_SIZE` の調整
- `MATCH_TTL_MINUTES` の再検討
- `RESULT_TTL_MINUTES` の再検討
- `PING_INTERVAL_SECONDS` の最適化
- source監視の polling フォールバック

---

## 11. Host開催定数（Issue #188）

- `HOST_EVENT_PROTOCOL = 1`
- `HOST_EVENT_ACCEPT_NEW = false`（環境変数未指定/falseは新規開催作成と新participant ID入室を停止。既存Host/participantの再接続、大会固定名簿の復帰、既存開催の進行・結果回収は許可）
- `EVENT_MAX_PLAYERS = 20`（プレー参加者。専任Hostは別枠、兼任Hostは含む）
- `HOST_EVENT_DISCONNECT_GRACE_SECONDS = 300`
- `HOST_EVENT_CLOSED_RETENTION_SECONDS = 1800`
- `HOST_EVENT_RESULTS_PAGE_SIZE = 50`
- `HOST_EVENT_HISTORY_SCHEMA_VERSION = 1`
- `HOST_EVENT_NAME_MAX_LENGTH = ROOM_COMMENT_MAX_LENGTH`
- `HOST_EVENT_NAME_ALLOW_EMPTY = ROOM_COMMENT_ALLOW_EMPTY`
- `HOST_EVENT_NAME_ALLOW_NEWLINE = ROOM_COMMENT_ALLOW_NEWLINE`
- `HOST_EVENT_TYPES = ["CASUAL", "TOURNAMENT"]`
- `HOST_EVENT_HOST_PLAYS = boolean`（trueは兼任Host、falseは専任Host）
- `HOST_EVENT_PHASES = ["LOBBY", "PICKING", "PLAYING", "RESULT", "CLOSED"]`
- `HOST_EVENT_END_REASONS = ["HOST_ENDED", "HOST_DISCONNECTED", "ROOM_STATE_LOST"]`
- `HOST_EVENT_ABSENCE_REASONS = ["SKIP", "DEADLINE", "LEFT", "KICKED", "NOT_PRESENT"]`
- `HOST_EVENT_SCORE_ABSENT_VALUE = 0`
- `HOST_EVENT_MISSCOUNT_ABSENT_VALUE = 9999`
- `HOST_EVENT_ABSENT_TOURNAMENT_POINTS = 0`
- `HOST_EVENT_IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT"`

通常の`MAX_PLAYERS_OPTIONS`、ready/picking/round/match TTL、ARENA/BPL/BPL4配点・曲数・自動再戦定数は変更しない。Host開催には通常の時間制限と自動進行を適用しない。
