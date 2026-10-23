# FSM設計（Ph1 / Cloudflare Workers + Durable Objects）

## 0. 前提（実装基盤）
- ルーム = 1 Durable Object（以下 DO）
- Worker は HTTP/WS の入口（ルーティングのみ）。FSMはDO内で完結。
- 公開ロビー一覧の正本は `LobbyDirectoryDO` とし、KV はロビー用途で使わない。
- 先着順・時刻基準は DO の `Date.now()` を正とする（単一実体なので整合が取れる）。

## 1. 識別子
- `room_id`: UUID（表示・参照用）
- `generation`: 同一 `room_id` 内の世代番号（初期作成=1、再作成ごとに+1）
- `durable_object_id`: `idFromName(room_id)` のように room_id から決定（安定ルーティング）
- `join_code`: 任意（短い文字列）。公開/非公開に関わらず設定可能。

## 2. 用語
- ルーム: 対戦セッション単位（DOインスタンス）
- ホスト: ルーム作成者（固定。非明示切断時は `rejoin_cooldown` 以内の再接続を許容し、超過で解散）
- プレイヤー: 参加者（最大4）
- 観戦者（spectator）: read-only 接続者。`max_players` を消費せず、FSM進行・集計・勝敗判定へ参与しない
- ラウンド: PLAYING中の1譜面単位（譜面リストのindex）
- Round Result（曲別リザルト）: 1ラウンド単位の結果表示（UIフェーズ）
- Match Result（最終結果 / RESULT）: マッチ全体の最終集計表示（`room_state=RESULT`）
- 自動再戦: `visibility=PRIVATE` かつ `settings.auto_rematch=true` のとき、同一 `room_id` を維持したまま次戦へ自動進行する機能（ルーム再作成はしない）
- 自動再戦の見た目上の遷移: UIでは `RESULT -> PICKING` に見えてよいが、FSM内部は必ず `RESULT -> LOBBY -> PICKING` を通す（`RESULT` から `PICKING` へ直接遷移しない）
- 自動マッチ部屋: `visibility=PUBLIC` かつ `settings.auto_match=true` の部屋。参加者充足で自動開始し、`RESULT` から20秒で自動解散する

## 3. ルーム状態（RoomState）
- `LOBBY`
- `PICKING`
- `PLAYING`
- `RESULT`
- `CLOSED`

### 状態遷移（概要）
- ルーム作成完了時は `LOBBY` に入る
- `LOBBY` -> `PICKING`（ホスト `START_MATCH`。条件: players>=2 かつ全員READY）
- `LOBBY` -> `PICKING`（`settings.auto_match=true` かつ接続参加者が `max_players` 充足時、内部イベントで自動開始）
- `PICKING` -> `PLAYING`（DOが確定譜面リストを凍結して遷移）
- `PLAYING` -> `PLAYING`（全員確定で次ラウンドへ）
- `PLAYING` -> `RESULT`（全ラウンド消化時。`RESULT_READY` を保持）
- `RESULT` -> `LOBBY`（ホスト操作。再戦準備のため ready / 揮発状態をリセット）
- `RESULT` -> `LOBBY` -> `PICKING`（`visibility=PRIVATE` かつ `settings.auto_rematch=true` の場合、20秒カウント満了で内部イベントにより次戦開始）
- `RESULT` -> `CLOSED`（`settings.auto_match=true` の場合、20秒経過で内部イベントにより解散）
- `CLOSED` -> `LOBBY`（最後のHOSTのみ、同一 `room_id` で再作成。内部的には `generation+1` の新世代）
- 任意状態 -> `CLOSED`（ホスト切断/終了、lobby ready ttl超過、異常終了）
- `current_match_id` は `START_MATCH` / 自動再戦開始時に新規発行し、`RESULT`/`CLOSED` まで固定する。`RESULT -> LOBBY` 復帰時は `room_id` に戻す

### CLOSED の内部終了理由（close_reason）
- `ALL_ROUNDS_COMPLETED`
- `MATCH_TTL_EXPIRED`
- `READY_CHECK_TTL_EXPIRED`
- `HOST_DISCONNECTED`
- `HOST_ABORTED`
- `PICKING_ABORTED`
- `FORCE_CLOSED`
- `ROOM_STATE_LOST`

`CLOSED` の UI/SE 分岐は `RoomState` ではなく `close_reason` を正とする。

## 4. タイマー（固定値 / DOが管理）
- `ready_check_ttl = 20min`（LOBBY開始または `RESULT -> LOBBY` 復帰から。超過で解散）
- `picking_ttl = 120s`（ARENA / BPL(3) の PICKING開始から。超過で未pick者をランダム補完して凍結）
- `bpl4_picking_ttl = 180s`（BPL4 の PICKING開始から。超過で未pick者をランダム補完して凍結）
- `round_soft_ttl = 5min`（`count_go` 以降。超過で未確定者をTIMEOUT確定）
- `host_skip_unlock_seconds = 240s`（`SKIP_HOST_ASSIGN` 用の予約値。現行v1では操作を受理しない）
- `match_ttl = 30min`（`START_MATCH` 成功時、すなわち `PICKING` 開始時から固定）
- `room_recreate_window = 30min`（`CLOSED` 後に最後のHOSTが同じ `room_id` で再作成できる猶予）
- `rejoin_cooldown = 40s`（退出後の同一ルーム再入室抑止。ホスト非明示切断時の再接続猶予にも使用）

## 5. ルーム作成設定（RoomSettings / Ph1）
- `visibility`: `PUBLIC | PRIVATE`
- `join_code`: string|null
- `auto_rematch`: boolean（`PRIVATE` のみ有効）
- `auto_match`: boolean（`PUBLIC` のみ有効。自動マッチ成立部屋）
- `mode`: `ARENA | BPL | BPL4`
- `win_metric`: `SCORE | MISSCOUNT`
- `play_style`: `SP | DP`
- `level_filter`: `ANY | LV8_10 | LV10 | LV11 | LV12`
- `room_comment`: string
- `max_players`: `2 | 3 | 4`

### 公開ロビー（LobbyDirectoryDO）
- `LobbyDirectoryDO` が公開ロビー一覧の唯一の正本を保持する
- 一覧要約は `LobbyRoomSummary`（`roomId`, `roomName`, `ownerUserId`, `ownerDisplayName`, `isPublic`, `currentPlayers`, `maxPlayers`, `isFull`, `status`, `ttlStartedAt`, `createdAt`, `updatedAt`）を保持する
- `ttlStartedAt` は TTL 判定専用で、次のタイミングでのみ更新する
  - `LOBBY` 開始
  - `PICKING` 開始（`START_MATCH` 成功）
  - `RESULT -> LOBBY` 復帰
- 一覧表示条件（`GET /api/lobby`）
  - `isPublic = true`
  - `settings.auto_match != true`（自動マッチ専用ルームは公開一覧に表示しない）
  - `isFull = false`
  - `status = LOBBY`
  - TTL 未超過
- TTL 判定
  - `status = LOBBY`: `now - ttlStartedAt > ready_check_ttl` で期限切れ
  - `status in [PICKING, PLAYING, RESULT]`: `now - ttlStartedAt > match_ttl` で期限切れ
- `LobbyDirectoryDO` は一覧取得時/更新時に期限切れルームを清掃する
- ルーム終了（CLOSED）時は `LobbyDirectoryDO` から削除する

## 6. LOBBY（参加・設定閲覧）
- 参加/退出は自由（最大 `max_players`）
- spectator は `LOBBY/PICKING/PLAYING/RESULT` の全状態で接続可能だが、操作系メッセージは送信不可（read-only）
- ready 管理は `LOBBY` の内部状態として扱う
- 全員が `ready=true` になって初めて `START_MATCH` 条件を満たせる
- ホスト自身も `ready=true` 必須
- ホストのみ `START_MATCH` を実行できる。UI の `START` ボタンは常時表示し、条件未達時は遷移させず不足理由を表示する
- `settings.auto_match=true` の部屋では `START_MATCH` / `RETURN_TO_LOBBY` / 再作成による rematch を受理せず、ROOM FSM が自動開始・自動解散を担う
- `visibility=PRIVATE` の場合は join_code必須（入口のWorkerで弾くか、DOで弾くかを統一）
- `RESULT -> LOBBY` 復帰時には以下をクリアする
  - 全員の ready 状態
  - 現在曲情報
  - ラウンド進行情報
  - 一時スコア
  - 提出済みフラグ
  - 中間集計データ
  - タイブレーク用一時値
  - `match_ttl` を含む前マッチの寿命管理情報

### 開始条件
- `players < 2` の間は `START_MATCH` 成功不可
- `ready=false` の参加者が 1 人でもいる間は `START_MATCH` 成功不可
- `START_MATCH` はホストのみ
- `START_MATCH` 成功時に参加者全員の `song_unlocks` から `match_song_unlock_filter` を確定し、そのマッチ中の選曲候補・ランダム抽選に固定適用する
- `START_MATCH` 実行で以後参加不可（席ロック）。退出は可能（退出者は以後TIMEOUT扱い）
- 前マッチ揮発状態が未クリアなら `START_MATCH` を拒否する
- `settings.auto_match=true` の部屋では手動 `START_MATCH` を拒否し、内部開始のみ許可する
- 自動マッチ部屋は最終参加者の join で `START_MATCH` 相当の `PICKING` へ自動遷移する
- 自動マッチ部屋は `RESULT` 開始から20秒後に `CLOSED` へ自動遷移する

## 8. PICKING（指名・凍結）
### 8.1 指名ルール
- ARENA: 各プレイヤーは 1譜面指名（`pick_chart_key`）
- BPL: 各プレイヤーは 1譜面指名（2人固定）
- BPL4: 各プレイヤーは 2譜面指名（2人固定）
- 指名は DO の受信時刻（DOが付与）で先着順
- 同一譜面重複は許可しない
  - 重複検出時、後着の枠だけ DO が同フィルタで「未使用譜面」を抽選し差し替え
- `picking_ttl` 超過時、未pickプレイヤーには同フィルタ・未使用譜面からランダム割当を行う
- 確定後に「凍結リスト（frozen_rounds）」を全員へ配布し、以後変更不可

### 8.2 凍結リスト構築
- ARENA: 参加人数 = ラウンド数（各自1譜面）
- BPL(3 STAGE): 2人固定
  - `P1指名 + P2指名 + Masterランダム1譜面`
- BPL4(4 STAGE): 2人固定
  - `P1指名 + P2指名 + P1指名 + P2指名`
- 凍結時に各ラウンドへ `expected_key` を確定して埋める
  - `expected_key = (play_style, difficulty, title_search_key, chart_id?)`
  - `chart_id` が確定できる場合は優先し、欠落時は従来キーで後方互換運用する

## 9. PLAYING（ラウンド進行）
### 9.1 ラウンド確定状態（PlayerRoundState）
各ラウンドで各プレイヤーは次のいずれかに到達したら確定:
- `PLAYED`（リザルト採用）
- `SKIPPED`（本人 or 条件解禁後のホスト代理）
- `TIMEOUT`（round_soft_ttl超過 or FORCE_ADVANCE）

### 9.2 expected一致（誤採用防止）
- 各ラウンドに `expected_key` を保持
- 受理するリザルトは `observed_key == expected_key` のみ
  - `play_style/difficulty/title_search_key` は常に一致必須
  - `chart_id` は双方に存在する場合のみ一致必須（`daken_counter_v3` は `expected_key.chart_id` がある場合、`observed_key.chart_id` 欠落を不受理）
- 許容窓: `accept_window_rounds = 0`（当該ラウンドのみ）

### 9.3 提出採用（初回のみ）
- 1ラウンドにつき 1プレイヤーの採用は「初回のみ」
- 既に `PLAYED/SKIPPED/TIMEOUT` のプレイヤーからの追加提出は拒否（ログには残してよいが勝敗に使わない）

### 9.4 SKIP（自己申告のみ）
- SKIP は常に本人のみ実行可能（`SKIP_SELF`）
- 他プレイヤーへの代理 SKIP（`SKIP_HOST_ASSIGN`）は現行v1では受理しない
- SKIP理由は必須: `UNOWNED | TECH | OTHER`

### 9.5 強制進行（`FORCE_ADVANCE` / force finalize）
- ホストのみ
- クライアントは確認ダイアログ必須
- DOは未確定者を全員 `TIMEOUT`（`submitted_by=SYSTEM`）として確定し次ラウンドへ進める（最終ならRESULTへ）

### 9.6 タイムアウト処理
- `round_soft_ttl` 到達で未確定者は `TIMEOUT`
- `match_ttl` 到達で進行中ラウンドも含めて未確定を `TIMEOUT` 確定し、結果確定不能なら `CLOSED`、結果確定済みなら `RESULT` として扱う
- `RESULT_READY` 生成後の `RESULT` / `CLOSED` では提出系は受理しない

### 9.7 演出タイムライン
- `round_started_at` は演出開始時刻（`ROUND_BEGIN`）を指す
- `PLAYING +0s`:
  - 表示: `MUSIC SELECT:45`
  - `round_intro`
- `PLAYING +35s`:
  - 残り10秒から1秒まで `count_beep`
- `PLAYING +45s`:
  - 表示: `PLAY START:10`
  - `phase_locked`
- `PLAYING +52s`:
  - 残り3秒から1秒まで `count_beep`
- `PLAYING +55s`:
  - 実プレイ開始
  - `count_go`
  - `round_soft_ttl` はこの時点から計測する

### 9.8 離脱
- PLAYING開始後の新規参加は不可
- PLAYING中に退出したプレイヤーは、その時点で未確定なら `TIMEOUT`、以後のラウンドも `TIMEOUT` として扱う
- ホスト切断（`HOST_DISCONNECTED`）: `rejoin_cooldown` 経過まで再接続猶予。超過で `CLOSED`

### 9.9 Round Result（曲別リザルト）表示フェーズ
- Round Result は FSM の独立状態ではなく、クライアント表示フェーズとして扱う
- 各ラウンド確定後、クライアントは `round_result_seconds` だけ Round Result を表示する
- 非最終ラウンドの表示順序は `PLAYING -> Round Result -> PLAYING` とする

## 10. RESULT（集計 payload）
### 10.1 勝敗指標
- `win_metric=SCORE`: EX SCOREが大きいほど勝ち
- `win_metric=MISSCOUNT`: misscount(bp)が小さいほど勝ち
- `SKIPPED/TIMEOUT` の値:
  - SCORE: 0
  - MISSCOUNT: 9999

### 10.2 ARENA配点（方針A）
- rank1: 2pt
- rank2: 1pt
- rank3/4: 0pt
- 同点は同順位、順位飛ばしあり（競技標準）
  - 例: 2人同率1位 → 2,2,0,0

### 10.3 BPL / BPL4
- 各ラウンド勝者が1勝
- BPL: 3ラウンドを実施し、総勝ち数で勝敗を決定
- BPL4: 4ラウンドを実施し、総勝ち数で勝敗を決定
- 同点（SCORE同値 / MISSCOUNT同値）は「勝ち数加算なし」
- 既定ラウンド終了時に同勝ち数なら総合引き分け

### 10.4 再戦復帰
- ホスト操作で `RESULT -> LOBBY` に戻せる
- 復帰時は前マッチの ready / round / pick / aggregation / `match_ttl` をすべてクリアする
- room_id / member 構成 / host / battle context は維持する
- `visibility=PRIVATE` かつ `auto_rematch=true` の場合は `RESULT` 開始時に 20 秒の自動再戦カウントを開始し、条件を満たすと内部イベントで次戦へ遷移する
- 自動再戦中に以下が発生した場合は通常の `RESULT` 待機へフォールバックする
  - ホスト切断
  - 参加対象プレイヤーが2人未満
  - 参加対象の source 異常
  - ホストによる停止操作
- `settings.auto_match=true` の部屋は `RESULT` 開始時に20秒解散カウントを開始し、満了で `CLOSED` へ遷移する（`RETURN_TO_LOBBY` は不可）

### 10.5 rated / unrated 判定（v1）
- rated 判定は DO が一元管理し、`RESULT_READY.summary.is_rated` を権威情報とする
- 以下をすべて満たす場合のみ rated:
  - 全参加者の確定結果が揃っている
  - 全 round が確定している
  - `observed_key == expected_key` の不一致が発生していない
  - `SKIPPED` / `TIMEOUT` / `FORCE_ADVANCE` が1件もない
  - マッチが途中終了していない
  - 最終勝者が一意に確定している
- 上記のいずれかを満たさない場合は `RESULT_READY` 自体は生成するが `is_rated = false` とし、`rated_block_reason` を設定する

### 10.6 最終ラウンド時の表示順序
- 最終ラウンド完了時は `PLAYING -> RESULT` 遷移後、`RESULT` 内で `Final Round Result -> Match Result` の順に表示する
- Final Round Result の表示は省略せず、`round_result_seconds` 以上を保証する

## 11. CLOSED（解散）
- ホスト操作で即 `CLOSED` も可
- 対戦正常終了時は `RESULT` に入り、必要に応じて `RESULT -> LOBBY` で再戦準備に戻す
- 部分結果は各クライアントのローカル保存（snapshot）で表示可能とする
- `CLOSED` 遷移時に `LobbyDirectoryDO` のロビー情報を削除する
- `cancel` SE は `close_reason != ALL_ROUNDS_COMPLETED` のときのみ1回だけ鳴らす
- `close_reason = ROOM_STATE_LOST` の場合、クライアントはブロッキングエラーを表示する
- `settings.auto_match=true` の部屋は `REMAKE ROOM`（再作成）不可

---

## 12. Host開催モード（Issue #188）

本節は `room_kind=HOST_EVENT` 専用であり、前節までの通常ARENA/BPL/BPL4の人数、FSM、TTL、自動進行、成績を変更しない。開催は `event_type=CASUAL|TOURNAMENT`、`event_name`、`host_plays:boolean` を作成時に固定し、`PRIVATE` のみとする。`event_name`の入力契約は通常`room_comment`と同じく空欄可・最大80文字・改行不可で、保存時に自動trimしない。表示時はtrim後が空なら開催タイプとプレースタイルから規定名を生成する。プレー参加者は最大20人で、兼任Hostは人数に含み、専任Hostは別枠とする。開催は `LobbyDirectoryDO`、自動マッチ、公開募集、spectatorへ登録しない。

### 12.1 状態と集合

- `EventRoomPhase = LOBBY | PICKING | PLAYING | RESULT | CLOSED`。`PLAYING`は`round_phase=ACTIVE|RESULT`を持ち、曲別結果は独立RoomStateではなくHostが進めるまで保持する内部/UI phaseである。
- 未開始`LOBBY`では`event_id=null`。`START_EVENT`成功時に、同じ保存境界で`event_id`と`started_at`を発行して`LOBBY -> PICKING`へ進む。1人以上のプレー参加者を必須とし、大会はこの時点の名簿と配点母数`N`を固定する。
- `PICKING`は選曲確定、準備、曲開始を扱う。準備は確定譜面に対してのみ有効で、選び直しは当該曲の準備をリセットする。
- `START_ROUND` は準備完了0人を拒否する。大会の準備分母は切断で枠を維持する対象者を含み、left/kickedを除く当該曲対象者全員。合同プレーは1人以上の準備完了を必要とし、未準備者は当該曲の対象外とする。
- `PLAYING`は開始時対象集合を凍結する。全対象者の提出/スキップ/退出/Kick確定で、Host接続中のみ自動確定する。Hostは途中締切できる。
- 曲別確定後は `PLAYING/RESULT` に留まり、時間では遷移しない。Hostの`NEXT_PICK`受理時だけ`PICKING`へ進み、`LOBBY`へ戻らない。Hostは曲別結果で次曲選択または開催終了を行う。
- 合同プレーは選曲確定前の新規参加者を当該曲へ含め、確定後は次曲待ちとする。大会は開催開始後の新規参加を拒否する。明示退出からの復帰は両種とも次曲から、一時切断からの復帰は開始時対象かつ未確定・未提出の場合だけ当該曲へ戻せる。
- 選曲可能譜面は当該選曲集合全員の通常配信・所持pack・BIT/DJP解禁の積集合。専任Host、退出者、Kick済み参加者は除外し、切断中の枠は含める。確定前の集合変更では再計算し、不適合になった選択を解除する。確定後は凍結する。

### 12.2 結果、無効化、終了

- 最初の有効な提出だけを採用する。欠場は `ABSENT` 状態と理由を実測`SUBMITTED`から分離し、SCORE=0 / MISSCOUNT=9999、大会0pt、順位なしとする。
- 有効提出者はSCORE降順/MISSCOUNT昇順。同値は同順位で後続順位を飛ばす。大会ptは固定`N - rank + 1`、合同プレーは総合pt/順位を生成しない。
- 開始済み曲は次曲開始前かつ開催終了前までHostが無効化できる。無効曲は履歴に残し、総合は有効な確定曲から再集計して差分加点を残さない。
- participantが0人の`LOBBY/PICKING`では空round/空結果を作らず、Hostは待機または`END_EVENT`を選べる。`END_EVENT` はLOBBY/PICKING/曲別結果、または確認済みPLAYING/ACTIVEで受理する。ACTIVE中の未確定曲は無効化し、確定済み曲だけを残す。0曲/全曲無効は優勝者を生成しない。
- `EventEndReason = HOST_ENDED | HOST_DISCONNECTED | ROOM_STATE_LOST`。

### 12.3 Host切断とtimer

- 開催には通常の `ready_check_ttl`、`picking_ttl`、`round_soft_ttl`、`match_ttl`、自動再戦を適用しない。
- Host切断時は元phaseを保持し、新規mutationは開始済み曲の有効な`SUBMIT`だけを受理する。`SKIP`、新曲開始、結果確定、締切、無効化、終了、Kickは停止する。`EVENT_JOIN`/再接続、`STATE_GET`、`RESULTS_GET`、`PING/PONG`等のread-only同期は許可し、未確定score非送信を維持する。
- 切断検知時の絶対時刻 `host_disconnect_deadline = now + 300s` を保存する。再接続試行、alarm、DO再起動で延長しない。`now >= deadline`では復帰より期限到達を優先し、未確定曲を無効化して終了する。
- 作成後Hostが一度も接続しない場合も `created_at + 300s` を初回接続期限とする。終了済み開催は進行不能とし、終了から1800秒後に接続、record、曲記録、冪等記録を回収する。
