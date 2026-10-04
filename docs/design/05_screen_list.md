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
8. 合同・大会の専用入口・作成・参加画面
9. 開催進行画面・開催履歴画面（通常履歴/統計とは別）

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
- Topは通常対戦ロビーを維持する。招待制開催の作成/参加はサイドバーの「合同・大会」から専用入口へ進む（§14）。

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
- サイドバーの合同・大会 -> 専用入口 -> 作成/参加の個別ページ -> 開催進行画面
- 専用入口/最終結果 -> 開催履歴。開催在室中のページ移動は接続/membershipを維持し、「進行中の開催へ戻る」から復帰する。明示退出/Host終了とは別操作とする。

---

## 14. Host開催画面（Issue #188 §10）

通常Room/統計画面とは別に`EventEntryPage / EventCreatePage / EventJoinPage / EventRoomPage / EventHistoryPage`を設ける。Topは通常ロビー、サイドバーの「合同・大会」から専用入口の作成/参加2入口と開催履歴へ進む。capabilitiesがprotocol=2を示すまで開催操作を無効にし、未対応/404/未知版は更新必要・開催受付不可と表示、通常対戦の可否は別に示す。通常roomと開催roomへ同時参加できず、通常へ新規参加する際は現在の参加状態による排他理由を表示する。

画面と確認量の正本は`docs/ux/issue-188-redesign/issue-188-draft.md`、`prototype-review.md`、保存済み`prototype/event-host-led-prototype.html`。通常対戦の曲/難易度ヘッダー、プレイヤーカード、下部アクション、順位カードを土台にする。試作上部の条件指定・提出再現・架空休憩申告は製品操作にしない。

- 作成: タイプ、開催名、SP/DP、指標、専任/兼任、招待制を説明し「待機室を作る」。作成と開催開始を区別する。開催名は空欄可・最大80文字・改行不可・暗黙trimなし、空欄の表示は開催タイプ＋プレースタイルの規定名。専任HostはDATA SOURCE不要。大会は開始後の新規参加不可/固定N配点、合同は途中参加可/総合なしを説明する。
- 参加: 開催ID＋参加コードを個別入力。招待文一括貼り付け・コード単独検索を追加しない。接続処理中/受付不可/満員/コード不一致/新規不可/復帰可を区別し、失敗や修正で入力を失わない。
- ページ移動: 在室接続を維持し、行先変更と退出を区別する。「進行中の開催へ戻る」を常設する。明示退出/Host終了だけがmembershipを変える。
- 待機室: 人数/上限、Host役割、開催条件、招待情報、接続状態。Hostは「開催を開始して選曲へ」、参加者はHost待ち。0人は開始不可理由と待機/終了を示す。譜面未確定の準備ボタンや準備0/0表示を置かない。
- PICKING: 上部に曲/難易度/ROUNDと選曲中/開始待ち、中央は自分先頭のプレイヤーカード、下部は進行案内＋Hostの全体開始/参加者の待機、右は曲履歴/条件/管理。20人desktopは4列カード一覧だけを独立scrollし主操作を押し出さない。狭幅は2列、右情報を下へ積む。接続人数、serverの当該曲対象人数、最大20人、次曲待ちを分ける。Ready/準備解除/連続参加設定を設けない。参加者は通話・配信で曲と開始を受けゲーム内準備を行う。
- 役割: 専任Hostは自分の参加/提出カードなし。兼任Hostは自分のカードと下部の全体進行操作を持つが、自分用準備操作なし。参加者にはHost操作を出さない。確定譜面/当該曲対象1人以上/Host接続で開始可、対象0人/未確定/Host切断は不可。参加者切断/通話休憩は席と対象を保持し、Hostが待つか開始するか判断できる。休憩state/ボタンを追加しない。
- PLAYING: 対象譜面、自動提出待ち/送信中/再接続/サーバー受理済み/次曲待ちを区別する。提出済み表示は受理ACKを根拠とする。Host一覧は提出/未提出/欠場理由だけを表示し、未確定score/rankをHostにも見せない。14/15人提出では未提出1人のまま待ち、締切後だけ欠場・大会0ptとする。締切前の未提出一時復帰は同曲へ提出可、締切後は不可、席と固定Nは維持。source障害は自分の欄で復旧待ち/許可されたスキップを示し、手入力提出を追加しない。
- Host切断: 共通帯に残り絶対期限と停止操作、提出継続を表示し、SKIP/進行を停止する。既存read-only同期と公開済み結果の閲覧は維持し、未確定scoreを送信しない。
- 曲別結果: 上位3人＋必要なら自分の順位カード、Host全順位の詳細表、参加者は上位3人と自分の前後2人を重複なしで表示し全順位へ切替可。カードは表の行数を制限しない。同順位は同強調/同pt、開催参加順で安定表示し優劣にしない。欠場理由、SCORE 0/MISSCOUNT 9999の欠場値と実測値、大会0pt、無効を明示。合同に総合tabなし。下部Host主操作は「次の曲を選ぶ」、補助の終了/締切/無効化は右の開催管理。過去公開結果を閲覧でき、次曲PICKINGでも次曲開始前まで前曲詳細から無効化可能。提出済みparticipantのKickでも確定済み提出を保持する。
- 最終結果: 次曲操作なし、大会総合/合同振り返り、終了理由、受信/同期/保存状態、開催履歴導線。0曲/全曲無効は「確定した曲はありません」、勝者/架空順位なし。
- 開催履歴: 開催名、日時、種別、受信曲数、complete/partial一覧から詳細へ。部分は最終受信時刻/欠けた範囲を説明し、後日クラウド取得や開催再開を約束しない。無効曲は理由と履歴を保持して総合から除外、終了後編集なし。history1/2読取、未知schemaは読めない旨と原本保持、0件は専用入口へ案内する。通常対戦履歴/統計とは別。
- 確認操作: 大会開催開始はN/新規参加締切、選び直しは確定譜面取消/再共有、スキップは自分の欠場/大会0pt、締切は未提出人数/以降受付不可、無効化は曲名/全員分の集計除外/履歴保持、終了/Host退出は全員終了/進行中曲無効、参加者退出は次曲復帰条件、Kickは対象名/再参加不可を確認する。合同開催開始と各曲開始は追加dialogなし。曲候補変更で確認を増やさない。
- 0人、共通譜面0件、開始不可理由、source異常、競合失敗は最新authoritative stateと理由を表示する。操作要求中は二重クリックを抑止する。通常タイマーによる自動選曲/締切/次曲/再戦、必須音声通知、ゲーム重畳を追加しない。
