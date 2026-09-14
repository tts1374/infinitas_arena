# Issue #188 — Host進行型の合同プレー／大会：Phase B実行計画

## 目的・完了条件・実行境界

- 正本: https://github.com/tts1374/infinitas_arena/issues/188 （A仕上げ更新: 2026-09-06T16:00:14Z）。外部動作・画面は同IssueのFixed decisionsと§7–10が優先する。
- objective: 合意した開催モードを、通常ARENA/BPLを維持しながら実装できる契約・bounded packet・依存順・検証へ分解する。
- success criteria: 仕様を再定義せず各packetに着手でき、write ownership・互換・テスト・監査・rollbackを追跡できる。
- Stage / terminal phase / current request ceiling: **Phase B / planning-only**。ユーザーの「このチャットではB相当まで」により、前のA-only境界をBまで明示拡張した。
- allowed outputs now / allowed side effects: 本task文書作成、#188への計画状況の反映、read-only調査、一時原稿。
- forbidden outputs now: C Kickoff、製品実装、規範design docs改変、agent設定変更、依存更新、commit/push/PR/merge/deploy。
- stop condition: 本文・Issueへの反映を照合し、Bの準備判定とC開始前の制約を報告したら停止する。
- next unlock condition: 後続のC実施指示。実装はその時点のモデル設定と必須Spawn Gateを解決し、C Kickoffを完了してから。
- Implementation authorization: **NO**。本書の実装packet・commit案は将来の計画であり、今の実行許可ではない。
- non-goals: #80のランク、通常対戦変更、公開募集/観戦/Host交代、20人超、本人認証BAN基盤、クラウド履歴配信、開催終了後の結果編集。

## Entry Protocol / 調査証拠

- execution profile: **High-Risk**。client/worker/shared横断、FSM/timer/authority/WS/settings/snapshot/persistenceに影響。
- Plan Mode requirement: required。本ファイルを計画成果物とする（アプリの対話モードを変更したという意味ではない）。
- 適用: root AGENTS.md / WORKFLOW.md / QUALITY.md、apps/client・apps/worker・packages/sharedのAGENTS.md。
- 参照skill: plan-mode-gate、quality-check-matrix、fsm-protocol-guard、windows-utf8-safe-write。
- 調査基点: `v1`、`0a44dfc399591003e0bd6481f6d67cc3c2930806`。着手時worktree clean。upstream同期は今回の範囲外。C時に差分を再評価する。
- delegation execution record（B）: spawned: **no**。`execution-coordinator`を実際に起動要求したが、`.codex/config.toml`の既定`gpt-5.6`が利用可能モデルに存在せず失敗、agent idなし。親が調査・計画を担当。設定を黙って変更/代替していない。
- Cの必須spawn: front-implementer、server-implementer、contract-auditor、implementation-auditor。Bで未起動なのは実装開始前のため。モデル不一致はCの実行上の**ESCALATION**であり、Bの仕様/分割不足とは分離する。

| 現行の根拠 | 今回の変更点 |
| --- | --- |
| `packages/shared/src/models/room-settings.ts`、`room-state-snapshot.ts` | 通常RoomSettingsの2/3/4人、通常snapshotは維持。開催用の別契約を追加 |
| `packages/shared/src/ws/server.ts`のPLAYER_ROUND_CONFIRMED | 点数を直ちに送っている。開催ではこの通知を流用せず、確定前の漏洩を防ぐ |
| `apps/worker/src/durable/room-state.ts` | 通常の凍結ラウンド列・自動次ラウンド・TTLを開催へ流用しない |
| `apps/worker/src/durable/room-object.ts` constructor / persistRoomRecord | DO保存・接続復元・重複排除の入口は維持し、開催用分岐を加える |
| `apps/worker/src/services/room-create.ts` | 現行POSTは通常modeとmax_playersを検証。別の開催作成入口で旧serverへの誤作成を防ぐ |
| `apps/client/src/services/source-submission.ts` | ActiveRoundContextが通常snapshotに依存。parserを変えず提出先contextを切り替える |
| `apps/client/src/services/result-archive.ts` | snapshotのローカル保存あり。開催は別schema/保存先にする |
| `apps/client/src/stores/room-store.ts`、`features/room/round-phase.ts` | 開催用store/viewへ分け、通常の結果表示タイマーを使わない |
| `apps/client/package.json` / `apps/worker/package.json` | test対象が列挙式。追加testはscriptsにも登録する |
| `apps/client/tsconfig.json` / root `tsconfig.json` | client単体は`.test.ts`除外。root typecheckを必須にする |

## 技術契約（Bで固定する実装方針）

### 1. 分離と再利用

- `RoomState`・通常`RoomSettings`・`ResultReadyPayload`の意味を変えない。`EventRoomSettings` / `EventRoomSnapshot` / `EventRoomAction` / `EventRoundResult`をsharedへ追加する。
- 開催識別は`room_kind: "HOST_EVENT"`。開催タイプは`event_type: "CASUAL" | "TOURNAMENT"`、Hostは`host_plays: boolean`。PRIVATE固定、上限20固定、`auto_match/auto_rematch`は受理しない。通常の`mode`へ開催タイプを押し込まない。
- 同じROOM_DO bindingを使い、DO入口で保存record種別を判定する。開催の純粋状態処理は`event-room-state.ts`、I/O/永続化/配信は`event-room-controller.ts`へ分離する。通常RoomStateMachineの内部を一般化する全面refactorはしない。
- `RoomDurableObject`のfetch / websocket message / close / alarm / restoreはrecord種別で一度だけ分岐。通常recordに種別がなければ従来経路。開催recordを通常hydrateへ渡さない。
- chart master、ExpectedKey、所持/解禁計算、既存source parser、既存のHTTP/CORS/WS envelopeの小さな共通機構を再利用する。未決契約を共通frameworkへ逃がさない。
- 専任Hostは接続セッションとして保持し、プレー参加者配列・source必須検証・所持集合・得点人数から外す。兼任Hostは同一IDで参加者にも登録する。

### 2. 状態・集合・世代

- 開催phaseは`LOBBY | PICKING | PLAYING | RESULT | CLOSED`。`PLAYING`の内部に`round_phase: "ACTIVE" | "RESULT"`を持ち、曲別結果はHostが進めるまで保持する。
- サーバーが`event_id`（開催開始時）、`round_id`（選曲確定ごと、無効化/選び直しでも再利用しない）、単調増加`revision`、既存のroom `generation`を発行する。
- 未開始LOBBYはevent_id=null。参加/Kick等の認可はroom_id/generation/接続で行い、開催開始後はevent_idも一致させる。
- 参加枠（connected/disconnected/left/kicked）、大会固定名簿/N、選曲条件集合、選曲確定時の準備対象、開始時のプレー対象は別の意味として保持する。UIの人数を単一配列長から推測しない。
- `pending_next`は選曲確定後の新規/明示退出復帰者。選曲確定前の入室/復帰は候補再計算、確定後は次の選曲まで待機。切断は枠とその曲の資格を保持する。
- 大会は開催時名簿以外の新規IDを拒否。Kick IDは開催終了まで保持し、同じIDの再入室・旧接続の操作を拒否する。
- 次曲選曲で準備をリセット。準備は確定譜面にだけ付与し、選び直しでround_idを破棄し準備をリセットする。
- 所持判定は接続中と切断中の在室参加者を含み、専任Host/明示退出/Kick/確定後の次曲待ちは除く。Leggendaria等の既存の「遊べる譜面」制約も維持する。source未検出は所持制約を緩める理由にしない。

| 操作/イベント | 前提 | 遷移・結果 |
| --- | --- | --- |
| 開催開始 | Host、LOBBY、プレー参加者1人以上 | event_id/大会名簿/N固定、PICKING |
| 選曲確定 | Host、PICKING、共通条件を満たす譜面 | round_id発行、準備対象固定。phaseはPICKING |
| 準備設定 | 現行接続、選曲確定済み、対象者 | 自分のreadyのみ変更 |
| プレー開始 | Host、PICKING、大会全対象者ready／合同ready1人以上 | PLAYING/ACTIVE、プレー対象と開始時刻固定 |
| 有効提出/スキップ | 現行接続、ACTIVE、開始時対象、未提出 | 内部確定。Host接続中かつ全員完了ならPLAYING/RESULT |
| 手動締切 | Host、ACTIVE | 未提出を欠場0/9999・0ptで確定、PLAYING/RESULT |
| 次曲 | Host、PLAYING/RESULT | 前曲の無効化可能IDを保持しPICKINGへ。新曲開始で前曲の変更をロック |
| 無効化 | Host、ACTIVE/曲別結果、または次曲開始前の直前確定曲 | 無効として集計を再計算。ACTIVE/曲別結果ならPICKINGへ。PICKINGの選曲・準備を無関係に壊さない |
| 開催終了 | Host、LOBBY/曲間、または明示終了確認済みACTIVE | ACTIVE曲は無効。確定曲のみ最終RESULT。0曲なら勝者なし |
| Host切断 | 開催中（LOBBY含む） | 元phaseを保持、deadline=切断検知時+300秒。提出以外の進行停止 |
| Host復帰 | now < deadline | 停止解除。ACTIVEで全員完了なら曲確定 |
| deadline到達 | now >= deadline | 未確定曲無効、終了理由HOST_DISCONNECTED、最終RESULT |
| 復元不能 | authoritative record不正/消失 | CLOSED / ROOM_STATE_LOST。自動再作成なし |

- 「全員完了」の集計は開始時プレー対象。参加待ちや大会の既存欠場者を待たない。スキップ/退出/Kickによる確定も含める。
- Host切断による停止が全員完了より優先。deadline到達と復帰が同時なら終了優先。無効化と次曲開始は受理順で一意に処理する。

### 3. HTTP / WS / 公開データ

- `GET /api/capabilities`を追加し`{host_event_protocol: 1}`を返す。新clientは404/不明/版不一致なら開催操作を無効にし、通常対戦を維持する。version文字列を架空の将来番号で固定せず、このprotocol版を互換境界にする。
- 開催作成は`POST /api/event-rooms`。`client_version`（既存最低版判定）と`host_event_protocol: 1`、Host ID/表示名、EventRoomSettingsを検証する。返却はroom_id / generation / PRIVATE参加コード / settings。絶対開催期限を意味するexpires_atは設けない。
- 入室は既存同様room_idとjoin_codeを使用する。UIでは開催招待情報として両方をコピー/入力できる。コードからの新規グローバル検索台帳は追加しない。
- 接続先は既存`/api/rooms/{room_id}/ws`。開催recordへの最初のメッセージは`EVENT_JOIN`、payloadにprotocol版・client_version・join_code・表示名・兼任/Clientのsource/所持情報を含める。roleはサーバーで決定する。専任Hostに架空sourceを要求しない。
- 旧`ROOM_JOIN`やSPECTATORは開催へ受理せず、更新/非対応理由のみ返す。snapshotは送らない。通常部屋にEVENT_JOINも拒否する。
- 開催用の新規message mapを追加し、通常snapshotを要求する`ROOM_JOIN_ACCEPTED/ROOM_UPDATED/RESULT_READY`を開催に送らない。通常の型に曖昧なoptionalを大量追加しない。
- `EVENT_ACTION` payloadはactionで判別するunion。全操作にrequest_id、generation、開催開始後event_id。曲操作はround_id、選曲/準備/開始は選曲対象の`selection_revision`も要求する。全体revisionとは別に、選曲/対象集合の変更だけで進め、他人の準備によって自分の準備要求を無効にしない。
- action一覧: `START_EVENT`、`CONFIRM_PICK {chart_key}`、`CANCEL_PICK`、`SET_READY {ready}`、`START_ROUND`、`SUBMIT {observed_key, metric_value, source_meta?}`、`SKIP`、`CLOSE_ROUND`、`NEXT_PICK`、`INVALIDATE_ROUND {target_round_id}`、`KICK {target_player_id}`、`LEAVE`、`END_EVENT`、`STATE_GET`、`RESULTS_GET {cursor?, limit}`。
- SET_READY/SUBMIT/SKIP/LEAVEは自分だけ、進行/KickはHostだけ。SUBMITは他者のready/提出でrevisionが進んでも有効なround_id・資格なら受理する（全体revision一致を提出の条件にしない）。STATE_GET/RESULTS_GETは現行の許可接続だけ。
- server→client: `EVENT_JOIN_ACCEPTED`、`EVENT_STATE`、`EVENT_ACTION_ACK`（request_idと適用revision）、`EVENT_RESULTS`、`EVENT_ERROR`。PING/PONGは既存の接続維持を再利用する。
- 公開snapshotはphase、対象譜面、名簿/状態、準備・提出状態、Host期限、最新公開結果/総合のみ。**進行中metric/source_metaはHostにも配信しない**。再接続snapshot・ACK・デバッグ表示にも混入させない。SUBMIT ACKは採否のみ。
- 結果は公開revision付き。曲別確定後は参加者全員へ結果を送る。無効化は対象結果の新revisionと再計算した総合を配信する。
- HISTORYの肥大化を毎回snapshot送信で増幅しない。live snapshotは現行曲と直前結果/集計、過去公開曲はRESULTS_GETで50曲ずつ取得する。公開revisionをcursorに含め、途中で無効化されたらcursor再同期。現在の未公開曲を返さない。
- 同じ曲を連続選択してもround_idは異なる。generation/event_id/round_id/expected_key/現在の接続/参加資格をserverが検証する。再送は同一client_msg_id/request_idで処理済み結果を返し二重加点しない。
- 参加者ID変更まで防ぐ本人認証を新設しない。Kickの保証範囲は同開催の同ID。セッション上のHost偽装や非現行socket操作は拒否する。
- `GET /api/rooms/{id}/charts`は開催の共通条件を適用し、確定時にも同じmasterで再検証する。公開ロビー/自動マッチ/公開share用情報へ開催を登録しない。

### 4. 集計・保存・復元

- 結果状態を`SUBMITTED | ABSENT`、欠場理由を`SKIP | DEADLINE | LEFT | KICKED | NOT_PRESENT`として開催契約で区別する。無効は曲の状態。合同プレーの待機者には偽の欠場結果を生成しない。
- SUBMITTEDは選択指標のmetric_valueを保存。別指標がsourceにないことを0等で補わない。ABSENTはscore=0、misscount=9999、rank=null、大会points=0。
- 有効提出者の競技順位を付け、同値なら同順位、次順位は飛ばす。大会pt=N-rank+1、合同にはpt/総合データを生成しない。N=4で2人提出なら1位4pt/2位3pt、欠場2人は0pt。
- 大会総合は無効でない確定曲だけから算出。結果revision更新で差分加点を重ねず再集計し、同総合点は同順位。全曲無効/0曲は優勝者なし。
- DOには開催record（schema_version=1、room_kind固定）と曲ID単位の提出/公開結果を保存する。進行状態・結果・idempotencyは同じ確定境界で保存してからACK/通知する。保存失敗時は成功を通知せず復元可能状態へ戻す。
- 復元はrecordのschema/種別を検証してから接続を再関連付け、絶対Host期限を評価する。alarm/再起動で300秒をリセットしない。古い通常recordのhydrateとalarmは従来のまま。
- 作成直後にHostが一度も接続しない場合も、作成時刻+300秒を初回接続期限として保存・回収する。最初の接続で解除し、以後は切断検知からの期限を使用する。Hostなしの孤立recordを無期限保持しない。
- 使用したROOM_DOに新binding/migrationを追加しない。通常recordと開催recordの保存keyを区別し、ロールバックした通常処理が開催を正常な通常部屋として復元しない。
- 終了済み開催は進行なし、既存終了ルーム回収と同等の有限保持にする。計画値は終了から30分後に接続を閉じ、開催record/曲記録/重複排除を削除する。これは開催中の30分TTLではない。回収前も新規参加は不可、既存参加者は最終結果同期のみ可能（Kick除く）。
- Client保存は開催用JSON schema_version=1。Tauriのapp data配下`event-results/<event_id>.json`、ブラウザは開催専用storage key。通常archive/statistics/自己ベストへ流さない。
- 最小保存項目はIssue§9。公開曲の更新/無効化/最終確定でupsertし、受信revisionと最終同期済み曲数を保存。最終結果・全公開曲が揃うまでpartial。途中退出/Kickは受信分を残す。
- 専任Hostも保存する。新clientは旧履歴を維持し、未知開催schemaは原本保持+読めない旨を表示。通常履歴のschemaを今回の開催用に上書きしない。

### 5. Client / source / UI

- `event-room-store.ts` / `event-ws-client.ts`に開催接続状態を持ち、通常roomStoreと同時参加しない。自分の通常/開催いずれかへの参加中はもう一方の参加を無効にする。
- LobbyPageから開催作成/参加へ進む。AppとSidebarからEventRoomPage / EventHistoryPageへ接続する。既存RoomArena/RoomBPLの多人数化はしない。
- `source-submission.ts`のparser/matchingを再実装せず、対象context（通常/開催）を切り替える最小adapterを設ける。開催のACTIVE・自分の資格・未提出を確認し、sourceの新着結果だけ送る。通常のnotebook再送防止、expected_key照合、異常通知を維持する。
- 新曲開始/再接続で監視済み結果を新しいプレーとして再送しない。端末の判定だけで安全扱いせずserver側のround/資格検証と組み合わせる。
- 準備/開始はsource parser成功とは別。読み取り不能な参加者にも既存のsource異常表示とスキップ操作を提供する。
- UI sourceはIssue§10。Host一覧、Client上位3人+前後2人、重複行除外、全順位、薄い最大人数、次曲待ち、0人、欠場理由、Host復帰待ちの表示を検証する。
- UIはserver phase/revisionに従う。操作要求中は二重クリックを抑止し、失敗時は理由と最新状態を表示する。曲別結果で秒数を理由に次曲へ飛ばさない。

## Bounded task breakdown / ownership / dependency

下表と共通packet契約で委譲必須項目を定義する。ファイル名の「新規」は計画パスであり、現在存在すると主張しない。

### 全packet共通の委譲契約

- task label: 下記P0〜P7。
- objective / success criteria / in-scope files/layer / validation: 各packet記載。
- non-goals: 本書の非目的、担当外packet、Issueの製品仕様再定義。
- forbidden scope: 他ownerのファイル、無関係整形/依存追加/lockfile更新、承認前deploy/merge、通常対戦のルール変更。
- allowed side effects: **C実施許可・Kickoff後のみ**、担当pathとその隣接testの変更、ローカル検証生成物。P0は規範文書のみ。監査packetはread-only。
- expected output: COMPLETE/BLOCKED/ESCALATION、変更path、AC対応、検証結果/未実施、findingsのdisposition、残余リスク。UIは参照source・反映差分・確認証拠も返す。
- continue-without-escalation boundary: 指定した契約内の局所的内部構造/命名調整と担当testの修正は自走可能。公開type/message名の変更はconsumerを同期して監査へ戻す。
- escalation: 外部動作の変更、担当外write、新しい依存/Cloudflare resource、互換方針変更、データ消失リスク、視覚正本の参照不能、Blocker/Must fixが仕様変更なしで解消できない場合は停止して親へ返す。
- 1 write scope = 1 owner。他者の編集を戻さず、同一ownerの次packetは前packet完了後に実施する。親は実装委譲中に同じpathを編集しない。takeoverは停止・再割当の宣言後のみ。

### P0 — 規範同期（先行ゲート）
- owner: 親（実装委譲前の文書専任）。objective: #188と本計画の契約を規範へ同期。
- files: `docs/design/01_fsm.md`, `02_ws_protocol.md`, `03_data_model.md`, `05_screen_list.md`, `06_source_io_spec.md`, `07_constants.md`, `10_regression_guard_addendum.md`。
- success criteria: 開催例外と通常ルールが混同されず、message/保存/無効化境界/互換表/画面sourceが記載済み。
- validation: `npm run check:design-contracts`、#188全AC照合、contract-auditorのread-only事前確認。validatorの既存判定を消して通さない。
- dependency: C許可・Kickoff後の最初。P1以降はP0の契約チェック完了まで開始不可。

### P1 — shared契約
- owner: server-implementer（sharedを含む明示ownership）。objective: 上記の開催型・protocol定数・message mapsを加法追加。
- files: 新規`packages/shared/src/models/host-event.ts`, `ws/host-event.ts`, `constants/host-event.ts`、既存各`index.ts`、`ws/message-types.ts`と必要なmap/guards。
- success criteria: 通常APIのtype/enum互換を維持し、イベントの判別union、公開/非公開結果型を分離。旧envelopeとのconsumer coverageが取れている。
- validation: root typecheck/lint、追加契約fixtureはP2のcontract-guards testに登録。通常shared利用者のbuildを確認。
- dependency: P0。P2とP4へ型契約を引き渡し。引渡し後shared変更は両consumerへ通知し同期する。

### P2 — 開催状態機械・配点・対象集合
- owner: server-implementer。objective: I/Oから独立した決定的開催状態処理を実装。
- files: 新規`apps/worker/src/durable/event-room-state.ts`, `event-room-state.test.mjs`、`durable/contract-guards.test.mjs`、`apps/worker/package.json`のtest対象追加。
- success criteria: 状態表、対象集合、N固定、0人、順位/欠場、無効化、再接続/Host期限を時刻引数付きで検証可能。
- validation: `npm run test:worker`に新testを含める。SCORE/MISSCOUNT、同点、N=4欠場、20人、期限境界/無効化境界を確認。
- dependency: P1。外部I/Oや通常room-stateの全面変更はしない。

### P3 — Workerの接続・永続化・互換
- owner: server-implementer（P2と同一owner、逐次）。objective: 開催処理を既存ROOM_DOへ接続。
- files: 新規`durable/event-room-controller.ts`とtest、`routes/event-rooms.ts`、`routes/capabilities.ts`とtest、`services/event-room-create.ts`、既存`index.ts`, `durable/room-object.ts`, `services/room-do.ts`, `routes/rooms.ts`, `types/api.ts`, `types/env.ts`、関連worker testsとpackage.json。
- success criteria: 新旧互換、role/接続認可、score非公開、保存後配信、期限復元、30分後の終了record回収、lobby非掲載が成立。
- validation: route/DOの偽socket+永続storage試験、並行提出/締切/無効化、破損record、disconnect alarm、旧ROOM_JOIN拒否/通常非回帰。`npx wrangler deploy --dry-run`も必須。
- dependency: P2。既存ROOM_DO bindingを使う。wrangler resource/migrationの追加が必要ならESCALATION。

### P4 — Client接続・提出・履歴
- owner: front-implementer。objective: 開催のserver stateとsource入力、ローカル履歴を接続。
- files: 新規`stores/event-room-store.ts`, `services/event-ws-client.ts`, `services/event-history.ts`とtest、既存`services/worker-api-client.ts`, `source-submission.ts`, `tauri-bridge.ts`、必要なsource呼出元。Tauriは新規`commands/event_result.rs`、既存`commands/mod.rs`, `lib.rs`の登録のみ。
- success criteria: 通常/開催の排他接続、再送/同期/partial履歴、旧server無効化、専任Hostのsource不要、通常統計へ不流入。
- validation: protocol fixture、保存schemaと部分/完全判定、各sourceの結果adapter、通常stats test、Rust保存先test/cargo check。新testはapps/client/package.jsonへ登録（P5まで同一owner）。
- dependency: P1の固定型。P3を待たずmock実装可能だが、完了にはP3統合が必要。P3とP4はファイルownershipが分離するため並列可能。

### P5 — Host/Client画面
- owner: front-implementer（P4と同一owner、逐次）。objective: Issue§10の配置と操作を描画する。
- files: 新規`pages/EventRoomPage.tsx`, `pages/EventHistoryPage.tsx`, `features/event/*`、既存`pages/LobbyPage.tsx`, `app/App.tsx`, `components/AppSidebar.tsx`, `styles.css`の必要部分、`dev/visual-scenarios.ts`とtest、apps/client/package.json。
- success criteria: 専任/兼任、20人、0人、次曲待ち、切断/欠場/同点の見え方とHost操作が正本に一致。通常RoomArena/BPLを不要に書き換えない。
- validation: component状態/操作権限テスト、既存client test、ブラウザvisual QA。実施時にfrontend-testing-debugging skillと利用可能Browserを選び、画面証拠を残す。
- dependency: P4。見た目だけ完成してserverとの提出/確定が未接続ならCOMPLETE不可。

### P6 — 統合・回帰検証
- owner: front-implementer（client harness / scripts）、server修正はserver-implementerへ返す。objective: 20人を含むフル進行を再現する。
- files: `apps/client/src/services/e2e-scenario-runner.ts`, `services/e2e-observability.ts`, `scripts/run-local-e2e.ps1`, `scripts/start-local-two-clients.ps1`、必要な新規開催E2E script、`testdata/e2e/`の人工fixture、`.github/workflows/validate-reusable.yml`のclient test呼出し追加。
- success criteria: 下記V1〜V9の証拠が揃い、client新testがCIに含まれる。20 Tauriプロセス起動は要求せず、2実クライアント+20接続DO統合試験を併用する。
- validation: CI full相当+実クライアント合同/大会各2曲+DO20人（兼任/専任含む）。通常ARENA/BPL/BPL4、既存混在source再戦も確認。
- dependency: P3/P5。通常の2client scriptを必要なく汎用化せず、新開催シナリオは分離する。

### P7 — 独立監査と指摘解消
- owner: contract-auditor / implementation-auditor（両方read-only）。objective: 契約整合と振る舞い/UI・検証不足を独立判定。
- files/layer: P0〜P6全差分、#188、本計画、テスト証拠。
- success criteria: finding → disposition → evidence → remaining riskを追跡。未処理Blockerなし、Must fixは解消またはユーザーの明示再scopeあり。
- validation: contractはINV-01〜09・新旧consumer・非公開score・復元を中心に、implementationは状態遷移/操作/回帰/画面を中心に確認。修正は該当ownerへ戻して関連検証を再実施。
- dependency: P0後の契約確認、P6後の最終監査。監査を実装担当の自己確認で代替しない。

### 依存順・将来の委譲形状

`P0 → 契約確認 → P1 → {P2→P3, P4→P5} → P6 → P7`

- `delegation execution plan`（Cの予定）: server-implementer=P1/P2/P3、front-implementer=P4/P5/P6、contract-auditor=P0後/P7、implementation-auditor=P7。
- 親=P0とread-only統合・監査調整。sharedはserverだけがwrite、frontからの契約変更要望はserverへ戻す。package.jsonはworkspaceごとのowner、CIはP6のfront。
- C時に実際のagent id/status/ownershipを記録する。本表はspawn済みの記録ではない。

## 検証マトリクスと受入条件の追跡

| ID | #188の受入条件群 | 必須証拠 / owner |
| --- | --- | --- |
| V1 | 開催タイプ・20人・専任/兼任・通常非回帰 | P2の人数/名簿、P3の20接続+Host、P6通常対戦 |
| V2 | 所持集合・準備・途中参加/復帰・0人 | P2の選曲前後/退出/Kick/切断、P5人数表示、P6実クライアント |
| V3 | 自動結果/手動締切・遅延/重複・権限 | P3の受理順・stale接続・round違い、P4 source再送 |
| V4 | 配点・同点・欠場・無効化・終了 | P2の数値例と境界、P4の再同期、P5結果表示 |
| V5 | Host300秒・既存TTL除外・復元不能 | P2 fake clock、P3 durable restore/alarm/STATE_LOST、P6切断 |
| V6 | score一斉公開・旧client/server互換 | P3全message/再join/履歴ページ漏洩否定、P4 capabilities |
| V7 | 開催履歴・partial・通常成績分離 | P4 schema/保存/更新/未知版、通常stats回帰、P6Tauri |
| V8 | §10 UI source準拠 | P5 Host/ClientのPICKING/ACTIVE/曲別/最終、20人・0人・切断・欠場の画像と操作証拠 |
| V9 | 規範同期・独立監査 | P0 check:design-contracts、P7両監査、全finding disposition |

### Cの最低コマンド面（現在は実行しない）

CIの正本は`.github/workflows/validate-reusable.yml`。PR quickより広いfull相当を最終統合で要求する。

- `npm run check:agents`
- `npm run check:design-contracts`
- `npm run lint`
- `npm run typecheck`（root。client単体typecheckでは`.test.ts`が除外される）
- `npm run build:client`
- `npm run test:client-stats`
- `npm run test:worker`（新規開催testsをworkspace scriptに追加）
- `npm --workspace @infinitas/client run test`（新testsを追加し、P6でCIからも呼ぶ。現CIはstatsだけでこのscriptを呼んでいない）
- `cargo check --manifest-path apps/client/src-tauri/Cargo.toml`、保存commandに対応するRust tests。
- `npx wrangler deploy --dry-run`（cwd `apps/worker`）。deploy実行ではない。
- `pwsh -File scripts/run-local-e2e.ps1 -Scenario reflux-reflux-full -MatchCount 2`
- `pwsh -File scripts/run-local-e2e.ps1 -Scenario mixed-daken-v3-notebook`
- P6で追加する開催合同/大会シナリオは上記と別実行し、20接続DO試験と併記する。
- sourceはinf-notebook / daken_counter_v3 / refluxでSCORE/MISSCOUNTを確認。legacy parserの直接変更は非目標、共有adapter経由のlegacy回帰が必要なら既存fixtureで確認する。
- frontend画像・実入力は生成物として扱い、Gitへ混ぜない。画像正本を確認できない場合はvisual COMPLETEを返さない。

### 今回Bの検証

- 実コード/CI/tsconfig/規範と計画path・責任を照合。
- #188全ACをV1〜V9へ対応付け、phase ceiling、packetの必須field、write ownershipを確認。
- taskをUTF-8 no BOM/LFで保存し、`git diff --check`と未追跡ファイルのencodingを確認。Issueを更新した場合はread-back一致を確認。
- 製品コード/依存/規範docsを変えないためbuild/lint/testは今回実行対象外。上記C検証は未実施であり、実装動作・性能の証明はまだない。

## Commit / PR分割案・rollback・Replan Gate

- 将来の作業branchは`codex/issue-188-host-event-mode`、baseはv1。今回はbranch作成・commitしない。
- logical commits: (1)P0規範、(2)P1契約、(3)P2状態/テスト、(4)P3通信/復元/テスト、(5)P4提出/履歴、(6)P5画面、(7)P6統合/CI、(8)監査修正を責任別。
- 既定は#188に紐づく1統合PR。中間commitを個別に本番展開しない。PR分割が必要になっても共有契約だけを互換未確認で公開せず、READYな縦断単位か機能非公開で分割する。
- 新規依存・D1/KV/DO binding追加・Cloudflare移行は計画しない。変更が必要ならReplan。
- rolloutは新server→対応client。互換の切り分けはprotocol=1、通常clientの最低対応版をこの機能だけの理由で上げない。新clientだけ先に配布されても旧serverでは開催が無効になる。
- rollbackは新規開催作成/入室の受付停止を先に行い、既存開催の終了/保存を待つ。旧serverは開催recordを理解しないため、活動中の開催を残した無条件server rollbackは禁止。既存開催を保護できない場合はESCALATION。
- 受付停止はWorkerの追加設定`HOST_EVENT_ACCEPT_NEW`で行う（未指定/falseは停止、公開時true）。capabilitiesは受付可否も返す。停止しても既存開催への名簿内参加者・在室者の復帰とHostの進行は許可し、結果を回収できるようにする。binding/migrationや通常最低対応版は変更しない。
- 完了した開催の端末JSONは残し、通常履歴を巻き戻さない。開発段階のrevertは本taskに属する差分だけを対象とする。
- Replan条件: 仕様の追加判断が必要、独立record方式では既存DO復元を維持できない、schema/権限変更が計画を超える、監査のBlocker/Must fix解消に外部動作変更が必要、20人時の機能成立が確認不能、source正本を確認できない。
- BとCの境界を維持する。C依頼時は正本Issueの更新・base差分・モデル設定を再確認し、固定済みのユーザー仕様を勝手に再質問/変更しない。

## B判定 / Cへの引継ぎ

- **B planning status: READY** — 契約、packet、所有、依存、検証、rollbackを具体化済み。製品完了ではない。
- **C Kickoff status: NOT_READY（未実施）**。
- **Execution environment: ESCALATION** — 必須委譲の既定model `gpt-5.6`が起動不可。今回の範囲で設定を変更していない。後続で使用可能モデルの明示指定または承認された設定修正が必要。
- この制約を無視してnon-spawn実装へ進まない。モデル問題を解決しても、このturnではCを開始しない。
- 未実施: P0〜P7の全実装、規範改訂、runtime tests、visual QA、独立実装監査、commit/PR/deploy。

## C Kickoff execution record（2026-09-07）

- **C Kickoff status: READY**
- Source of truth: Issue #188 / 本計画書。base=`v1`、開始commit=`0a44dfc399591003e0bd6481f6d67cc3c2930806`。
- Execution profile re-judgment: `High-Risk`。contract-sensitive=yes。
- Plan Mode: YES（A合意とBのREADY計画を実行ゲートとして使用）。
- Current request boundary: `implementation-ready`。P0〜P7、規範同期、製品実装、検証、独立監査、指摘対応を許可。commit/push/PR/merge/Issue close/deploy/releaseは禁止。
- Implementation authorization: YES。依存順 `P0 -> 契約確認 -> P1 -> {P2/P3, P4/P5} -> P6 -> P7` は維持。
- Spawn Gate result: SATISFIED。必須4roleをすべて明示model `gpt-5.6-sol` で起動し、監査roleはread-onlyで実装roleから独立。

### delegation execution record

| role | agent ID | model / thinking | ownership | spawned |
| --- | --- | --- | --- | --- |
| `server-implementer` | `/root/server_implementer_188` | `gpt-5.6-sol` / `medium` | P1 `packages/shared/**`、P2/P3 `apps/worker/**` | yes |
| `front-implementer` | `/root/front_implementer_188` | `gpt-5.6-sol` / `medium` | P4/P5 `apps/client/**`、P6の指定scripts/testdata/CI | yes |
| `contract-auditor` | `/root/contract_auditor_188` | `gpt-5.6-sol` / `high` | read-only。P0後確認/P7 | yes |
| `implementation-auditor` | `/root/implementation_auditor_188` | `gpt-5.6-sol` / `high` | read-only。V1〜V9/P7 | yes |

- 親ownership: P0の規範docsとread-only統合・監査調整。委譲中は各implementerのwrite scopeを変更しない。
- Replan triggers: 仕様の追加判断、外部動作/互換方針変更、新規依存/Cloudflare resource、データ消失リスク、20人時の成立不能、UI正本参照不能、計画外変更なしで解消できないBlocker/Must fix。

### C中の仕様確認

- `event_name`の入力契約はユーザー確認により通常`ROOM COMMENT`と同一とする: 空欄可、最大80文字、改行不可、保存時の暗黙trimなし。表示時にtrim後が空なら開催タイプ＋プレースタイルの規定名へフォールバックする。

## C completion record（2026-09-14）

- **Phase C status: COMPLETE**。P0〜P7を依存順に実施し、最終契約監査・独立実装監査はいずれもPASS。未解消Blocker/Must fixは0件。
- 利用上限による中断後も同じwrite ownershipを維持して再開した。実装を担当したreplacement agentは`/root/server_implementer_188_retry`（P1〜P3、shared/worker）と`/root/front_implementer_188_retry`（P4〜P6、client/scripts/testdata/CI）。最終read-only監査は`/root/contract_auditor_188_retry`と`/root/implementation_auditor_188_retry`。全agentは明示model `gpt-5.6-sol`、implementer=`medium`、auditor=`high`。
- 主な監査findingは、Host alarm失敗時の絶対deadline・通知、開始前Kick/event_id境界、未ACK SUBMIT/LEAVE replay、履歴runtime検証、招待導線、source障害表示、UI action gate、public_result hydrate整合、actual Host再接続、mobile overflow、V8 edge-state画像。各ownerが修正し、再監査でCLOSEDを確認。
- V1〜V9: PASS。Host Event統合4 scenario、専任Host+20人/兼任Host+19人、CASUAL/TOURNAMENT実Tauri各2曲（Host切断・約4秒後再JOIN・次曲・履歴reload）、通常ARENA/BPL/BPL4、mixed source回帰を確認。visualは実TauriとCDP 5 scenario×desktop/mobileでrole/phase・必須文言・横overflowなしを確認。
- 最終ローカル検証: `check:agents`、`check:design-contracts`、lint、root typecheck、client build、client stats、client 121/121、worker 156/156、Host Event integration 4/4、Cargo check、Rust 19/19、Wrangler dry-run、`git diff --check`、UTF-8 no BOM検査をPASS。
- 実行証拠: `testdata/runtime/e2e/host-event-casual-20260914-170443/artifacts`、`testdata/runtime/e2e/host-event-tournament-20260914-110617/artifacts`、`testdata/runtime/e2e/reflux-reflux-full-20260910-154623/artifacts`、`testdata/runtime/e2e/host-event-visual-cdp-20260914-fixed-invariants`。
- 残余Should: hosted CIはcommit/push/PR禁止のため未実施。`target-e2e/`約6.6GBは生成物だが環境policyにより削除拒否され未追跡で残存。`restoreLost`後の破損recordの隔離・保持期限・cleanup方針は仕様未確定のため変更せず、後続判断事項として残す。
- commit、push、PR、merge、Issue close、deploy、releaseは実施していない。
