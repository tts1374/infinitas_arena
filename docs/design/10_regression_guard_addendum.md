# 回帰防止追補仕様（Ph1）

## 0. 目的
本追補は、`docs/design/01-08` のうち回帰を起こしやすい契約境界を最小差分で補強する。

対象:
- Source 契約
- `ROOM_STATE_LOST` 失敗モード
- `RESULT_READY` payload 形状
- ローカル保存の互換/移行ルール

## 1. Source 契約（固定）

### 1.1 SourceType 列挙
`SourceType` の受理列挙値は次で固定する。
- `inf_daken_counter`
- `inf-notebook`
- `daken_counter_v3`
- `reflux`

### 1.2 運用プロファイル
- 1端末1ソース固定。
- ルーム参加中の source 変更は禁止。
- `inf_daken_counter` は legacy/deprecated とし、運用有効化しない構成では `ROOM_JOIN` を拒否できる。
- legacy source の有効/無効を切り替える場合は、`02/03/06/07` と `QUALITY.md` を同一PRで更新する。

## 2. `ROOM_STATE_LOST` 契約（固定）

- `CloseReason` に `ROOM_STATE_LOST` を含める。
- DO が復元不能または必須状態欠落を検知した場合は、`ROOM_STATE_LOST` を返却/通知する。
- `ROOM_STATE_LOST` ではクライアントはブロッキングダイアログを表示する。
- `ROOM_STATE_LOST` では部分結果の表示はローカル snapshot を正とする。

## 3. `RESULT_READY` payload 最小スキーマ（固定）

`RESULT_READY.payload` は以下を最低限満たす。

- `summary`
  - `match_id`
  - `mode`
  - `win_metric`
  - `total_rounds`
  - `completed_rounds`
  - `winner_player_ids`
  - `is_draw`
  - `is_rated`
  - `rated_block_reason`
  - `rating_before`
  - `rating_after`
  - `rating_delta`
- `per_round.rounds[]`
  - `round_index`
  - `expected_key`
  - `display`
  - `round_started_at`
  - `played`
  - `winner_player_ids`
  - `results[]` (`player_id/status/metric_value/reason/submitted_at/submitted_by/source_meta`)
- `per_player.players[]`
  - `player_id`
  - `display_name`
  - `rounds[]`
  - モード別集計（ARENA: `total_points` 等、BPL: `round_wins` 等）

## 4. 互換/移行ポリシー（固定）

- ローカル保存は `schema_version` を必須とする。
- `schema_version` の互換ルール:
  - 加法的変更（optional追加）は同一バージョン内で許容。
  - 破壊的変更はバージョンを上げる。
- 読み込み側は「現行 + 直前」のみサポートし、それ以前は空アーカイブへフォールバックする。
- 移行不能データは破棄せず、少なくとも読み込み失敗を検知できるログを残す。

## 5. 整合更新ルール（固定）

以下の変更は同一PRで更新する。
- `SourceType` 変更: `02/03/06/07` + `QUALITY.md`
- `CloseReason` 変更: `01/02/07` + client 表示仕様
- `RESULT_READY` 変更: `02/03` + shared 型 + worker/client 利用箇所

## 6. Spectator 契約（固定）

- `ROOM_JOIN.payload.session_kind` は additive で導入する（`PLAYER` 既定、`SPECTATOR` 追加）。
- `session_kind=SPECTATOR` は read-only セッションを意味し、player slot を消費しない。
- `PRIVATE` ルームの spectator 参加は join_code 認可を必須とする。
- spectator 向け `RoomStateSnapshot` は redacted 形で返す（最低限 `settings.join_code=null`）。
- spectator からの操作系メッセージは `INVALID_STATE` で拒否する。

## 7. Host開催の分離契約（Issue #188）

| 境界 | 通常ARENA/BPL/BPL4 | `HOST_EVENT` |
| --- | --- | --- |
| 人数 | 既存2〜4人 | participant最大20人。専任Hostは別枠 |
| protocol | `ROOM_* / RESULT_*` | `EVENT_*`。通常snapshot/resultを送らない |
| 進行 | 既存TTL、自動次round/再戦 | Host主導。通常TTL/自動進行なし |
| score公開 | 既存契約 | 曲確定後のみ一斉公開。進行中はHostにも非送信 |
| 保存 | 通常room record/archive/stats | 別keyのevent record、別event history schema |
| lobby | 既存条件で公開 | PRIVATE固定、LobbyDirectory/auto-match/share非掲載 |

- `PLAYING`中の開催message、snapshot、再接続、ACK、ERROR、debug、RESULTS取得には未確定metric/source/rankを含めない。内部提出型と公開結果型を分離する。
- 旧clientの通常対戦は新serverで維持する。旧clientの開催入室はsnapshot前に拒否する。新clientは旧server/未知capabilitiesで開催だけを無効にする。
- `room_kind`欠落recordは通常として従来hydrateする。event recordを通常roomへhydrateせず、不正event recordは`ROOM_STATE_LOST`とする。ローカルpartial履歴は受信済み表示用であり、server確定結果や再開の代用にしない。
- 開催は既存`ROOM_DO` bindingを使い、新binding/migrationを追加しない。通常recordと開催recordのstorage keyを分ける。
- Hostの300秒期限は絶対時刻で保持し、再接続試行、alarm、再起動で延長しない。保存成功前にACK/公開しない。
- event historyは通常archive/statistics/personal bestへ流さず、未知schemaの原本を保持する。
- active eventを残した旧serverへの無条件rollbackは禁止する。新規受付を先に停止し、既存開催の終了/保存を待つ。
- Host開催contractを変更する場合は`01/02/03/05/06/07/10`、shared型、worker/client consumer、契約testを同一変更で同期する。
