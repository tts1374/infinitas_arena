# 画面一覧（Ph1）

## 0. 目的
Ph1で実装対象とする画面・状態・主要操作を整理する。  
ワイヤーフレームではなく、画面責務と表示要素の一覧を定義する。

## 0.1 用語（本書）
- `Round Result`（曲別リザルト）:
  - 1ラウンド単位の結果表示。対象曲、各プレイヤーの metric、勝者、status を示す。
- `Match Result`（最終結果 / RESULT）:
  - マッチ全体の最終集計表示。総合順位/勝敗、合計ポイント、rated/unrated を示す。
- `Round History`:
  - ルーム画面内で表示する、当該マッチ内ラウンド履歴。
- `Match History`:
  - 統計画面で表示する過去マッチ履歴（`matches`）。

---

## 1. 画面構成一覧

Ph1 の画面は以下とする。

1. 設定画面
2. ロビー一覧画面
3. ルーム画面
   - LOBBY
   - PICKING
   - PLAYING
   - RESULT
4. 統計画面
5. エラーダイアログ / 通知
6. アプリ観戦モード（read-only）
7. 自動マッチング画面（Auto Match）

---

## 2. 設定画面

## 2.1 目的
- 端末固有設定を管理する
- プレイヤー情報と監視ソースを事前に確定する
- ローカル監視対象の状態確認を行う

## 2.2 主な表示項目
- `display_name`
- `player_id`（表示のみ / コピー可能）
- `source`
  - `inf-notebook`
  - `daken_counter_v3`
  - `reflux`
  - `inf_daken_counter`（legacy / 通常UI非表示）
- 監視対象ファイルパス
  - `inf-notebook`
    - `export/recent.json`
    - `records/summary.json`
  - `reflux`
    - `latest.json`
    - `tracker.tsv`
  - `daken_counter_v3`
    - `ws://localhost:{port}`（default `8767`）
  - `inf_daken_counter`（legacy）
    - `today_update.xml`
- 楽曲解禁設定
  - BIT解禁 ON/OFF
  - DJP解禁 ON/OFF
  - 所有 song pack 一覧
- 監視状態表示
  - 正常
  - 未検出
  - 読取失敗
- 音声通知 ON/OFF
- 保存ボタン

## 2.3 主な操作
- display_name 編集
- source 選択
- 監視対象ディレクトリ/ポート選択
- 楽曲解禁設定の編集
- 保存
- 接続テスト / 監視テスト（任意、Ph1では未実装でも可）

## 2.4 制約
- ルーム参加中は source 変更不可
- 監視異常時は `SOURCE_UNAVAILABLE` として表示し、TECHスキップ誘導対象となる

---

## 3. ロビー一覧画面

## 3.1 目的
- ルームの検索・参加・作成を行う
- 公開ルームの概要を一覧で確認する

## 3.2 主な表示項目
- アクティブロビー件数
  - `GET /api/lobby` の返却件数を表示
- ルーム一覧（v1 はページングなし）
  - roomName
  - ownerDisplayName
  - currentPlayers / maxPlayers
  - status
  - 作成日時

## 3.3 主な操作
- ルーム作成
- room_id または join_code による参加
- 10秒 polling による一覧更新
- 手動リロード

## 3.4 備考
- 一覧正本は `LobbyDirectoryDO` のみとする（KVは使用しない）
- 一覧には以下をすべて満たすルームのみ表示する
  - `isPublic = true`
  - `isFull = false`
  - `status = LOBBY`
  - TTL 未超過
- `PICKING` / `PLAYING` / `RESULT` は一覧非表示とする

---

## 3.5 自動マッチング導線（Phase1）
- ロビー一覧画面に `自動・Auto Match` ボタンを配置する
- ボタン押下で自動マッチング画面へ遷移する
- 既存の手動PUBLIC導線は残し、並行運用する

---

## 4. ルーム作成ダイアログ

## 4.1 目的
- 新規ルームを作成する
- ルームの対戦条件を決定する

## 4.2 入力項目
- ロビー公開設定
  - `PUBLIC`
  - `PRIVATE`
- 自動再戦
  - 項目名は `自動再戦する`
  - `PRIVATE` 選択時のみ表示する
  - デフォルトは OFF
- `join_code`
  - 自動生成
  - 手入力可
- mode
  - `ARENA`
  - `BPL`
- win_metric
  - `SCORE`
  - `MISSCOUNT`
- play_style
  - `SP`
  - `DP`
- level_filter
  - `ANY`
  - `LV8_10`
  - `LV10`
  - `LV11`
  - `LV12`
- max_players
  - 2
  - 3
  - 4
- room_comment

## 4.3 主な操作
- join_code 自動生成
- 作成
- キャンセル

## 4.4 バリデーション
- join_code は 8文字・大文字英数字（紛らわしい文字除外）
- room_comment は最大80文字、改行なし

---

## 5. ルーム画面（共通）

## 5.1 目的
- ルームの現在状態を表示する
- 状態に応じた操作を提供する

## 5.2 共通表示要素
- room_id
- join_code
- mode / win_metric / play_style / level_filter / max_players
- room_comment
- 現在の RoomState
- 参加プレイヤー一覧
  - display_name
  - 接続状態
  - ready状態
  - source
- ホスト表示
- 退出ボタン
- quick-chat recent messages（直近30件）
- per-player quick-chat speech bubble（最新メッセージを短時間表示）

## 5.3 Quick Chat
- 対象状態: `LOBBY` / `PICKING`
- 入力: 共有 catalog の phrase block を選択し、選択順に `join("")` して送信する
- 制約: 送信文字列は非空かつ20文字以内。任意 free-text は扱わない
- 表示: accepted message は room chat log と player speech bubble に表示する
- spectator: recent messages は閲覧可、投稿は read-only として不可

---

## 6. ルーム画面: LOBBY

## 6.1 目的
- 参加者が集まるまで待機する
- ready 状態を揃えて次マッチ開始条件を満たす
- `RESULT -> LOBBY` 復帰時の再戦導線を担う

## 6.2 主な表示項目
- 参加者一覧
  - ready / not ready
- ルーム設定表示
- join_code 共有情報
- ready 残り時間
- start 可能/不可理由（host向け）

## 6.3 主な操作
- 全員:
  - READY切替
  - 退出
- ホスト:
  - START ボタン（送信操作: `START_MATCH`）
  - RESULT から戻った後の再戦開始
  - 解散
- 非ホスト:
- START ボタンは表示しない

## 6.4 制約
- ホストのみ `START_MATCH` 実行可能
- `players < 2` は `START_MATCH` 成功不可
- `ready=false` の参加者がいる間は `START_MATCH` 成功不可
- `max_players` は募集枠であり、開始人数は `START_MATCH` 時点の参加人数で確定
- `RESULT -> LOBBY` 復帰時は全員 ready が解除される
- LOBBY ready ttl 20分超過で解散

---

## 7. ルーム画面: PICKING

## 7.1 目的
- 各プレイヤーが対象譜面を1つ選ぶ
- 凍結譜面リストを確定する

## 7.2 主な表示項目
- 自分の選曲UI
- フィルタ条件（play_style / level_filter）
- 難易度 / level / keyword による曲検索 UI
- 選曲候補一覧（10件単位ページング）
- 選曲済みプレイヤー一覧
- PICKING 状態表示
- 120秒カウントダウン

## 7.3 主な操作
- 曲検索
- 曲選択
- 指名送信

## 7.4 備考
- 同一譜面重複は DO 側で解決
- 後着重複枠はランダム差し替え
- timeout 時は未pickプレイヤーをランダム補完
- 凍結後に `PICK_FROZEN` を受信し PLAYINGへ遷移

---

## 8. ルーム画面: PLAYING

## 8.1 目的
- 現在ラウンドの対象譜面を提示する
- リザルト提出待ち・SKIP・TIMEOUT を扱う

## 8.2 主な表示項目
- ラウンド番号
- 対象譜面情報
  - 曲名
  - 難易度
  - level
- 参加者ごとの現在状態
  - 未確定
  - PLAYED
  - SKIPPED
  - TIMEOUT
- round進行タイマー
- 演出カウントダウン
  - `MUSIC SELECT:45`
  - `PLAY START:10`
  - `IN PLAY`
- 音声進行状態
  - Stage
  - countdown
  - START
- Round History（当該マッチ内ラウンド履歴）
- Round Result（曲別リザルト）

## 8.3 主な操作
- 自分でSKIP
- ホスト:
  - 強制進行（確認ダイアログあり）

## 8.4 演出仕様
- Stage:`ROUND_BEGIN` で `round_intro`。既存のステージ/曲情報読み上げがある場合は併用可
- countdown:`+35s` から `count_beep` を残り10秒から1秒まで再生
- `+45s` から表示を `PLAY START:10` に切り替える
- `+45s` で `phase_locked`
- START:`+52s` から `count_beep` を残り3秒から1秒まで再生
- `+55s` で `count_go`
- `+55s` 以降をプレイ中とし、`round_soft_ttl` 起点もこの時点とする

## 8.5 備考
- 提出は自動監視で反映
- expected一致しないものは採用しない
- 状態遷移時は未再生音声キュー破棄、再生中音声停止
- Round Result は RoomState ではなく表示フェーズとして扱う
- 各ラウンド確定後に `ROUND_RESULT_SECONDS` だけ Round Result を表示する
- 非最終ラウンドは `PLAYING -> Round Result -> PLAYING` で次ラウンドへ進む
- Round History は `current_match_id` 単位で表示し、`current_match_id` 更新時にクリアする

---

## 9. ルーム画面: RESULT

## 9.1 目的
- ラウンド結果と総合結果を表示する
- 再戦のために `LOBBY` へ戻る導線を提供する

## 9.2 主な表示項目
- 総合順位 / 勝敗
- プレイヤー別ポイント / 勝ち数
- ラウンド別結果
  - 対象譜面
  - metric 値
  - status（PLAYED / SKIPPED / TIMEOUT）
  - reason
- rated / unrated と block reason
- 強制進行の有無
- 自動再戦情報（`PRIVATE` かつ自動再戦有効時のみ）
  - `自動再戦ON` バッジ
  - `次戦まで xx 秒` カウントダウン

## 9.3 主な操作
- ホスト:
  - LOBBYへ戻る
  - `自動再戦を停止`
- 各プレイヤー:
  - `今回は不参加`（自分のみ操作可）
- JSON保存確認（自動保存のみでも可）
- OBS/HTML用の後続導線（Ph1では未実装でも可）

## 9.4 備考
- 正常終了時は `RESULT_READY` を保持したまま `RESULT`
- `RESULT -> LOBBY` 復帰時は全員 ready と前マッチ揮発データをクリアする
- 自動再戦の見た目は `RESULT -> PICKING` に見えてよいが、内部遷移は必ず `RESULT -> LOBBY -> PICKING` を通す
- ホスト解散や timeout close の場合は `CLOSED` へ遷移し、結果未確定の可能性がある
- 最終ラウンド完了時の表示順序は `Final Round Result -> Match Result` とする
- 最終ラウンドの Round Result は省略せず、`ROUND_RESULT_SECONDS` 以上表示する

---

## 10. 統計画面

## 10.1 目的
- 対戦結果と自己成績の統計を確認する
- 系列別の内部レート、直近勝敗、曲別得手不得手、安定度を可視化する

## 10.2 主な表示項目
- 上部フィルタ
  - ルール切替: `ARENA` / `BPL`
  - モード切替: `SP` / `DP`
- レート / 履歴
  - 現在レート（未計測は `--`）
  - 直近10件のマッチ単位 `W / L / D`
  - `rating_delta`（保持できる場合）
  - ラウンド詳細
- 曲別勝率ランキング
  - 勝率上位
  - 勝率下位
  - 曲名
  - 譜面
  - 勝率
  - 勝敗数
  - 対戦数
  - 平均EX差
- 安定度
  - スコア安定度（直近20曲平均）
  - ミス安定度（直近20曲平均との差）
  - 対象曲数

## 10.3 表示ルール
- レート / 履歴 / 曲別勝率ランキングは `battle_type + play_mode` 完全一致で切り替える
- 履歴は `matches` を基準に `ended_at desc` で表示する
- 曲別勝率ランキングは `match_games` を基準に `battle_type + play_mode + chart_id` で集計する
- 安定度は `play_results` と `personal_bests` を基準に集計し、`PRIVATE` を含めてよい
- 本節の「履歴」は Match History（統計履歴）を指し、Room内の Round History とは別概念とする
- データ不足時は以下を表示する
  - レート未計測: `--`
  - 履歴なし: `データなし`
  - 勝率ランキング対象不足: `3戦以上のデータが必要です`
  - 安定度対象不足: `比較対象データが不足しています`

## 10.4 主な操作
- ルール切替
- モード切替

---

## 11. アプリ観戦モード（read-only）

## 11.1 目的
- アプリ内から read-only で対戦進行を監視する
- スコア進行・状態遷移を閲覧し、ルーム操作権限は持たない

## 11.2 主な表示項目
- room_id
- join_code 入力欄（PRIVATE 観戦時）
- 接続状態（connecting / joined / closed / error）
- 現在状態（room_state, mode, win_metric）
- 現在ラウンド（round_index, expected_key, confirmed status）
- プレイヤー別進行（status / metric_value）
- 観戦開始後イベントログ（接続後に受信したWSイベントのみ）

## 11.3 主な操作
- 観戦接続（`ROOM_JOIN(session_kind=SPECTATOR)`）
- 切断
- 状態再取得（`STATE_GET`）

## 11.4 制約
- spectator は read-only。操作系メッセージは server-authoritative で拒否される
- spectator は `max_players` を消費しない
- PRIVATE 観戦は join_code 認可を必須とする
- 表示履歴は観戦開始後のイベントのみを扱う

---

## 12. エラーダイアログ / 通知

## 12.1 対象
- `ROOM_FULL`
- `JOIN_CODE_INVALID`
- `NOT_HOST`
- `INVALID_STATE`
- `START_REQUIRES_MIN_PLAYERS`
- `RESULT_KEY_MISMATCH`
- `ROUND_ALREADY_CONFIRMED`
- `HOST_SKIP_LOCKED`
- `ROOM_STATE_LOST`
- `SOURCE_UNAVAILABLE`
- `CLIENT_VERSION_UNSUPPORTED`
- `PLAYER_ALREADY_CONNECTED`（再接続中の一時拒否表示）

## 12.2 表示方針
- 操作失敗系はダイアログ
- 一時通知でよいものはトーストでも可
- `ROOM_STATE_LOST` と `SOURCE_UNAVAILABLE` は明示的ダイアログ推奨

---

## 13. 画面遷移概要
- 設定画面 ↔ ロビー一覧
- ロビー一覧 ↔ 統計画面
- ロビー一覧 -> ルーム作成
- ロビー一覧 -> 自動マッチング画面
- ロビー一覧 -> ルーム画面（参加）
- ルーム画面内で状態遷移
  - LOBBY
  - PICKING
  - PLAYING
  - RESULT
  - CLOSED
- ルーム終了後 -> ロビー一覧へ戻る

---

## 14. Host開催画面（Issue #188 §10）

通常Room/統計画面とは別に`EventRoomPage`と`EventHistoryPage`を設ける。Lobbyから開催作成/参加コード入室へ進み、capabilitiesがprotocol=1を示すまで開催操作を無効にする。通常roomと開催roomへ同時参加できない。作成時の開催名は通常`room_comment`と同じく空欄可・最大80文字・改行不可とし、空欄時の表示は開催タイプ＋プレースタイルの規定名へフォールバックする。

- Host/PICKING: 上段に開催種別、`event_name`、曲番号、開催終了。準備人数の横に薄い「最大20人」、次曲待ち人数を表示する。左に選曲、右に縦scroll可能な全参加者一覧を置き、主操作を画面内に維持する。Kickは準備操作から離し、対象名と再参加不可を確認する。兼任Hostだけ自分の準備操作を表示する。
- Client/PICKING: 上段に退出、曲情報、自分の状態。対象者だけ準備操作を表示し、準備/対象人数、薄い最大20人、次曲待ちを区別する。合同プレーで未準備のまま開始対象外になる場合は警告を表示する。
- PLAYING: Host一覧は提出/未提出/スキップだけを表示し、未確定score/rankを表示しない。Hostは途中締切と無効化を操作でき、締切確認に欠場予定人数を示す。Clientは「提出完了 n/m」、自分の提出状態と、未提出の対象者だけスキップ操作を表示する。
- Host切断: 全画面共通で再接続待ち帯と残り時間を表示し、進行操作を無効にする。
- 曲別結果: Hostは全順位。Clientは上位3人と自分の前後2人を重複なしで表示し、全順位導線を持つ。同順位内は開催参加順で安定表示する。欠場理由、SCORE 0/MISSCOUNT 9999、大会0pt、同順位、無効状態を明示する。合同プレーに総合tabを出さない。Hostだけ次曲、終了、許可期間内の無効化を操作できる。
- 最終結果: 次曲操作を出さず、大会は総合順位、合同プレーは曲別振り返り、共通で終了理由を表示する。0曲/全曲無効は「確定した曲はありません」とする。
- 開催履歴: 日時、種別、曲数、complete/partial一覧から詳細へ遷移し、通常対戦履歴/統計と混ぜない。未知schemaは読めない旨を表示する。
- 0人、共通譜面0件、開始不可理由、source異常、競合失敗は理由と最新authoritative stateを表示する。操作要求中は二重クリックを抑止し、曲別結果を秒数だけで次曲へ進めない。
