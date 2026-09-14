# データモデル設計（Ph1 / Cloudflare Workers + Durable Objects）

## 0. 目的
- 勝敗判定に必要な最小データを一貫して保持する
- 誤採用防止（expected一致、accept_window=0）
- ローカル保存で部分結果を復元できる（ホスト落ちでも表示）
- 公開ロビー一覧の正本は `LobbyDirectoryDO` の `rooms` ストレージに保持する

## 1. 永続層の方針（Ph1）
- DO本体の状態: DO Storage に永続保存し、alarm / reconnect / hibernation 復帰後も復元可能にする
- 公開ロビー一覧: LobbyDirectoryDO storage
- ローカル復元: クライアントが `RoomStateSnapshot` をラウンド確定ごとにローカル保存（JSON）

## 2. エンティティ（DO内）

### 2.1 Room（DO状態）
- `room_id: string`（UUID）
- `generation: int`（同一 `room_id` の世代番号。初期作成=1、再作成ごとに+1）
- `join_code: string|null`
- `visibility: PUBLIC|PRIVATE`
- `settings: RoomSettings`
- `host_player_id: string`
- `room_state: RoomState`
- `created_at: datetime`
- `ready_check_deadline: datetime|null`（LOBBY ready 管理用。ルーム作成時と `RESULT -> LOBBY` 復帰時に張り直す）
- `picking_deadline: datetime|null`
- `match_deadline: datetime|null`（`START_MATCH` 成功時、すなわち `PICKING` 開始時点で初めて確定）
- `result_deadline: datetime|null`（自動マッチ部屋の RESULT 解散用に使用。通常フローでは `null`）
- `auto_rematch_enabled: bool`
- `auto_rematch_countdown_started_at: datetime|null`
- `auto_rematch_due_at: datetime|null`
- `auto_rematch_generation: int`
- `auto_rematch_cancelled: bool`
- `auto_rematch_block_reason: string|null`
- `next_match_opt_out_player_ids: string[]`
- `source_unavailable_player_ids: string[]`
- `last_match_end_reason: string|null`
- `closed_at: datetime|null`
- `close_reason: ALL_ROUNDS_COMPLETED|MATCH_TTL_EXPIRED|READY_CHECK_TTL_EXPIRED|HOST_DISCONNECTED|HOST_ABORTED|PICKING_ABORTED|FORCE_CLOSED|null`
- `result_ready_payload: object|null`（`RESULT` 中は保持し、`RESULT -> LOBBY` 復帰時にクリア。`summary.is_rated / rated_block_reason / rating_*` を含む）
- `match_song_unlock_filter: { include_bit: bool, include_djp: bool, include_leggendaria: bool, common_pack_ids: int[] }|null`（`START_MATCH` 成功時に固定し、マッチ中の選曲候補抽出へ適用）
- `quick_chat_messages: QuickChatMessage[]`（ルーム内 quick-chat の直近30件。任意 free-text は保持しない）
- `event_seq: int`
- `room_recreate_window_ms: 1800000`（30分。最後のHOSTのみ同一 `room_id` 再作成可）

### 2.2 RoomSettings（Ph1）
- `mode: ARENA|BPL|BPL4`
- `auto_rematch: bool`（`PRIVATE` のみ有効）
- `auto_match: bool`（自動マッチ成立で生成された部屋にのみ有効。`PUBLIC` 前提）
- `win_metric: SCORE|MISSCOUNT`
- `play_style: SP|DP`
- `level_filter: ANY|LV8_10|LV10|LV11|LV12`
- `room_comment: string`
- `max_players: 2|3|4`

### 2.3 Player
- `player_id: string`
- `display_name: string`
- `source: inf_daken_counter|inf-notebook|daken_counter_v3|reflux`（端末設定）
- `song_unlocks: { bit_unlocked: bool, djp_unlocked: bool, allow_leggendaria: bool, owned_pack_ids: int[] }`（クライアント申告。共通解禁フィルタ計算に使用）
- `connected: bool`
- `ready: bool`
- `joined_at: datetime`
- `left_at: datetime|null`
- `rejoin_until: datetime|null`（退出後の再入室クールダウン終端）
- `role: HOST|GUEST`（ホスト判定補助）

### 2.3.1 Spectator Session（read-only）
- spectator は `Player` エンティティとして永続化しない（`players[]` 非包含）
- spectator は WS セッション属性としてのみ保持する
  - `session_role = SPECTATOR`
  - `player_id` は接続識別子として利用可
- spectator 接続は `max_players` / `currentPlayers` / 勝敗集計へ影響しない
- spectator 向け `RoomStateSnapshot` は redacted 形で返す（少なくとも `settings.join_code=null`）

### 2.3.2 QuickChatMessage
- `message_id: string`（UUID）
- `player_id: string`
- `phrase_ids: QuickChatPhraseId[]`（共有 catalog の phrase ID）
- `message: string`（`phrase_ids` を catalog 表示文字列で `join("")` した値。最大20文字）
- `posted_at: datetime`

備考:
- 投稿可能状態は `LOBBY` / `PICKING` のみ
- spectator は投稿不可だが、snapshot / broadcast の閲覧は可
- 履歴は RoomDO state に直近30件だけ保持し、reconnect / hibernation 復帰後も snapshot に含める

### 2.4 Pick（指名）
- `player_id: string`
- `pick_chart_key: string`
- `accepted_at: datetime`（DO受信時刻）

### 2.5 FrozenRound（凍結ラウンド）
- `round_index: int`
- `expected_key: ExpectedKey`
- `display: { title: string, level: int|null }`
- `started_at: datetime|null`（`ROUND_BEGIN` 時点。演出開始時刻）
- `soft_ttl_seconds: int = 300`

### 2.6 Submission（ラウンド確定結果）
- `submission_id: string`（UUID。冪等用）
- `room_id: string`
- `round_index: int`
- `player_id: string`
- `status: PLAYED|SKIPPED|TIMEOUT`
- `reason: UNOWNED|TECH|OTHER|UNMAPPED_TIMEOUT|null`
- `metric: SCORE|MISSCOUNT`
- `metric_value: int`
  - SCORE: 0以上（SKIP/TIMEOUTは0）
  - MISSCOUNT: 0以上（SKIP/TIMEOUTは9999）
- `observed_key: ExpectedKey|null`（PLAYED時のみ）
- `submitted_at: datetime`
- `submitted_by: SELF|HOST|SYSTEM`
- `source_meta: object|null`（監視ソース由来の補助情報）

備考:
- `source_meta` はラウンド中の状態同期と `RESULT_READY` 集計へ引き継いでよい
- 少なくとも `score` / `misscount` / `title` / `title_search_key` / `source` / `timestamp` を保持できる形にする

### 2.7 UnmatchedTitleLog（未同定ログ）
- `raw_title: string`
- `normalized_title_search_key: string`
- `play_style: SP|DP`
- `difficulty: string`
- `count: int`
- `last_seen_at: datetime`

### 2.8 IdempotencyLog（冪等管理）
- `player_id: string`
- `client_msg_id: string`
- `first_seen_at: datetime`
- `type: string`
- `hash: string|null`（payload fingerprint。任意）

### 2.9 RequestIdLog（操作冪等管理）
- `player_id: string`
- `type: string`
- `request_id: string`
- `first_applied_at: datetime`

## 3. LobbyDirectoryDO（公開ロビー正本）

### 3.1 Storage Schema
- key: `rooms`
- value: `Record<string, LobbyRoomSummary>`

```ts
type LobbyRoomSummary = {
  roomId: string;
  roomName: string;
  ownerUserId: string;
  ownerDisplayName: string;
  isPublic: boolean;
  currentPlayers: number;
  maxPlayers: 2 | 3 | 4;
  isFull: boolean;
  status: "LOBBY" | "PICKING" | "PLAYING" | "RESULT";
  ttlStartedAt: number;
  createdAt: number;
  updatedAt: number;
};
```

### 3.2 更新タイミング
- ルーム作成: `status=LOBBY`, `ttlStartedAt=now` で upsert
- `START_MATCH` 成功（`PICKING` 開始）: `ttlStartedAt=now` に更新して upsert
- `PLAYING` / `RESULT`: status のみ更新（`ttlStartedAt` は維持）
- `RESULT -> LOBBY`: `ttlStartedAt=now` に更新して upsert
- `CLOSED` / 解散: remove

### 3.3 TTL / 一覧導出
- `ttlStartedAt` は TTL 判定の唯一の起点時刻とする（`updatedAt` はTTL判定に使わない）
- 期限判定:
  - `status = LOBBY`: `now - ttlStartedAt > ready_check_ttl`
  - `status in [PICKING, PLAYING, RESULT]`: `now - ttlStartedAt > match_ttl`
- `GET /api/lobby` は返却前に期限切れを清掃し、以下のみ返す
  - `isPublic = true`
  - `settings.auto_match != true`（自動マッチ専用ルームは公開一覧に載せない）
  - `isFull = false`
  - `status = LOBBY`
  - TTL 未超過

## 3.4 MatchmakingQueue（Auto Match / Phase1）

### 3.4.1 Queue Ticket
- `ticket_id: string`（UUID）
- `status: SEARCHING|MATCHED|CANCELLED`
- `mode: ARENA|BPL|BPL4`
- `play_style: SP|DP`
- `win_metric: SCORE|MISSCOUNT`
- `rating: int`（クライアント自己申告）
- `player_id: string`
- `display_name: string`
- `queued_at: datetime`
- `updated_at: datetime`
- `room_id: string|null`（成立時のみ）
- `matched_player_count: int|null`（成立時のみ）

### 3.4.2 成立条件（Phase1）
- キー一致条件: `mode + play_style + win_metric`
- stale `SEARCHING` ticket は `updated_at` が120秒以上更新されない場合に除外する
- レート許容幅:
  - 初期 `±50`
  - 30秒ごとに `+50`
  - 上限 `±300`
- ARENA:
  - 4人成立で即開始
  - 90秒待機後は2-4人で成立可
- BPL/BPL4:
  - 2人成立で開始

### 3.4.3 API（HTTP Polling）
- `POST /api/matchmaking/queue`
- `GET /api/matchmaking/queue/:ticket_id`
- `DELETE /api/matchmaking/queue/:ticket_id`
- `GET /api/matchmaking/waiting-count?mode=...&play_style=...&win_metric=...`
  - response: `{ waiting_count: number }`
  - counting rule: stale ticket 清掃後、`status=SEARCHING` かつ `mode + play_style + win_metric` 一致件数

### 3.4.4 成立後ルーム運用（Phase1）
- 自動マッチ成立で生成するルームは `settings.auto_match=true` の `PUBLIC` ルーム
- 参加者が `max_players` まで揃った時点で内部開始（`START_MATCH` は手動不可）
- `RESULT` 開始から20秒後に自動解散する
- 自動マッチ部屋は `REMAKE ROOM`（再作成）不可

## 4. キー設計

### 4.1 ExpectedKey（採用判定キー）
- `play_style: SP|DP`
- `difficulty: NORMAL|HYPER|ANOTHER|LEGGENDARIA|...`
- `title_search_key: string`（入力側 normalize_title_input() の結果）
- `chart_id: int|null`（任意。存在する場合は同名異曲の識別を優先）

### 4.2 提出受理条件（Ph1）
- `accept_window_rounds = 0`
- `round_index == current_round_index` のみ採用
- `observed_key == expected_key` のみ `PLAYED` として採用
  - `play_style/difficulty/title_search_key` は常に一致必須
  - `chart_id` は双方に存在する場合のみ一致必須（`daken_counter_v3` は `expected.chart_id` ありで `observed.chart_id` 欠落を不採用）
- 1プレイヤー1ラウンドは初回のみ採用（以後は拒否/ログのみ）

## 5. 勝敗判定

### 5.1 metricの比較方向
- `SCORE`: 大きい方が勝ち
- `MISSCOUNT`: 小さい方が勝ち

### 5.2 SKIP/TIMEOUT値
- SCORE: 0
- MISSCOUNT: 9999

### 5.3 ARENA配点（方針A）
- rank1: 2
- rank2: 1
- rank3+: 0
- 同点同順位、順位飛ばしあり

### 5.4 BPL / BPL4
- BPL: 3ラウンド固定（2人が1曲ずつ選曲 + Masterランダム1曲）
- BPL4: 4ラウンド固定（2人が2曲ずつ選曲）
- 各ラウンド勝者が1勝
- 同点は勝ち数加算なし
- 既定ラウンド終了時の総勝ち数で勝敗を決め、同勝ち数なら総合引き分け

## 6. タイトル同定（Ph1 v1）

### 6.1 inf-notebook
- `records/summary.json.musicname`（DB由来）を同定入力に使う
- `music_title_alias` の exact 一致のみで解決する
  - `alias_scope = 'inf' AND alias = ?`
- `alias_norm` / case-fold / fuzzy は使わない
- runtime alias API（`/api/chart-aliases/resolve`）が利用可能な場合は trim exact で候補補完し、短TTLキャッシュで追従する

### 6.2 inf_daken_counter
従来どおり `normalize_title_input(raw_title)` を同定処理側で実施する。

最低限:
- Unicode NFKC
- trim
- 連続空白1つ化
- `\s+\(` -> `(`（括弧直前空白除去）
- 英字小文字化
- 記号の標準化（最小）

解決失敗:
- UnmatchedTitleLogへ記録
- Ph1は「未同定＝SKIP/TIMEOUTで割り切り」（手動再割当UIは入れない）

## 7. 監視ソース別の抽出仕様（Ph1）

### 7.1 リザルト手帳（inf-notebook）
入力:
- `records/summary.json`
- `export/recent.json.list[]`（補完専用）
使用:
- summary:
  - `musicname`
  - `playtype`
  - `difficulty`
  - `latest.timestamp`
- recent:
  - SCORE: `score`（EX SCORE絶対値）
  - MISSCOUNT: `misscount`
同定:
- summary の `musicname` を alias exact 解決
- chart は `textage_id + playtype + difficulty` で特定
新規イベント判定:
- summary の `latest` 差分のみ抽出
- recent は `timestamp -> record[]` の multimap で突合

補助:
- `recent.music` / `recent.difficulty` は warning 用（採否条件には使わない）

### 7.2 打鍵カウンタv3（daken_counter_v3）
入力:
- local WebSocket `ws://localhost:{port}`（default `8767`）
使用:
- SCORE: `score`
- MISSCOUNT: `bp`
同定:
- `difficulty` 略記を `play_style + difficulty` へ変換
- `chart_id` が得られる場合は `ExpectedKey.chart_id` と突合
- `battle == 1` は v1 非対応として破棄
新規イベント判定:
- `today_updates` の前回スナップショットとの差分のみ候補化
- LOBBY は採用せず baseline 更新のみ、PLAYING でのみ採用判定を実施

### 7.3 Reflux
入力:
- `latest.json`
- `tracker.tsv`
使用:
- SCORE: `exscore`
- MISSCOUNT: `bad + poor`
同定:
- `title` 優先、未解決時 `title2` フォールバック
- `diff` と `playtype` から譜面同定（不整合は warning）
- `tracker.tsv` から譜面単位 best（score/bp）を補助情報として参照
新規イベント判定:
- `latest.json` 内容ハッシュで重複抑止

### 7.4 打鍵カウンタ（legacy: inf_daken_counter）
入力:
- `today_update.xml`
使用:
- SCORE: `score_cur`
- MISSCOUNT: `bp`
同定:
- `difficulty`（DPH等）を `play_style + difficulty` に変換し統一
- `title` を normalize

新規イベント判定:
- fingerprint = `(title_key, chart_difficulty, score_cur, bp)` を last_seen として保持

## 8. ローカル保存（クライアント）

### 8.1 ルーム結果アーカイブ
- 保存単位: ラウンド確定ごと
- 保存内容: `RoomStateSnapshot`（WS仕様と同一）
- 目的: ホスト落ち/切断時でも部分結果表示が可能

保存フォーマット例:
```json
{
  "version": "ph1",
  "saved_at": "ISO8601",
  "room_state_snapshot": { "...": "..." }
}
```

### 8.2 統計アーカイブ
- 保存主体: client ローカル永続層
- 目的:
  - レート再計算
  - 曲別勝率ランキング
  - 直近勝敗履歴
  - 安定度集計
- 保存対象:
  - `matches`
    - `match_id`
    - `started_at`
    - `ended_at`
    - `battle_type: ARENA|BPL`
    - `visibility: PUBLIC|PRIVATE`
    - `play_mode: SP|DP`
    - `opponent_count`
    - `opponent_id / opponent_name`
    - `match_result: WIN|LOSE|DRAW`
    - `match_point_total`
    - `is_rated`
    - `rating_before`
    - `rating_after`
    - `rating_delta`
    - `is_complete`
    - `invalid_reason`
  - `match_games`
    - `match_game_id`
    - `match_id`
    - `played_at`
    - `game_index`
    - `chart_id`
    - `battle_type: ARENA|BPL`
    - `visibility: PUBLIC|PRIVATE`
    - `play_mode: SP|DP`
    - `game_result: WIN|LOSE|DRAW`
    - `round_point`
    - `my_ex_score`
    - `opponent_ex_score`
    - `my_bp`
    - `opponent_bp`
    - `result_confirmed_at`
  - `play_results`
    - `play_result_id`
    - `played_at`
    - `battle_type: ARENA|BPL`
    - `visibility: PUBLIC|PRIVATE`
    - `play_mode: SP|DP`
    - `chart_id`
    - `my_ex_score`
    - `my_bp`
    - `source_match_id`
  - `personal_bests`
    - `chart_id`
    - `play_mode`
    - `best_ex_score`
    - `best_bp`
    - `best_played_at`
    - `source_play_result_id`
- 集計ルール:
  - 進行中セッション識別は `RoomStateSnapshot.current_match_id`（server-authoritative）を使用する
  - 結果確定時の統計識別子は `RESULT_READY.summary.match_id` を使用し、`RoomStateSnapshot.current_match_id` と一致させる
  - 互換 fallback は `current_match_id` 欠落時のみ `RESULT_READY.summary.match_id`、双方欠落時のみ `room_id` を使用する
  - 統計UIのフィルタ軸は `battle_type + play_mode` とし、`visibility` は履歴表示の除外条件に使わない
  - レート系列は `ARENA_SP` / `ARENA_DP` / `BPL_SP` / `BPL_DP` を分離する
  - レート更新は `matches` を基準にマッチ単位で行う
  - ARENA は `match_games` を集約して最終順位を決め、pairwise 擬似対戦で `matches.rating_delta` を算出する
  - `RESULT_READY.summary.is_rated` をレート適用可否の権威情報とする
  - `PRIVATE`、`SKIPPED`、`TIMEOUT`、`FORCE_ADVANCE`、未提出、不一致、途中終了、最終結果衝突を含むマッチはレート対象外
  - unrated でも `matches / match_games / play_results` は保存し、`matches.invalid_reason` に block 理由を保持する
  - 曲別勝率ランキングは `match_games` を基準に集計する
  - 曲識別は表示名ではなく `chart_id` を正とする

## 9. 互換/移行ルール（Ph1）

- ローカル保存は `schema_version` を必須とする。
- 互換を壊す変更（必須項目の削除/型変更/意味変更）は `schema_version` を更新する。
- 読み込み側は「現行 + 直前 schema_version」のみサポートし、それ以前は空アーカイブへフォールバックする。
- 加法的変更（optional項目追加）は同一 schema_version で許容する。
- 互換 fallback（`current_match_id -> RESULT_READY.summary.match_id -> room_id`）は維持し、順序を変更しない。

---

## 10. Host開催データ（schema v1）

通常`room-record`と開催recordは別storage keyとし、`room_kind`で判別する。`room_kind`欠落recordは従来の通常roomとして扱い、`room_kind=HOST_EVENT`を通常roomへhydrateしない。開催recordのschema/種別/必須状態が不正な場合は空開催を生成せず`ROOM_STATE_LOST`で終了する。

### 10.1 EventRoomRecord

- identity: `schema_version=1 / room_kind=HOST_EVENT / room_id / generation / event_id:string|null`
- settings: `event_name / event_type=CASUAL|TOURNAMENT / host_plays:boolean / play_style=SP|DP / win_metric=SCORE|MISSCOUNT / join_code`。`event_name`は通常`room_comment`と同じく空文字を許可し、最大80文字、CR/LF禁止、保存時の暗黙trimなしとする。
- progress: `phase / round_phase:ACTIVE|RESULT|null / revision / selection_revision / selected_chart / current_round_id / created_at / started_at / ended_at / end_reason`。LOBBYでは`event_id/started_at=null`、`START_EVENT`成功と同じ保存境界で両方を発行する。
- host: `host_player_id / connected / initial_connect_deadline / disconnect_deadline`
- participants: stable player id、表示名、connection/left/kicked、source、所持解禁、ready、pending_next。兼任Hostはparticipant、専任Hostは非participant。
- tournament: `fixed_roster_player_ids / scoring_size_n`を`START_EVENT`で固定し、その後の退出/Kick/欠場で変更しない。
- 公開`EventRoomSnapshot`にも`fixed_roster_player_ids:string[] / scoring_size_n:number|null`を含め、開催メタデータの権威情報とする。合同プレーと未開始LOBBYは`[] / null`。曲ページング`EVENT_RESULTS`へは重複格納しない。
- round: `round_id / chart / selection_revision / eligible_player_ids / playing_player_ids / started_at / confirmed_at / invalidated_at / public_revision`。現在の準備状態は`participants[].ready`を正とし、roundの準備人数は`eligible_player_ids`との積から導出する。round内へ重複した`ready_player_ids`を保存しない。
- private submissionsは公開stateと型を分離し、`SUBMITTED|ABSENT`、metric/source、欠場理由、受理時刻を保持する。欠場理由は`SKIP|DEADLINE|LEFT|KICKED|NOT_PRESENT`。
- public result entryは`playing_player_ids`に限定する。ただし大会では固定名簿のうち当該曲で欠場扱いとなる対象も含める。合同プレーの未準備者/pending_nextはparticipant stateには残すが、round resultや偽`ABSENT`を生成しない。同値は同順位/順位飛ばし、有効提出者へ`N-rank+1`、欠場はrankなし/0pt。合同プレーはpoints/overallを持たない。
- invalidated roundは履歴へ残すが総合から除外する。総合は有効な公開roundから毎回再計算する。
- idempotencyはplayer/request key、payload fingerprint、処理結果を終了後回収まで保持する。

### 10.2 永続化と復元

- state、公開結果、idempotencyを同じ確定境界で保存し、ACK/配信は保存後に行う。
- 復元時はschema/room_kindを検証し、接続をstable player idへ再関連付け、絶対Host期限を現在時刻で評価する。alarm/再起動/接続試行で期限を書き換えない。
- 開催中に通常30分TTLを適用しない。終了から1800秒後にsocket、開催record、round、idempotencyを回収する。

### 10.3 EventHistoryRecord

- 保存単位は開催。`schema_version=1`、開催ID/名称/種別、開始終了時刻/理由、Host/兼任区分、SP/DP・指標、大会名簿/N、曲ID/譜面/対象者、確定時刻、各人の結果/欠場理由/順位/pt、無効状態、総合、最終受信時刻、受信revision、最終同期済み曲数、`complete|partial`を保持する。
- Tauriはapp data配下`event-results/<event_id>.json`、browserは開催専用storage keyへ保存する。曲ID/revision単位でupsertし、重複通知で曲やptを重複追加しない。
- 最終結果と全公開曲が揃うまでpartial。途中退出/Kick/切断は受信済み範囲を残し、専任Hostも保存する。
- 未知開催schemaは原本を保持して読めない旨を表示する。通常room archive、`matches/match_games/play_results/personal_bests`へ変換・流入させない。
