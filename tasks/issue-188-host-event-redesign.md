# Issue #188 再設計 — Phase B実行計画

## 目的・完了条件・現在の境界

- task label: `#188-host-event-redesign`。
- objective: 合意したHost進行体験を、既存PR #189の資産を評価したうえで、追加解釈なしに委譲できる契約・作業範囲・依存順・検証へ分解する。
- success criteria: 新旧差分、再利用判断、互換方針、各packetのowner/完了条件/停止条件、localとCIの検証面、監査とReplan条件が具体化される。
- Stage / terminal phase / current request ceiling: **Phase B / planning-only**。
- allowed outputs now: 新しいtaskと必要な計画補助資料、read-onlyのコード/PR/試作調査、既存検証の再実行と証拠整理。
- allowed side effects now: 本文と計画補助資料の未commit保存。既存の未追跡`docs/ux/`、`target-e2e/`を保持する。
- forbidden outputs now: **C Kickoff、製品実装、commit/push、GitHub更新、PR更新/close/merge、deploy、旧コードの削除/revert**。既存Phase A資料・旧task・製品規範は変更しない。
- stop condition: B readinessと残余リスクを報告して停止。計画内の将来作業を同ターンで実施しない。
- next unlock condition: ユーザーによるPhase C開始の明示許可。その後、本taskを正本としてC Kickoff・必須委譲を完了する。C開始許可をdeploy/PR操作等の許可へ自動拡張しない。
- Implementation authorization: **NO**。以下のpacket・commit・rolloutは将来の計画。
- non-goals: 通常ARENA/BPL/BPL4の仕様変更、公開募集/観戦/Host交代、20人超、認証BAN、クラウド履歴、終了後編集、ゲーム重畳表示、厳密同時開始、招待文一括貼り付け、音声通知の必須化。

## Entry Protocolと正本

- execution profile: **High-Risk**。client/worker/shared横断、DO FSM/authority、WS schema、snapshot/履歴互換に影響する。
- contract-sensitive: **yes**。通常`RoomState/CloseReason/SourceType`の意味は維持するが、開催専用契約はbreaking変更を含む。
- Plan Mode requirement: **required**。本taskが実装前の計画成果物。対話モードを切り替えたという意味ではない。
- 適用規約: root `AGENTS.md` / `WORKFLOW.md` / `QUALITY.md`、`apps/client/AGENTS.md` / `apps/worker/AGENTS.md` / `packages/shared/AGENTS.md`。
- 適用skill: `plan-mode-gate`、`quality-check-matrix`、`windows-utf8-safe-write`。skillは分類・検証・書式の参照であり実装許可ではない。
- Spawn Gate: Cでは`front-implementer`、`server-implementer`、`contract-auditor`、`implementation-auditor`が必須。本書の将来委譲表は**delegation execution plan**でありCの実行recordではない。
- sticky model constraint: ユーザー指定**gpt-6.1-sol**。`.codex/config.toml`の旧既定モデルを新仕様の品質根拠にせず、設定変更も行わない。後続spawnでも明示指定を持ち越す。

仕様の正本は`docs/ux/issue-188-redesign/issue-188-draft.md`。`handoff.md`、`phase-a-review.md`、`prototype-review.md`、`validation.md`を合意と視覚証拠として参照する。Phase A資料のA-only境界は当時の記録であり、今回の明示指示によってBのみ解禁された。旧GitHub #188のFixed decisions §1–9は、新原稿が「維持」とした規則だけの参照元とする。

合意した試作原本は`C:/Users/tts13/.codex/visualizations/2026/10/04/01a105aa-dfe2-7d82-a3ae-e34f7aeb6247/event-host-led-prototype.html`、previewは同ディレクトリの`event-host-led-preview.html`、確認URLは`http://127.0.0.1:18988/event-host-led-preview.html`。通常対戦画像は同ディレクトリ`evidence-arena/normal-arena-*.png`。URL生存に依存せず原本を保持する。

調査基点: 2026-10-04 JST、local HEAD / PR #189 headとも`90856a42d9e199b49d97966e1dd620e6b626b5dd`、branch `codex/issue-188-host-event-mode`。GitHub read-only確認でPR #189はOPEN/未merge、base `v1` / `0a44dfc399591003e0bd6481f6d67cc3c2930806`、87 files、+8425/-112。基点固定は最新v1への同期や本番配置確認を意味しない。

旧`tasks/issue-188-host-event-mode.md`のB READY、旧C記録、PRの試験PASSは旧仕様の実施記録として保持し、今回のB READYや新製品PASSの根拠へ転用しない。

Bの実際の委譲記録、GitHub read-back、採用試作の実閲覧・クリック・狭幅配置確認、baseline検証は`docs/ux/issue-188-redesign/phase-b-evidence.md`。独立契約調査は同ディレクトリ`phase-b-contract-review.md`。計画担当は親から分割済みの計画作業を担当し再委譲していない（No-delegate reason: ownershipが確定した1文書の作成であり再分割不要）。C必須委譲の完了記録とは区別する。

## 新旧差分と再利用判断

再利用の既定方針は**既存分離構造を保ち、必要部分を修正する**。PR全体の破棄・書き直しは計画しない。コードの責務分離、契約整合、実際の検証に基づく判断であり、モデル世代を根拠にしない。

| 領域・コード証拠 | 判断 | 新設計への作業と検証上の限界 |
| --- | --- | --- |
| `event-room-state.ts` / `event-room-controller.ts` / `room-object.ts` | 分離構造・通常room分岐を再利用 | 開催の純粋FSMとI/O、保存後ACK、session置換、alarm/復元を保つ。`startRound`はready集合を使うため変更必須 |
| shared `models/host-event.ts`、`ws/host-event.ts` | 型の構成を修正して再利用 | participants必須`ready`と`SET_READY`を撤去し、protocol/snapshot版を明示。通常message mapは意味維持 |
| DOの順位/総合/無効化/期限/idempotency | 再利用 | N−rank+1、同点1/1/3、欠場0/9999、Host300秒、受理順、公開前保存のテスト資産がある。開始集合変更後の組合せ再検証は必須 |
| `event-room-state.ts`のdisconnect/reconnect/selectionParticipants | 再利用＋境界検証 | 切断は枠を残し、LEFT復帰だけpending_next。合同のready選別を除き、切断者も対象に含める。固定Nと選曲集合を混同しない |
| routes/servicesのcapabilities・作成・ROOM_DO | 再利用＋版更新 | protocol1のliteral/checkを2へ同期。開催ID＋コード、PRIVATE、受付停止、公開ロビー非掲載を維持。新検索台帳/binding不要 |
| `event-ws-client.ts` / `event-room-store.ts` | 再利用＋契約修正 | reconnect、request再送、ACKとpending、RESULTS paging/resyncを残す。`setReady`とliteral1を修正。public snapshot以外を提出済み根拠にしない |
| `source-submission.ts` / `source-observation.ts` / `event-notebook-replay.ts` | 再利用 | ACTIVE＋対象＋初回有効提出とexpected_key、古いnotebookの再送防止を維持。READYなしで連続2曲・同曲再選曲・復帰を追加検証 |
| `event-history.ts` / `event-results-sync.ts` / Tauri `event_result.rs` | 保存機構を再利用、schema修正 | `isParticipant`が必須readyを要求しlive型と直結。history1のまま削除できない。history2とv1読取adapterへ分離。原本保持と完全/部分を検証 |
| `participation-mode.ts` / join-policy / event-name / HostInvite | 再利用 | 通常/開催排他、専任source不要、空欄可80文字/no newline/no trim、ID＋コードは合意と一致。ページ移動で排他を解除しない |
| `LobbyPage.tsx` / `AppSidebar.tsx` / `app/App.tsx` | 開催導線を組み替える | Topから開催操作を専用ページへ移す。AppのeventSnapshot effectによる強制event-room表示は「戻る」導線と矛盾するので限定する |
| `EventCreateModal.tsx` | 入力/検証を再利用、ページへcompose | 専用入口→作成/参加個別ページ。モーダルの見た目をそのまま正本としない |
| `EventRoomPage.tsx` / event-presentation / FinalReview / EventHistory | view-modelと一部内容を再利用、配置は改修 | ready帯/未準備除外/旧左右配置/確認なし無効化を変更。順位抽出ロジック等は生かす。通常RoomArena/BPLを多人数化しない |
| `event-visual-scenarios.*` / integration / E2E runner / capture script | harnessを再利用、旧oracleを置換 | SET_READY送信・ready人数assertを新参加対象へ修正。通常のroom Readyまで消さない。旧PASSは新ACの証明ではない |

現在HEADで親が再実行したbaseline: client unit **121/121 PASS**、worker **156/156 PASS**、Host Event integration **4/4 PASS**、root `npm run typecheck` **PASS**、`npm run lint` **PASS（warning 0）**、`npm run build:client` **PASS**。これは旧動作の再現可能性の証拠。integration helperにも旧Ready操作がある。buildのBrowserslistデータ更新noticeを依存更新理由にはしない。Wrangler bundle、Rust、製品の新仕様E2Eは本Bでは未実行。既存試験が通ることだけで再利用部の新契約適合を宣言しない。

## Bで固定する技術方針

### 参加集合と開始

1. 開催開始はLOBBY、Host接続、在室プレー参加者1人以上。大会名簿とNをこの時点で固定。曲開始とは別。
2. 選曲確定時のeligible集合を凍結。確定前入室は共通条件再計算、確定後入室/明示退出後復帰はpending_next。一時切断はpending_nextへ変更しない。専任Host、LEFT/KICKED、次曲待ちは共通条件から除く。
3. 当該曲の開始対象は、凍結eligibleのうちLEFT/KICKED/次曲待ちを除いた在室者。CONNECTED/DISCONNECTEDを両方含む。休憩は通話の申告であり製品状態を追加しない。
4. `START_ROUND`条件はHost接続中、PICKING、確定譜面/正しいround_id・selection_revision、当該曲対象1人以上。readyは一切条件にしない。合同は全対象者をplayingへ。大会は固定名簿/Nを維持し、名簿上LEFT/KICKED/復帰待ちは既存NOT_PRESENT欠場規則を維持する。大会の名簿だけ存在して在室対象0人なら開始不可。
5. snapshotに`current_eligible_player_ids: string[]`を追加し、確定前/現在曲なしは`[]`、確定後は開始可能な対象集合をserverが投影する。UIは接続人数・当該曲対象・次曲待ちを分け、固定名簿や全participants配列長から開始可能人数を推測しない。プレー後の受付資格は`current_playing_player_ids`とround_statusを正とする。
6. 休憩/切断でも未提出を自動欠場にしない。14/15提出で待ち、Host締切時だけ残り1人をDEADLINE欠場。SCORE/MISSCOUNT値・大会0pt、固定Nは維持。締切前一時復帰は初回提出可、締切後不可。次曲も枠を残す。

### 契約・永続化・履歴互換

- `HOST_EVENT_PROTOCOL=2`。Ready廃止とSTART_ROUND意味変更はbreaking。`EVENT_JOIN`、作成request、capabilities、client支持判定を同時に2へ同期し、protocol1を新方式へ黙って受理しない。通常protocol/最低client版を開催変更だけの理由で変更しない。
- live `EventRoomSnapshot.schema_version=2`、開催DO record schema2。`ready`と`SET_READY`を新契約から除く。`selection_revision/generation/event_id/round_id`、expected_key、最初の有効提出、Host権限、idempotencyは維持。通常保存record/keyは維持。
- 新server/旧event-client、旧server/新event-clientは開催だけfail-closed。404/未知protocol/版不一致を「更新必要・開催受付不可」と示し、通常対戦の可否を別に表示する。未知snapshotを新方式でrenderしない。
- **schema1稼働開催をschema2へ自動変換しない**。旧合同のplaying集合を拡張すると遡及参加になる。旧recordのround/名簿/N/期限を勝手に変更しない。schema1を空開催としてhydrateしない。未対応/不正recordは既存ROOM_STATE_LOST境界でfail-closed、原recordを保持し、隔離/cleanup仕様を新設しない。
- 公開時は旧runtimeで受付停止→既存開催の終了と最終履歴回収→既存terminal retention（1800秒）満了と通常cleanup→復元可能schema1 record/旧接続なし（activeだけでなく生存terminalもなし）の証拠→新server/clientを切替→検証後新規受付、というdrain方式。製品TTLを短縮したりrecordを手動削除したりしない。PR未mergeは本番にschema1が存在しない証明にはならない。調査不能/旧record・接続ありなら**公開を停止**。legacy結果read adapterを代案にする場合はReplan。この公開ゲートはCコード作成ゲートとは別であり、本Bで実行しない。
- 既存`HOST_EVENT_ACCEPT_NEW`は新規作成/新ID入室停止、既存Host/participant復帰・進行・回収維持。Cloudflare binding/migration/resource追加なし。必要になったらReplan。
- 開催履歴は**schema2**とhistory専用participant DTOへ変更し、live snapshot型への直接依存を解く。新v2からreadyを消す。v1は専用validator/読取adapterで対応し、保存済みplaying集合、順位/pt、無効、完全/部分をそのまま読む。readyは表示・計算に使用しない。
- v1 JSON/storage原本を保持し、v1読込だけで上書きしない。v2保存keyは`infinitas.client.event-results.v2`、JSONは既存directory内`event-results/<sanitized_event_id>.v2.json`、旧v1 key/`<id>.json`は保持する。event_idとschemaで重複表示を整理し、同event_idで読めるv2があれば一覧はv2を優先（旧原本は保持）。現行の履歴一覧はTauriでもWebView localStorageを読み、RustはJSON保存のみを担う。v1/v2両storage keyを読取り、Tauri再起動後の一覧とv2 JSON保存を検証する。JSONディレクトリを新たに自動走査する機能は追加しない。未知schemaは原本保持＋読めない表示、通常履歴/statistics/自己ベストは変更しない。
- 未公開metric/source_metaはHostにもsnapshot/ACK/reconnect/RESULTS_GETから漏らさない。公開結果のpaging/resyncと無効化のpublic revisionを維持する。

### UIと確認量

画面正本はprototype-review対応表＋採用試作。上部曲/難易度/ROUND、中央プレイヤーカード、自分先頭、下部主操作、右の曲履歴/条件/管理、順位カードを実装へ対応付ける。20人desktop4列＋カード一覧のみスクロール、狭い画面2列＋右情報を下へ。主操作が一覧に押し出されないことを検証する。

専用入口の作成/参加から各ページへ。Topは通常ロビー、通常統計と開催履歴は別。ページ移動は接続維持、「進行中の開催へ戻る」を出す。明示退出/Host終了だけmembershipを変える。通常への新規参加は参加排他の理由を表示する。

大会開催開始はN/新規参加締切確認、合同開催開始と各曲開始は追加dialogなし。選び直し・スキップ・締切・無効化・終了/Host退出・参加者退出・Kickはprototype-reviewの対象/影響確認。無効化は次曲選択後も次曲開始前・終了前の前曲詳細から可能。終了後無効化/Kick/次曲等をUI policyでも止める。既存policyの`INVALIDATE_ROUND`（PICKING不可/RESULT可）やKICKの範囲をserver規則と照合する。Host切断中は新規mutationではSUBMITのみ許可し、STATE_GET/RESULTS_GET/PING-PONGのread・同期は維持する。policy先頭の非SUBMIT一律拒否でreadまで止めない。

## Task breakdown / delegation execution plan

依存順: **R0 → 契約checkpoint → R1 → { R2→R3, R4→R5 } → R6 → R7**。

| packet | owner / write scope | dependency / checkpoint |
| --- | --- | --- |
| R0 規範・変更契約の確定 | coordinator。指定design docsと本taskのC記録のみ | C許可後。contract-auditorが合意との差/互換方針を確認してからR1 |
| R1 shared開催契約 | server-implementer。`packages/shared`のみ | R0。R2/R4共通入力として凍結 |
| R2 開催FSM | server-implementer。event-room-stateと関連tests | R1。集合/配点/期限checkpoint |
| R3 Worker接続/保存/版 | server-implementer。controller/routes/services/Worker tests | R2。client統合前に権限/秘匿/永続化checkpoint |
| R4 client接続/履歴/source | front-implementer。services/stores/Tauri保存とclient test script | R1後mockで並列可。完了はR3との統合後 |
| R5 入口/進行/結果view | front-implementer。app/sidebar/pages/features/dev/styles | R4。採用試作とのvisual checkpoint |
| R6 統合/回帰 | front-implementer。client harness、scripts、testdataのみ | R3/R5。各層の修正はそのownerへ戻す |
| R7 独立監査 | contract-auditor / implementation-auditor。read-only | R0契約/ R1 consumer / R6後最終。finding追跡を統合 |

`1 write scope = 1 owner`。R2/R3は同一server、R4/R5/R6は同一frontが逐次扱う。sharedはserverだけ、client/worker package.jsonは各owner。監査担当はread-only。親は委譲scopeを書かず監査/統合調整。R0と本taskの更新はcoordinatorだけ。他の編集をrevertしない。ownership takeoverは停止宣言→再割当を先に行う。

### 全packetの共通契約

以下はR0〜R7すべてへ適用する必須field。個別記載がより狭い場合は個別を優先する。

- non-goals: 上記非目標と既存通常room一般化、依存更新、汎用大会framework化。
- forbidden scope: current request ceilingを超える実行、他ownerのwrite、未追跡WIP破棄、無関係整形、生成物直接編集、lockfile更新、許可のないGitHub/commit/merge/deploy。
- allowed side effects: **本Bでは各packetは未実行**。将来C許可後だけ、個別in-scopeの最小コード/テスト/規範差分と隔離した検証生成物。commit等はその時の依頼範囲で別判定。
- expected output: `COMPLETE/BLOCKED/ESCALATION`、変更path、success criteriaとの対応、検証command/結果、参照source、finding→disposition→evidence→remaining risk。未実施をPASS扱いしない。
- continue-without-escalation boundary: 合意内の関数/component分割、typed fixture修正、同scope内のテスト補完、既存分離構造の局所修正。scope/契約/互換を追加で変えるときは先にReplan。
- escalation: 新仕様判断、scope外拡張、新依存/CI/resource変更、互換方式変更、参照不能、必須検証不能が必要になった時点で停止し、理由と選択肢を提示する。
- stop condition: 個別success criteriaと必須検証/監査が満たされればpacketを止める。次packetのwriteへownership確認なしに進まない。

### R0 — 規範を新正本へ整合

- objective: 毎曲Readyを残した規範を合意原稿へ同期し、R1の契約をreviewableにする。
- in-scope files/layer: `docs/design/01_fsm.md` §12、`02_ws_protocol.md` §6、`03_data_model.md` §10、`05_screen_list.md` §14と入口関連、`06_source_io_spec.md` §8、`07_constants.md` §11、`10_regression_guard_addendum.md` §7。本taskのC checkpoint記録。
- success criteria: 開始集合/0対象/切断/休憩/次曲待ち、protocol2/snapshot2/DO2/history2/v1読取とdrain、確認操作・画面責務が矛盾せず、通常のReady規範を維持。合意資料は書換えない。
- validation: 原稿の7つの製品ACと各規範を照合、`check:design-contracts`。文字列checkのPASSだけで仕様監査を代替しない。contract-auditorのBlocker/Must fixなしをR1前checkpointとする。
- 個別stop/escalation: UX規則を変える必要が判明したら実装へ渡さず相談。schema/versionの追加変更は互換理由を示してReplan。

### R1 — shared開催専用契約

- objective: Readyなしのserver/client入力を同じ型とversionへ固定する。
- in-scope files/layer: `packages/shared/src/constants/host-event.ts`、`models/host-event.ts`、`ws/host-event.ts`、関連index/message maps。通常enumは意味維持。
- success criteria: protocol2/snapshot2、ready/SET_READY撤去、current_eligible IDs、historyとlive DTO境界が明示。全consumer一覧とliteral1参照の修正引渡しを残す。通常payloadは不変。
- validation: sharedの型と新契約限定fixture（`satisfies`/型付き）のshape確認、contract-auditorのparser/serializer/exhaustive coverage確認。R1直後は旧consumerが未改修でroot typecheck failureがあり得るため、影響pathを列挙してR2/R4へ引渡す。R1単独に全consumerのroot PASSを課して依存deadlockにしない。root typecheck PASSはR3/R4合流後・R6最終の必須条件。
- 個別continue: 同shapeのtype export整理まで。未合意action/休憩state追加は不可。R1だけ先行公開しない。

### R2 — FSM・開始集合・維持規則

- objective: 合同/大会とも全当該曲対象をReadyなしで開始し、切断/休憩を未提出のまま待てる。
- in-scope files/layer: `apps/worker/src/durable/event-room-state.ts`、`event-room-state.test.mjs`、`contract-guards.test.mjs`。
- success criteria: 当該曲対象0人拒否、切断者込み開始、14/15待機→締切→欠場、締切前復帰、固定N、LEFT/KICK/新規参加待ちが合意と一致。schema2 validation、schema1拒否/原本非破壊、expected_key/初回提出/idempotency/Host絶対300秒を維持。
- validation: V1〜V6のpure fake-clock/集合/数値試験、SCORE/MISSCOUNT、専任20＋Host/兼任20、期限直前/一致/超過、次曲開始と無効化の受理順、全曲無効/0曲。`npm run test:worker`へ含まれる既存test fileを使用。
- 個別continue: ready処理の局所撤去と開始・投影を修正。旧稼働recordを新方式に解釈して回復する実装は不可。

### R3 — Worker protocol・永続化・秘匿

- objective: 新契約をHTTP/WS/DO保存境界へ接続し、通常対戦を維持する。
- in-scope files/layer: `event-room-controller.ts` / tests、`room-object.ts` / tests、通常回帰に必要な`room-state.test.mjs`の最小補強、`routes/capabilities.ts` / tests、`routes/event-rooms.ts` / tests、`services/event-room-create.ts`、`services/room-do.ts`、`types/api.ts`、必要な`index.ts`/既存route consumer、`apps/worker/package.json`の新test登録だけ。通常RoomStateMachineの仕様変更は不可。
- success criteria: protocol1/未知版拒否、protocol2正常、通常JOINとEVENT_JOIN分離。進行権限、現行socket、generation/round/selection、保存失敗のrollback・同request再送、alarm再起動時の絶対期限、未確定score全channel非公開、開催lobby非掲載を維持。
- validation: controller偽socket/durable storage、put/alarm失敗、restore/Host復帰期限境界、ACK/reJOIN/RESULTS_GET漏洩否定、通常routes/DO/lobby regression、Wrangler dry-runとDO/WS起動、V3/V5/V6。
- 個別stop: DO binding/migration追加、legacy稼働変換、restoreLost隔離規則の拡張が必要ならReplan。

### R4 — client接続・自動提出・履歴互換

- objective: server受理状態を正としてReadyなし連続プレーと端末保存を接続する。
- in-scope files/layer: `stores/event-room-store.ts`、`services/event-ws-client.ts`、`event-action-policy.ts`、`worker-api-client.ts`、`event-history.ts`、`event-results-sync.ts`、`event-notebook-replay.ts`、`participation-mode.ts`、必要な`source-submission.ts` / `source-store.ts`呼出元と関連tests。Tauri `commands/event_result.rs` / 登録、`tauri-bridge.ts`はv2共存に必要な最小範囲。`apps/client/package.json`のtest登録。
- success criteria: protocol2のみ支持、SET_READY送信なし、ACKでのみ提出済み、stale/retry/reconnect整合。専任source不要、兼任/参加者自動提出、旧結果新曲再送なし。history2新保存、history1読取原本保持、未知schema保持、完全/部分の表示、通常statsへの不流入。
- validation: source3種＋legacy共有adapter回帰、参加者操作なし連続2曲、画面移動中も監視/提出継続、同曲2回で古い観測の再提出拒否と新しい初回有効観測採用、切断復帰、Host切断中の提出受理/公開停止、未確定と確定の保存境界、paging cursor invalidation、v1/v2/未知/破損履歴、browser/Tauri再読込、排他接続。root typecheck/client unit/stats/Rust check+test、V3/V6/V7。
- 個別continue: parser authorityや実測値を再実装せずcontext adapterを修正。source形式変更/通常archive migrationが必要ならReplan。

### R5 — 専用入口と通常対戦を生かすview

- objective: 合意試作の操作配置・役割差・確認量を製品へ反映する。
- in-scope files/layer: `app/App.tsx`、`components/AppSidebar.tsx`、`pages/LobbyPage.tsx`、新`pages/EventEntryPage.tsx` / `EventCreatePage.tsx` / `EventJoinPage.tsx`、`EventRoomPage.tsx` / `EventHistoryPage.tsx`、`features/event/*`、`dev/event-visual-scenarios.*`、`styles.css`の開催/サイドバー必要部分、関連component tests。作成入力は既存Modalからpresentational formへ抽出可。
- success criteria: Top通常維持、専用2入口/ID＋コード/入力保持、在室の行先変更＋戻り導線、20人独立scrollと主操作維持。Ready/連続設定なし、接続/対象/次曲待ち/未提出/欠場を分離。3役割×2タイプ、結果カード/詳細抽出/全順位、過去公開結果の閲覧、前曲無効化、最終/履歴を正本と対応付ける。
- validation: V8/V9、prototype-reviewの確認表全操作、0/20人、長い名前/曲名、source障害、Host切断、休憩想定→締切、一時復帰/LEFT、同点/欠場/全無効、保存途中/未知版。1280px/390px/305pxでoverflow、visibility、主操作、一覧scroll、右管理、結果表を画像と実クリックで確認。新testは公開typeのtyped fixtureとする。
- 個別continue: 合意意味/情報階層を保つ文言寸法調整。試作上部のレビュー操作や架空休憩ボタンを製品化しない。通常RoomArena/RoomBPLのFSM/props一般化はscope外。

### R6 — 統合シナリオと回帰証拠

- objective: 新仕様の継続プレー/例外/互換を端末と20接続で証明する。
- in-scope files/layer: `scripts/host-event-e2e.test.mjs`、`scripts/run-host-event-e2e.ps1`、`scripts/capture-host-event-visuals.mjs`、`apps/client/src/services/e2e-scenario-runner.ts`、必要なobservability、`testdata/e2e/host-event/`。通常E2E harnessは最小の共有修正のみ。
- success criteria: SET_READYに頼らない合同/大会各2曲、専任/兼任、20接続/overflow、14/15の未提出待機と締切前復帰/締切後拒否、Host切断・履歴再読込を記録。通常ARENA2試合/BPL/BPL4を維持。V1〜V9のowner証拠が揃う。
- validation: CI full相当commands、2実Tauri+20接続DOを併用。20 Tauri同時起動は要求しない。実時計5分はfake-clock境界試験と区別し、実端末の短い切断再JOINも記録。source3種の各指標とparser/replay回帰、visual browser確認。
- 個別stop: `.github/workflows`変更は計画しない（現CIにintegration/client unitがある）。新test未登録ならworkspaceの担当ownerへ戻す。CI面の拡張必須ならReplanしてから。

### R7 — 独立契約・実装監査

- objective: 正本と各layer/検証の差を独立に判定し、未処理findingを残さない。
- in-scope files/layer: R0〜R6全差分/正本/試作/実行証拠。read-only。
- success criteria: contractはbreaking分類/新旧consumer/DO/history原本/score秘匿/authority/期限/受付drain、implementationは対象集合/役割UI/確認量/通常回帰/検証面を確認。Blockerゼロ、Must fix解消またはユーザーの明示再scope。finding→disposition→evidence→remaining riskを本taskのC記録へ集約する。
- validation: R0/R1後の早期監査、R6後の両最終監査。修正は元ownerへ返し、影響検証を再実行してから再監査。
- allowed side effectsの個別上限: 監査報告だけ。製品変更/仕様再定義/指摘を黙って延期不可。

## Validation checklistとlocal/CI parity

| ID | 新AC/維持規則 | 最低証拠 / packet |
| --- | --- | --- |
| V1 | 3役割/2タイプ/20上限/通常分離 | R2容量＋専任別枠/兼任込み、R3公開lobby非掲載、R6通常回帰 |
| V2 | Readyなし開始/対象0/所持/参加待ち | R2 eligible・pending/connected/disconnected/LEFT/KICK、R5待機と人数、R6二曲 |
| V3 | 14/15未提出/締切/一時復帰/初回自動提出 | R2締切前後・NOT_PRESENTとDEADLINE区別、R3権限/重複/古socket、R4各source/replay |
| V4 | 固定N/同点/欠場/無効化/0確定曲 | R2数値例N=15・1/1/3位=15/15/13pt、MISSCOUNT9999、N不変、R4再同期、R5勝者なし |
| V5 | Host5分・通常TTL非適用・復元 | R2/R3 now< / = / >deadline、全提出でも非公開、復帰時確定/期限無効、alarm/hibernation/ROOM_STATE_LOST |
| V6 | 結果秘匿/新旧互換/通常維持 | R3全message/ACK/reJOIN/results漏洩否定、protocol1/2/未知組合せ、R4更新必要表示 |
| V7 | history2/v1読取/完全部分/未知保持 | R4 browser+Tauri原本/保存成功・失敗/最後の受信範囲/無効upsert/通常stats、R6再読込 |
| V8 | Top専用入口/戻る/役割/操作配置 | R5試作対応/画像/実入力、20人scroll・主操作固定、participant Host操作なし/Readyなし |
| V9 | 確認量/結果閲覧/規範整合/独立監査 | R0/R5確認表、次曲開始前前曲無効化、全順位/同強調、R7disposition |

現CI正本: `.github/workflows/ci.yml`→`validate-reusable.yml`、Windows / Node22。PRはquick、tag/manual fullは追加build/Rust/Wrangler。C最終は**full相当以上**を要求し、quickだけで完了しない。

必須コマンド面（本Bで新実装を検証したという意味ではない）:

- `npm run check:agents`、`npm run check:design-contracts`、`npm run lint`、**root** `npm run typecheck`。
- `npm run build:client`、`npm run test:client-stats`、`npm --workspace @infinitas/client run test`、`npm run test:worker`。
- `npx tsx --test scripts/host-event-e2e.test.mjs`。
- `cargo check --manifest-path apps/client/src-tauri/Cargo.toml`、`cargo test --manifest-path apps/client/src-tauri/Cargo.toml`。
- cwd `apps/worker`: `npx wrangler deploy --dry-run`、DO/WSローカル起動。dry-runは本番deployではないが本Bでは未実行。
- `pwsh -File scripts/run-host-event-e2e.ps1 -EventType CASUAL -RoundCount 2`、同`TOURNAMENT`。R6で新oracleへ更新後に実行。
- `pwsh -File scripts/run-local-e2e.ps1 -Scenario reflux-reflux-full -Mode ARENA -MatchCount 2`、`-Scenario mixed-daken-v3-notebook -Mode BPL`、`-Mode BPL4`も実行。
- 通常回帰ではcreate→ready→pick→play→result、duplicate pick差替え、TIMEOUT/FORCE_ADVANCE、SKIP_HOST_ASSIGN拒否、ROOM_STATE_LOSTを既存worker testsと上記端末シナリオで確認し、どの証拠がどの経路を担うか残す。開催のReady廃止を通常のReadyへ波及させない。
- `node scripts/capture-host-event-visuals.mjs <isolated-output-directory>`＋新入口/確認/戻りの実操作。captureのみでUI受入を完了扱いしない。
- `git diff --check`、diff scope/生成物/UTF-8 no BOM/LF/依存不変の確認。

`apps/client/tsconfig.json`は`.test.ts`を除外、rootはclient ts/tsxを含む。client workspaceだけのPASSは不十分。client/worker test scriptは列挙式なので新test登録または明示実行＋理由を残す。mjsのruntime testsも明示entrypointで実行する。fixtureは`const fixture = {...} satisfies PublicType`等でshape driftを検知する。

root `npm ci`はCI準備にあるが依存更新の許可ではない。環境再構築が必要ならlockfileを維持する。localでCI相当を再現不能ならcommand/skip reason/residual riskを明記し、狭いPASSをCI PASSと扱わない。Rust/parserを直接変更しなくても共有source contextを変えるため`inf-notebook`、`daken_counter_v3`、`reflux`、`inf_daken_counter`（legacy有効時）の抽出・observed_key一致・SOURCE_UNAVAILABLEとTECH skip導線を検証する。

## Commit分割・公開/rollback計画（今回未実施）

将来のlogical commits: (1)R0規範、(2)R1 shared、(3)R2 FSM＋tests、(4)R3 controller/API＋tests、(5)R4接続/履歴/source、(6)R5入口/view＋tests、(7)R6統合fixture/harness、(8)監査修正を責務別。breakingな中間commitを独立公開しない。

PRの処理方針は既存#189を参照した差分修正が基本。ただしこの計画は#189更新/closeや新PR作成を許可しない。後続でPR処理を明示された時点にhead/base/既存review/checkを再確認し、合意新仕様中心へ本文を更新する。untracked Phase A資料/taskを必要なく隔離コピーしてsource residueを残さない。

公開は前述v1 drain/互換確認後。rollbackは新規受付を止め、活動中v2の終了/保存を待ち、schema2を読めるruntimeで結果回収する。v2の生存terminalも既存retention満了/cleanupを待ち、復元可能schema2 record/接続なし（active・terminal双方）の証拠を得てからv1-only runtimeへ戻す。証明不能ならrollback停止。schema2活動中やterminal回収中にschema1 serverへ無条件rollbackしない。history2原本とv1原本を削除しない。旧clientがv2を読めない場合は未知schema表示で保持。rollbackは受付停止と互換を伴う別作業であり、本Bでコードrevertを行わない。

## Replan Gate / risk notes / B判定

契約調査のfinding disposition（Cでの必須修正として明示再スコープ、製品修正済みの意味ではない）:

| finding | disposition / owner | required evidence | remaining risk |
| --- | --- | --- | --- |
| CR-01 Must fix: Ready gate/合同の対象除外 | R0/R1/R2/R4/R5 server/front | V2/V3の全対象開始・14/15 | UIだけ修正ではserver旧条件が残る |
| CR-02 Must fix: protocol1のbreaking隠蔽 | R0/R1/R3/R4 server/front | V6の新旧2方向拒否・通常維持 | literal/支持predicateの一部残存 |
| CR-03 Must fix: DO1/2復元 | R0/R2/R3 server＋公開gate | V5/V6、schema1全phase拒否/原本保持、v1 drain/結果回収/retention cleanup後旧record・接続なしの切替証拠 | 本Bでは実稼働未確認。無条件migration不可 |
| CR-04 Must fix: history/live型結合 | R0/R1/R4 front | V7、v1/v2原本保持・旧順位/集合維持 | v1 key変更だけでは旧履歴消失 |
| CR-05 Must fix: UI authority不一致 | R4/R5 front | V3/V9、PICKING前曲無効化・提出済Kick・Host切断read | server規則より狭いUI/同期が残る |
| CR-06 Must fix: 旧test oracle | R2〜R6各owner | V1〜V9、root型検査とtest登録/新assert | 旧PASSを新製品PASSと誤認 |
| CR-07 Note: source adapterは既にReady非依存 | R0/R4 front | V3、規範06同期/監視継続/replay | parserを不要に作り直す回帰 |

監査資料が列挙するDO未開始migration案は比較用の選択肢。本計画では**drainしてschema2へ切替、schema1は移行しない**方式を採用した。実装担当がmigrationの許可と読替えない。historyはv1 readerを採用し、移行上書きは計画しない。

Replan条件:

- 合意した外部動作に未確定/矛盾が判明し、Blocker/Must fix解消に仕様判断が必要。
- protocol/DO/history互換を本計画外へ拡張、旧稼働recordの自動migration/dual runtime、binding/依存/CI更新が必要。
- 試作原本/画像参照不能、配置/確認量の準拠を検証不能。確認不能のままUI完了にしない。
- 20人/0人/同曲復帰/未提出締切/結果秘匿が現構造で成立しない、通常対戦仕様を変えないと進めない。
- owner衝突、検証面不足、監査前提の不足、活動中旧schemaの不存在確認ができず公開へ進もうとする。

該当時は変更案を既成事実化せず、`ESCALATION`または`WAITING_FOR_HUMAN_DECISION`で理由・選択肢を提示し、影響packetを停止する。技術的な同scope修正/検証補完は各continue境界内で自走する。

残余リスク: 試作は架空データ、baselineは旧契約の検証。新通信/自動提出/多端末保存/実時計300秒/新visualはCで未検証。実稼働旧recordの有無・最新v1・GitHub checksは公開前再確認。破損recordの隔離/cleanup仕様はPRの既存留保であり本再設計の範囲へ追加しない。設定既定モデルの古さは既知だがユーザー指定6.1で委譲し、repository configを変更しない。

- **B planning status: READY**。新原稿を正本に契約/分割/所有/依存/検証を固定。仕様変更の未決Blockerなし。
- **Task status: COMPLETE（Phase B計画作成）**。CR-01〜06はC必須修正へ明示帰属済みで、今回の製品適合をCOMPLETEとする判定ではない。
- **C Kickoff: 未実施 / Implementation authorization: NO**。Cへの必須委譲は本書の予定であり起動済み記録ではない。
- 本B完了後は停止。後続ではこのconcrete taskとPhase A正本を読み、モデル指定・ceiling・未追跡保全を持ち越す。
