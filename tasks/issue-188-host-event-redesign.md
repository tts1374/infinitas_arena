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

### E0 — C実行基点の形成・read-back（R0の前提、今回未実施）

本資料PR #191は`v1`の`e557ff2847d0548c3a92fc671139de33b7ced5a1`上のdocs-onlyであり、開催実装を含まない。この`v1`にはR1〜R6の開催コード・追加CIが存在しない。**調査基点とCの実行基点を分け、C許可・C Kickoff後にE0を完了するまでR0〜R7のwriteを開始しない。**

- task label / objective: `E0-execution-baseline`。最新`v1`と#189の既存実装・検証面を保持した実装branchを形成し、後続packetが存在するファイルとCIを前提に着手できる状態を確認する。
- owner / in-scope: coordinator単独。新規のtask-owned `codex/*`実装branch/worktreeにおける既存履歴の取り込みと、本taskへの基点・差分・検証記録。E0完了後に各write scopeをR0〜R6のownerへ引き渡す。
- 実装branchの基点: C開始時に取得・read-backした**最新`origin/v1`のSHA**から新しい実装branchを作る。#191で公開・レビュー合意したPhase A/B資料と試作を保持し、その内容を確認する。資料がまだ`v1`に含まれなければ、#191の合意済み資料だけを当該新worktreeへ引き継ぐ。資料引き継ぎだけで開催コードが存在するとは扱わない。
- 取り込み方法: **新branchへ#189の固定head `90856a42d9e199b49d97966e1dd620e6b626b5dd`を履歴mergeして、87ファイルの既存差分全体を旧仕様baselineとして取り込む。** 個別ファイルの抜き出し・部分cherry-pick・ゼロからの再導入は既定にしない。元#189 branchのrebase/force-push、#189の更新・merge・close、`v1`自体への取り込みは行わない。固定headの再利用は新仕様適合の認定ではなく、Ready撤去等の修正はR0〜R6で行う。
- 最新`v1`との差分確認: remoteの#189 headを固定SHAと照合し、共通祖先・`latest v1...固定head`の変更pathと差分をB調査の87ファイルと比較する。統合後は`latest v1...実装head`のpathと差分を照合し、最新`v1`のgovernance/config・通常対戦・CI更新、および#191資料を失っていないことを確認する。競合解消は両側の意図を保持し、丸ごとのours/theirs置換をしない。#189 headが更新済み、差分が説明不能、競合に仕様判断・新CI変更が必要ならE0を停止してReplanする。
- CIの保持条件: #189の`.github/workflows/validate-reusable.yml`にある**design-contract check、client unit、Host Event integration（quick/full）、cargo test（full）**を最終実装branchにも保持する。既存のagent/lint/root typecheck/stats/Worker/build/cargo check/Wrangler、Windows/Node22、quick/full条件を狭めず、最新`v1`側の追加・修正も保持する。client/workerのtest script登録とintegration fileも対応させる。E0は既存CI差分の取り込みであり、R6で新しいCI仕様を設計する許可ではない。
- success criteria / validation: 基点SHA、固定head、統合後head、両履歴の到達性、統合差分と競合処置をread-backし、`event-room-state.ts` / `event-room-controller.ts`、shared開催契約、clientの`event-room-store.ts` / `event-ws-client.ts` / `EventRoomPage.tsx`、integration/harness、上記CI step・test登録の存在を確認する。継承したCI quick相当（agents/design-contract/lint/root typecheck/stats/client unit/Worker/integration）をbaselineとして実行し、結果を記録する。旧Ready試験のPASSを新仕様PASSにしない。履歴merge/commit等はその時の依頼で許可されたlocal操作の範囲で行い、未許可操作をC許可から自動拡張しない。
- expected output / stop condition: `COMPLETE/BLOCKED/ESCALATION`、実装branch/worktree、上記SHA・差分・存在確認・CI baseline結果をC記録へ返す。read-backが揃った`COMPLETE`後だけR0へ進む。不足したままR1〜R6へファイル再作成を委ねない。
- allowed side effects / forbidden scope: **本B・文書PRレビューでは計画記載のみ。E0は未実行。** 将来C許可後の隔離worktree内で、許可済みのlocal履歴統合・必要な競合処置・検証と記録のみ。正本仕様の変更、元branch/既存PRの変更、deploy、他WIPの破棄は不可。
- non-goals: 新仕様への実装改修、旧Readyの採用判断、追加CIの設計、依存更新、旧PRの整理。各改修はE0後の担当packetへ渡す。
- continue-without-escalation boundary / escalation: 内容が明確な同scopeの統合・既存検証面の保持は自走可。新旧仕様・互換・依存・CI面を追加で変える必要があれば理由と選択肢を提示して停止する。

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

B調査基点の#189 headで親が再実行したbaseline: client unit **121/121 PASS**、worker **156/156 PASS**、Host Event integration **4/4 PASS**、root `npm run typecheck` **PASS**、`npm run lint` **PASS（warning 0）**、`npm run build:client` **PASS**。これは旧動作の再現可能性の証拠。integration helperにも旧Ready操作がある。buildのBrowserslistデータ更新noticeを依存更新理由にはしない。Wrangler bundle、Rust、製品の新仕様E2Eは本Bでは未実行。既存試験が通ることだけで再利用部の新契約適合を宣言しない。

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

依存順: **C許可・C Kickoff → E0（実行基点・CI read-back）→ R0 → 契約checkpoint → R1 → { R2→R3, R4→R5 } → R6 → R7**。

| packet | owner / write scope | dependency / checkpoint |
| --- | --- | --- |
| E0 実行基点の形成 | coordinator。新実装branch/worktreeの既存履歴統合と基点記録のみ | C許可・C Kickoff後。最新v1＋固定#189実装/CI保持のread-back完了後R0 |
| R0 規範・変更契約の確定 | coordinator。指定design docsと本taskのC記録のみ | E0 COMPLETE後。contract-auditorが合意との差/互換方針を確認してからR1 |
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
- 個別stop: R6で新たな`.github/workflows`変更は計画しない。integration/client unit等のCI前提は**E0で取り込んだ#189 workflow**にあり、素のv1にはない。最終branchでそのstepとquick/full条件の保持を再確認する。E0取り込み漏れならE0 ownerへ戻し、新test未登録ならworkspaceの担当ownerへ戻す。新しいCI面の拡張が必須ならReplanしてから。

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

CのCI正本: **E0で最新v1へ#189差分を統合しread-backした実装branch**の`.github/workflows/ci.yml`→`validate-reusable.yml`、Windows / Node22。#191のv1基点ではdesign-contract/client unit/Host Event integration/cargo testのCI stepは未追加。#189ではdesign-contract/client unit/integrationがquick/full、cargo testがfullにあり、E0とR6で保持を確認する。PRはquick、tag/manual fullは追加build/Rust/Wrangler。C最終は**full相当以上**を要求し、quickだけで完了しない。

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

将来の履歴形成: まずE0で最新v1上の新branchへ固定#189の既存履歴をmergeし、実装/CIを保持した基点を記録する（この操作も当時のlocal操作許可に従う）。その後のlogical commits: (1)R0規範、(2)R1 shared、(3)R2 FSM＋tests、(4)R3 controller/API＋tests、(5)R4接続/履歴/source、(6)R5入口/view＋tests、(7)R6統合fixture/harness、(8)監査修正を責務別。breakingな中間commitを独立公開しない。

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

## Phase C 実行記録（2026-10-05 JST）

### C Kickoff・現在の実行境界

- 親 `/root` がユーザーの明示指示によるBの `planning-only / Implementation authorization: NO` の解除を受領し、製品実装とlocal commitまでのCを開始した。上記A/Bの禁止・停止記録は当時の履歴として保持する。
- Stage: Phase C。execution profile: `High-Risk`。contract-sensitive: yes。Plan Mode requirement: required、具体的な本B計画がゲートを満たす。仕様正本は `docs/ux/issue-188-redesign/issue-188-draft.md`、視覚正本は保存済み最終試作と `prototype-review.md`。root/localの適用規約と非目標は本書から持ち越す。
- current request ceiling: `implementation-ready / Phase C実装・検証・独立監査・local commitまで`。Implementation authorization: `YES`。allowed outputs now: E0、R0〜R7の計画内差分、検証ログ、C checkpoint / finding記録、範囲限定local commit。
- forbidden outputs now: push、GitHub write、PR/Issueの作成・更新・close・merge、deploy、旧branch/worktree・原本・stashの削除/適用、新依存・lockfile・新CI仕様変更、通常対戦の仕様変更。他ownerのwrite scopeを変更しない。
- stop condition: E0→R0→契約checkpoint→R1→R2/R3およびR4/R5→R6→R7を計画どおり満たし、指定scopeのlocal commitを記録して停止。公開・drainの実運用はこのC許可に含まれない。
- next unlock condition: downstream実装のユーザー許可は取得済み。追加のsyntheticな実装解除を要求しない。packet間は依存checkpointと親のownership引渡しを満たして進む。公開/外部操作は別の明示指示が必要。
- C Kickoff status: `READY`（親が実装開始前に出力）。親からcoordinatorへの最初のGOはE0だけで、R0はE0完了後の引渡し待ち。
- sticky constraint: 全委譲 `gpt-6.1-sol`、repository設定は変更しない。既存WIP/worktree/stash、原本を保持する。

### delegation execution record

| role / agent id | spawned | ownership / Kickoff時点の確定status |
| --- | --- | --- |
| execution-coordinator `/root/coordinator` | yes | E0履歴統合、R0指定規範、本taskのC追記のみ。E0 `COMPLETE`、R0 GO待ち |
| server-implementer `/root/server` | yes | R2/R3 Worker専用scope、準備中 |
| front-implementer `/root/front` | yes | R4/R5 client専用scope、R6 scripts/testdata/client harness、準備中 |
| contract-auditor `/root/contract` | yes | R0/R1 checkpointとR7契約監査、read-only準備中 |
| implementation-auditor `/root/implementation` | yes | R7実装監査、read-only準備中 |
| 親 `/root` | no（親自身） | R1 shared契約、commit進行管理/最終検証。R1はworker限定のserver roleからwrite前に解除し親へ再割当 |

この表は親が通知した実際のspawn/再割当を記録する。将来のwrite開始を実施済みとは扱わない。各ownerは成功条件・許可副作用・continue/escalation境界を本書の個別packetから継承する。coordinatorは既に分割された単独scopeを担当するため再委譲なし。

### E0 — 実行基点と旧baseline read-back

- status: `COMPLETE`。branch: `codex/issue-188-phase-c-host-led`。worktree: `C:/Users/tts13/.codex/worktrees/issue-188-phase-c-host-led/infinitas_arena`。
- 最新 `origin/v1` の取得・GitHub read-backは親が担当し、基点 `64c640fab3a4e03a0a7fe8f71b9bf259be675167`、#191 `MERGED`、#189 `OPEN` / 固定head `90856a42d9e199b49d97966e1dd620e6b626b5dd` の一致を通知した。
- 新branch/worktreeを上記最新v1から作成し、固定#189を `git merge --no-ff` で履歴統合。merge commit: `f87f05a7bc07e1b70dd1cc97e846625ecbce0572`。parentは最新v1と固定#189の両SHAで、両履歴への到達性を保持。共通祖先: `0a44dfc399591003e0bd6481f6d67cc3c2930806`。競合なし、手動競合処置なし。
- `latest v1...固定head` と `latest v1...統合head` は87ファイル、+8425/-112で一致。latest v1の `AGENTS.md / WORKFLOW.md / QUALITY.md / .codex/config.toml / .codex/agents`、#191の全A/B資料と本taskは統合で差分なし。通常コードの継承差分は固定#189と同じ範囲で、新たな仕様変更はない。
- FSM/controller、shared開催model/ws、client store/ws/page、integration/harness/capture、fixtureの存在を確認。client/worker列挙式標準testの開催登録を確認。
- CI read-back: `.github/workflows/ci.yml` のPR quick/tag・manual fullへの接続を保持。`validate-reusable.yml` は固定#189と内容一致し、Windows / Node22、既存agent/lint/root型/stats/Worker/build/cargo check/Wrangler、追加design-contract/client unit/integration（quick/full）およびcargo test（full）を保持。新CI設計なし。
- 準備: Node `v22.20.0` / npm `10.9.3`、新worktreeだけで `npm ci` 成功、lockfile差分なし。既存依存のaudit通知24件は依存変更せず記録し、この作業で脆弱性調査・修正を追加しない。

| E0 quick相当command | 結果 |
| --- | --- |
| `npm run check:agents` | PASS、8 agents |
| `npm run check:design-contracts` | PASS |
| `npm run lint` | PASS、max-warnings 0 |
| root `npm run typecheck` | PASS |
| `npm run test:client-stats` | PASS、17項目 |
| `npm --workspace @infinitas/client run test` | PASS、121/121 |
| `npm run test:worker` | PASS、156/156 |
| `npx tsx --test scripts/host-event-e2e.test.mjs` | PASS、4/4 |

- 隔離ログ: 新worktreeのignored `.tmp/issue-188-phase-c/e0/{agents,design-contracts,lint,typecheck,client-stats,client-unit,worker,integration}.log`。logはUTF-8 no BOM。`git diff --check` PASS、履歴統合直後の新worktree clean。元rootのv1/WIP/worktrees/stashesは操作していない。
- finding disposition: E0不足のMust fix（#191レビュー）は基点形成・履歴/CI/存在/quick read-backにより `fixed`。evidenceは上記SHA・差分・8面結果。remaining risk: 全結果は旧Ready方式baselineの再現で、新仕様ACのPASSではない。full build/Rust/Wrangler・新E2E/visual・独立監査はR0〜R7で実施する。hosted CIを実行したとは扱わない。
- 次checkpoint: 親へのE0 COMPLETE返却後にR0 GOを受領し、指定7規範だけを新正本へ同期する。R1前にcontract-auditorのBlocker/Must fixなしを必須とする。

### Cの視覚正本再確認（親による試作操作）

- 親がpublicationの保存preview `http://127.0.0.1:18988/event-host-led-preview.html` をIABで閲覧しtitle一致/空白なしを確認。原本/previewは編集しない。
- 専任Host入口→作成→待機→大会15人のN固定確認→AA選曲/確定→開始前切断例も15人対象で開始→14/15未提出（まだ欠場でなくscore未公開）→右管理から締切1人/以後受付不可の確認→欠場SCORE0/0pt/N15→次曲選曲→前曲閲覧→AAの全員集計除外/履歴保持の無効化確認を開いてcancel。
- 1280pxは4列カードと右情報、390pxは参加者20人の2列/自分先頭/一覧外待機、Host/Ready操作なしを目視。305pxはページ横overflowなし（width=scrollWidth=290）、カードtextの重なりは製品寸法調整で解消する入力としてfrontへ引渡す。
- console error/warn 0、確認後viewport reset。証拠はtool画像/AX観測で新画像ファイル保存ではない。採用試作の再確認であり、製品AC/実通信/保存/20接続を検証したとは扱わない。

### R0 — 新正本と規範の整合 checkpoint入力

- 親のE0 COMPLETE受領とR0 GO後、coordinator単独で7指定規範と本C記録を編集。合意UX資料、製品/CI/依存/通常FSMは変更しない。
- 変更: `01_fsm` §12へReadyなしの開始集合/0対象拒否/切断休憩/14・15提出待機/締切と復帰、`02_ws_protocol`開催§6へprotocol2厳格gate/SET_READY撤去/snapshot2対象投影、`03_data_model` §10へDO2・schema1全phase拒否/原本保持・history2専用DTOとv1 reader、`05_screen_list` §14と入口責務へ専用ページ/役割/配置/確認量、`06_source_io_spec` §8へReady非依存・ACKと連続監視、`07_constants` §11へ版とstorage、`10_regression_guard_addendum` §7へdrain/retention/rollbackを同期。

| 原稿の7製品AC | R0規範対応 |
| --- | --- |
| 1 Top分離・専用入口・画面移動と退出の区別 | 05 §1/3.1/13/14、接続維持/戻り/排他と入力保持 |
| 2 Ready/連続設定なし・対象/次曲待ち/Host待ち・連続無操作 | 01 §12.1、02開催§6、03 §10.1、05 §14、06 §8 |
| 3 確定譜面/対象1人/Host接続、休憩切断保持/0拒否 | 01 §12.1、02開催§6.1、03 §10.1、05 §14 |
| 4 14/15未提出を保持→締切だけ欠場0pt/固定N | 01 §12.1/12.2、03 §10.1、05 §14、06 §8 |
| 5 一時復帰同曲・締切後不可・次曲枠・LEFT復帰待ち | 01 §12.1、03 §10.1、05 §14、06 §8 |
| 6 専任source/自己カード不要・兼任カード/全体操作・participant権限 | 01 §12、02開催§6、03 §10.1、05 §14、06 §8 |
| 7 未公開score/順位、同点/N/欠場/Host300秒/無効期間/完全部分 | 01 §12.2/12.3、02開催§6.2/6.3、03 §10、05 §14、07 §11、10 §7 |

- validation: `npm run check:design-contracts` PASS、`git diff --check` PASS。既存checkerの変更不要。通常規範のReadyを維持し、開催追加節以外は05の画面一覧/Top目的/遷移だけの意図差分。標準checkerは文字列checkのためsemantic適合判定は独立contract checkpointへ渡す。E0 quick8面結果とR0規範検証を混同しない。
- status: 規範差分 `READY`、R0個別完了はcontract-auditorのBlocker/Must fixなしを待つ。R1のwriteはそのcheckpoint後。各local commitはindex衝突を防ぐため親が意図scopeのみstage/commit、coordinatorは編集/検証ownerを保持する。

### R0 独立契約監査・gate disposition

- auditor: contract-auditor `/root/contract`、`gpt-6.1-sol`、read-only。判定 `COMPLETE / pass-with-followups（R0規範限定）`。新規Blocker/Must fixなし、R1 gate通過可。
- 独立確認: 7製品AC、維持規則、protocol2/snapshot2/DO2/history2のbreaking分類、DO1全phase拒否/原本保持、history1専用reader/原本保持、旧runtime drain/terminal1800秒retention/cleanup、rollback、役割/確認量を合意原稿と照合。auditorによる `check:design-contracts` と `git diff --check` もPASS。
- line evidence（R0時点）: `docs/design/01_fsm.md:281/282/285`（対象・0人・14/15未提出）、`02_ws_protocol.md:275/277/292`（strict protocol2/Ready action撤去/秘匿）、`03_data_model.md:455/482`（DO2とhistory1/2原本保持）、`05_screen_list.md:486/501`（入口/配置/確認操作）、`06_source_io_spec.md:467`（source採用/ACK/連続無操作）、`07_constants.md:239/246`（版とstorage）、`10_regression_guard_addendum.md:108/109/110`（drain/retention/rollback）。実装証拠と区別し、監査対象は規範差分だけ。

| finding | disposition / evidence | remaining risk / 次owner |
| --- | --- | --- |
| CR-01 Ready gate/合同対象除外 | 規範部分fixed、01 §12.1・02開催§6・05 §14・06 §8 | shared/Worker/client製品実装とV2/V3はR1/R2/R4/R5/R6で未検証 |
| CR-02 protocol1 breaking隠蔽 | 規範部分fixed、02開催§6・07 §11・10 §7 | consumer literal/gateと両方向拒否はR1/R3/R4/R6で未検証 |
| CR-03 DO1/2復元 | 規範部分fixed、03 §10・10 §7、全phase拒否とdrain/terminal条件 | 製品拒否/原本保持はR2/R3/R6、実稼働drain不存在証拠は別の公開gate |
| CR-04 history/live結合 | 規範部分fixed、03 §10.3・07 §11・10 §7 | history DTO/reader/保存と原本保持はR1/R4/R6で未検証 |
| CR-05 UI authority不一致 | 規範部分fixed、02開催§6.3・05 §14、前曲無効化/提出済Kick/Host切断read | policy/store/UI製品整合はR4/R5/R6で未検証 |
| CR-06 旧test oracle | 新ACと旧baselineの区別を本C記録に固定 | 新oracleと標準entrypoint/CI full実証はR2〜R6/R7で継続、製品部分は未処理 |
| CR-07 source既存非Ready依存 | 06 §8の規範同期fixed、parser再実装を要求しない | adapter/replay/連続同曲/4source維持回帰はR4/R6で継続 |

- R0 status: `COMPLETE`。規範限定gateを通過したためR1へ引渡す。CR-01〜06全体や新製品ACをCOMPLETEとは扱わない。親へのcommit委任で7規範＋本task以外をstageしない。合意UX資料は不変。

### R0/R1 local commitとR1 checkpoint

- R0 local commit: `36a6c7df012b08eb03e60a2b1ac4832496ccb133`（7規範＋ここまでのtask C記録）。親がscope限定stage/commitを実施。
- R1 owner: 親 `/root`、shared4pathsのみ。local commit: `ede3b3c57121a22ae06ad89e5cce789e174487e1`。`constants/host-event.ts`、`models/host-event.ts`、`ws/host-event.ts`、新規 `host-event-contract.fixture.ts` を変更。通常enums/message mapは不変。
- evidence: `packages/shared/src/constants/host-event.ts:1/3/8` にprotocol2/room2/history2、`models/host-event.ts:47` にhistory専用participant DTO、`:110` にauthoritative `current_eligible_player_ids`、`ws/host-event.ts:12` にjoin protocol2、`:109` のaction unionからSET_READY撤去。typed fixtureは公開typeのshapeと旧ready/action/protocolを受理しない境界をcompileで確認。
- owner検証: 限定typed fixture tsc、対象eslint、diff PASS。独立監査 `/root/contract` は `COMPLETE / pass-with-followups（shared固定限定）`、新規Blocker/Must fixなし。shared全体tsc、fixture compile、対象eslint、diffを独立実行PASS。
- root `npm run typecheck` は旧consumer未改修のためexpected FAIL。logはignored `.tmp/issue-188-phase-c/r1-typecheck.log`。R1だけのroot PASSを完了条件にしない計画に従うが、継続gapとして保持しR3/R4合流後とR6最終でPASS必須。breakingな中間commitは独立公開しない。

| R1からのconsumer引渡し | owner / 解消packet |
| --- | --- |
| client `dev/event-visual-scenarios`、`features/event` presentation/tests、`pages/EventRoomPage`/visual testの旧ready/snapshot1/不足eligible | front R4/R5 |
| client `services/event-action-policy`/tests、`event-history.test`、`event-ws-client`、`stores/event-room-store`の旧ready/SET_READY/protocol1/履歴fixture | front R4/R5 |
| client `services/e2e-scenario-runner`の旧protocol/Ready | front R6（R3/R5合流後） |
| worker `event-room-state`の旧ready/schema1、`event-room-controller`の旧SET_READY、routes `capabilities`のprotocol1型 | server R2/R3 |

- R1 gate: `COMPLETE`（shared契約固定とconsumer引渡し限定）。親はR2/serverとR4/frontへ実GOを送信した。R3はR2完了後、R5はR4完了後に明示ownership引渡し、R6/frontはR3/R5合流後。CR-01〜06の製品実装・全consumer/exhaustive/parser/serializer実証と新ACは継続中。

### C実装中 finding ledger（継続）

| ID / severity | finding -> disposition / owner | evidence / remaining risk |
| --- | --- | --- |
| C-LOCAL-01 / Must fix | `isSupportedEventSnapshot` のrequired `started_at / ended_at / end_reason`、expected `play_style`、display `level`、`latest_result` fullshape検証不足。frontがrequired top/nested malformed snapshotをfail-closedへ補強。disposition: `fixed`（R4限定） | R4 local commit `3c1719365d446f2d414d1ee1488c40f31a8b8442`、guard testsを含むowner `52/52 PASS`、contract auditor独立6paths `45/45 PASS`。最終R6/R7の全consumer統合と製品verdictは残る。仕様/互換/CI/依存変更なし |
| C-LOCAL-02 / Must fix | `mutationPending` がread actionの `STATE_GET / RESULTS_GET` も拒否。frontが `event-action-policy` でsync許可をpending拒否より先に判定し、回帰testsを追加。disposition: `fixed`（R4限定） | 初回52件中1失敗から修正後owner `52/52 PASS`、対象eslint/diff PASS、stats `17 PASS`、contract auditor独立guard testsを含む `45/45 PASS`、同R4 commit。残riskはR6/R7最終統合検証。仕様・CI・依存変更なし |
| C-LOCAL-03 / Must fix | user-facing終了/欠場理由のraw enum露出。frontが既知終了理由3値と欠場理由 `DEADLINE / NOT_PRESENT / SKIP / LEFT / KICKED` を日本語表示へ補正しroom/historyのtyped testsで確認。storage/APIの原値と未知原本は保持。disposition: `fixed`（R5表示補正限定） | 最終client tests `145 PASS`、lint/build/diff PASS、R5 local commit `10112c3`。親が補正完了を受領してR6実GOを送信済み。残riskはR6/R7最終統合/監査であり全製品PASSではない |
| C-LOCAL-04 / Must fix / validation gap | 結果/全順位のmobile main/footerがviewport外へ押し出される。frontが結果一覧を独立scrollにしfooter/buttonを固定。disposition: `fixed`（R5可視性補正限定） | 再39case `footer.bottom <= 844`/横overflow0、3widthのHost button bottom `809/815/815`・footer `825/831/831`、親305×844pxの全順位PLAYER20 scrollとHost全20人長名scrollでfooter831/button815を独立確認。tests `144 PASS`、lint/build/diff PASS。残riskはR6/R7最終統合/監査であり全製品PASSではない。仕様/互換変更なし |
| C-LOCAL-05 / Must fix / validation gap | 実Tauri成果物が通常Lobbyで実開催renderを検証していなかった。新CASUAL `195940` で開催ACTIVE20cards/Host切断300秒/participant result/final desktop2曲completeを親が独立確認し、explicit navigation補正の方向を確認 | 全fresh final/大会証拠は未受領。native390pngはdesktoplayoutの切抜きで実WebViewviewport未確認、clip画像をnative mobile PASSにしない。actual innerWidth/height・overflow/footer確認と再capture、E2E生成runtime overrideのminSize調整又はnative1280＋browser305/390証拠分離を通知済み。製品config変更/forceback復活は禁止。再freeze/最終full/R7待ち |

### R2 — pure FSM・対象集合の完了とR3引渡し

- owner `/root/server`、packet限定 `COMPLETE`。local commit `6e11dc07371917e20bb12d061aa63953f9508c99`（親によるscope限定commit）。指定3files `apps/worker/src/durable/event-room-state.ts / event-room-state.test.mjs / contract-guards.test.mjs`だけ。
- 実装: schema2、Ready撤去、確定eligibleを元にDISCONNECTEDも開始対象へ含める、`current_eligible_player_ids`投影、fixed roster/N維持。旧schemaの全phaseは拒否し原recordを変更しない。
- validation: pure FSM＋contract guards `58/58 PASS`、state対象eslint、diff、UTF-8検査PASS。fake-clock/集合試験で15人×合同/大会×SCORE/MISSCOUNT、確定前後の切断、全員切断でも対象保持、対象0拒否、LEFT復帰pending/KICK、固定N/同点、Host切断期限299999/300000/300001ms、旧schema全5phase拒否と原本不変（phase集合assert）を確認。
- worker型検査の6diagnosticsはcontrollerの旧Ready/actionとAPIのprotocol1によるR3 consumer gapとして明示引渡し。親はR2限定完了を受領後にR3 GOを送信した。R2試験PASSを全製品/実DO/実端末適合のPASSとは扱わず、R3/R6/R7のprotocol・保存・復元・全CI検証を継続する。

### C再開 — ownership引継ぎと実績記録（2026-10-05 JST）

- 親は旧agentハンドルが現セッションに残っていないことを確認し、旧coordinator停止済みを通知した。以下は実際に再spawnしたownerの記録であり、上記の初回spawn実績は履歴として保持する。既存R3/R4 dirty差分は実装途中の成果物として引き継ぎ、破棄・revert・stash操作を行わない。
- E0/R0/R1/R2は既記録どおりpacket限定 `COMPLETE`。local commit `f87f05a` / `36a6c7d` / `ede3b3c` / `6e11dc0` をread-backした。製品全体のC完了を示すものではない。

| role / agent id | spawned | 再開時のownership / status |
| --- | --- | --- |
| execution-coordinator `/root/coordinator_resume` | yes | 本taskのC追記・証拠統合のみ、記録継続中。製品・design docs・git indexを変更しない |
| server-implementer `/root/server_resume` | yes | R3のWorker接続/保存/版と関連tests、既存dirty差分を引継ぎ継続中 |
| front-implementer `/root/front_resume` | yes | R4のclient接続/履歴/sourceと関連tests、既存dirty差分を引継ぎ継続中。R5/R6は依存・親の引渡し後 |
| contract-auditor `/root/contract_resume` | yes | R7契約監査、read-only準備中。最終監査GOは未送信 |
| implementation-auditor `/root/implementation_resume` | yes | R7実装監査、read-only準備中。最終監査GOは未送信 |

- 親は全5再開agentの `gpt-6.1-sol / fork none` 実spawnとownershipを通知し、live agent listでも全5idをread-backした。`1 write scope = 1 owner` を維持し、他ownerの編集をrevertしない。範囲限定stage/commitは親だけが行う。current request ceiling / allowed outputs / forbidden outputs / next unlock conditionはC Kickoffの境界を維持する。
- C-LOCAL-01: frontによるrequired snapshot guard補強と関連 `50 tests PASS` の報告を親から受領した。最終再検証・独立監査の証拠は未受領のため、候補findingの最終 `fixed` 判定を保留する。
- R4追加checkpoint: 親経由でfrontのC-LOCAL-02修正後 `52/52 PASS`、対象eslint/diff PASS、stats `17 PASS`、root型診断はR4対象0件・R5/R6旧consumerだけと受領した。root全体PASSを主張しない。Rust checkは実行中session `47057` の結果待ちであり未完了。
- 最終validation gate: V1〜V9のowner証拠、root typecheckを含むCI full相当以上、継承したCI step/test登録の保持、Rust check/test・Wrangler dry-run・実DO/WS、合同/大会各2曲・通常ARENA2試合/BPL/BPL4、採用試作に対するviewport画像と実操作、両独立監査のfinding disposition、scope/文字コード/diff確認を集約する。E0旧baselineやR2限定PASSを最終PASSへ流用しない。未実行・再現不能な面はcommand/skip reason/residual riskを明記する。
- stop condition: 再開scope内の記録整合まで。新仕様・CI・依存・phase境界の変更が必要になった場合はReplan/親照会へ戻す。最終監査・検証・local commitは実証受領後に追記する。

### R4 — client接続・履歴・sourceの完了とR5引渡し

- owner `/root/front_resume`、親はR4限定 `COMPLETE` を受領。local commit: `3c1719365d446f2d414d1ee1488c40f31a8b8442`。親だけがclient 15pathsをscope限定stage/commitした。R5/R6やtaskはこのcommitの対象外。
- owner検証: 関連client tests `52/52 PASS`、通常stats `17 PASS`、対象eslint、diff、client build、Cargo check、Cargo test `20 PASS`。Cargoの初回dist欠落はclient build後の再実行で解消し、Rust session `47057` の未完了状態は解消した。
- C-LOCAL-01/02は上のledgerに修正証拠と残riskを記録。contract-auditor `/root/contract_resume` は独立6pathsの関連testsを実行し `45/45 PASS`（両guard regressionを含む）。これはR4 checkpoint証拠でありR7全差分の最終監査ではない。
- root型診断はR4対象0件。残るR5/R6旧consumerの失敗を保持し、root全体PASSはR6最終で必須。親はR4完了受領後にfrontへR5の実GOを送信した。R6はR3/R5合流待ち。

### R3 — Worker接続・保存・版の完了 checkpoint

- owner `/root/server_resume`、親はR3限定 `COMPLETE` を受領。local commit: `88a16a81c651505cd0bc5fe21327a1dfc01840c7`。親がWorker 6pathsだけをscope限定stage/commitした。通常FSM、shared、client、CI、依存はこのcommitの変更対象外。
- owner検証: 実DO/WS smoke `12 checks PASS`、Worker `187 PASS`、Worker型検査、対象lint、diff、Wrangler deploy dry-run PASS。変更6pathsのstrict UTF-8/no BOM/LFもPASS。
- evidence: ignored `.tmp/issue-188-phase-c/r3-evidence.json` と同phase-cディレクトリのruntime/smoke/Worker/dry-run logs。JSONは実行時HEAD `3c17193` とtimestampを保持し、R3 dirty差分を検証した時点の証拠である。検証後に上のR3 local commitをread-backした。local `18821` serverはR6用に保持する。
- contract-auditor `/root/contract_resume` の準備中独立実行: client `45 PASS`、Worker `83 PASS`。限定testsの証拠として記録し、R7最終契約監査の完了とは扱わない。
- remaining risk: 実smokeはlocal DO/WSであり本番drain/deployの証明ではない。schema1拒否とHost絶対期限境界はfake-clock/storage testsの証拠を用い、実時計で5分を待つ試験を行ったとは主張しない。公開gateはCの停止境界外に残す。
- status: R3 packet限定 `COMPLETE`、R5待ち。R6実GOはまだ送信しておらず、V1〜V9の最終統合・全CI・visual・両監査は継続する。

### V1〜V9 証拠対応と残ゲート（R3/R4完了時点）

全行は新仕様の**部分証拠**であり最終PASSではない。E0の旧Ready baselineを新ACへ割り当てない。以下のR2/R3/R4は上記local commitとowner検証に対応し、未取得の統合・視覚・独立監査は明示して残す。

| ID | 取得済み新仕様証拠 | 未取得 / 残packet |
| --- | --- | --- |
| V1 | R2 `58/58` の専任Host別枠/兼任込み20上限・合同/大会、R3 Worker `187` とlocal DO/WS `12 checks` | R6の20接続/overflow・通常ARENA/BPL/BPL4との分離、R7最終監査 |
| V2 | R2の全eligible開始/切断者保持/0対象拒否/LEFT待ち/KICK、R4 Ready action撤去とpolicy/tests | R5対象人数/Host待ち/Readyなし表示と実操作、R6合同/大会各2曲 |
| V3 | R2の15人×合同/大会×SCORE/MISSCOUNT・14/15待機/締切/復帰、R3 controller/route/古socket関連tests、R4 source/replay関連tests | R6の実連携14/15・締切前復帰/後拒否・正常連続無操作、各source/legacyの最終対応証拠 |
| V4 | R2の固定N/同点/欠場/Host期限集合試験、R4履歴readerと同期read許可・C-LOCAL-02回帰 | R5全順位/同強調/勝者なし表示、R6無効upsertと履歴再同期、R7数値/保存経路監査 |
| V5 | R2 Host期限299999/300000/300001ms・旧schema全5phase拒否/原本不変、R3偽storage/clockとlocal DO/WS。実smokeとfake-clock証拠を区別 | R6 Host切断/復帰/期限とclient統合、R7alarm/hibernation/ROOM_STATE_LOST経路監査。本番drainは公開gateでC対象外 |
| V6 | R1 strict protocol2/shared fixture、R3 Worker型/route/controller tests、R4 malformed snapshot fail-closed・旧/未知版のguard（C-LOCAL-01） | R6新旧2方向拒否/通常維持、R7全message/ACK/reJOIN/resultsの秘匿・consumer/parser/serializer監査 |
| V7 | R1 history専用DTO、R4 browser/history/replay/Tauri保存改修、関連 `52/52`・Rust `20` と通常stats `17` | R6 browser/Tauri再読込・完全/部分・最後の受信範囲・無効upsert・未知原本保持の統合対応証拠、R7最終監査 |
| V8 | 視覚正本の保存試作と親の再操作記録、R4画面移動中接続/監視の基盤改修 | R5製品のTop専用入口/戻る/3役割/20人scroll・1280/390/305px画像と実入力。試作確認は製品証拠ではない |
| V9 | R0の7規範と独立契約checkpoint、R4 PICKING/Host切断時read権限とsync regression | R5確認表全操作/前曲無効化/結果閲覧、R6最終回帰、R7両最終監査とfinding disposition |

- 親はignored `.tmp/issue-188-phase-c/run-ci-full.ps1` に12面の最終CI相当runnerを準備した。これは準備の実績であり検証PASSではない。R6差分確定後に実行し、各commandのlog・HEAD/time・`results.json` を受領して更新する。
- local/CI parity read-back: 現workflowはWindows/Node22、quickのagents/design/lint/root typecheck/stats/client unit/Worker/integration、full追加のclient build/Cargo check/Cargo test/Wrangler dry-runを保持し、PR quick/tag push・manual fullへの接続を維持する。hosted CIの実行はこのCの外部操作境界に含まれず、local full相当の証拠と区別する。

### R5途中レビューとR6検証境界の確認

- R5 owner `/root/front_resume` は製品UIを継続実装中。親のread-only reviewは以下の確認事項をfrontへ実際に送信した。途中差分への照合依頼であり、最終finding/severityや製品PASSとしては扱わない。
  - 未確定PICKINGの `CONFIRM_PICK` がcards前にあり下部footerが空の配置を、採用試作の下部主操作・選曲確認導線に照合する。
  - LEFT/KICKが優先statusとconnectionで重複し提出状態を隠すcaseについて、接続・提出状態を独立表示する。
  - user-facingな `Room ID` を合意ラベル `開催ID` へ微調整する。
- 各確認のdisposition/実装差分/視覚証拠はR5 outputで受領する。新規専用Entry/Create/Join pagesを含むUI差分はfrontの単独write scopeであり、親/coordinatorは変更しない。
- R6の計画内共有helper最小修正について親の許可を受領: `scripts/start-local-two-clients.ps1:121`、`scripts/run-local-e2e.ps1:100`、同mock起動`:613` のhelper processをhiddenへする。実Tauri clientは可視のまま保持し、終了対象はこの検証が所有するPIDだけとする。UI実端末検証の見える状態や他作業のprocessを変更する許可ではない。実修正・実行の完了は未受領。
- 親のignored full runnerに、taskを除くtracked/untracked sourceのSHA256を `validation-source.json` へ保存する機能を追加したとの報告を受領。runnerのsyntax/root-path検査はPASS。これはrunner準備の証拠であり、12面の検証実行はR6差分確定後に行う。検証時dirty sourceと後のlocal commitが同一内容か最終read-backで照合できるようにする。
- current status: R5継続中、R6/R7の最終gate待ち。仕様・ownership・phase ceilingの拡張は行わない。

### R5限定結果・表示補正待ちと検証生成物の保全

- 親はfrontのR5 owner限定 `COMPLETE` 結果を受領。対象17paths（client package登録と新 `EventEntryPage.test` を含む）で、local commitはまだ行っていない。R5補正・最終gateの完了とは区別する。
- owner結果: client tests `143 PASS`、lint/build/diff PASS。root型診断はR6対象だけ3件を保持し、root全体PASSは未取得。製品視覚QAは13states×1280/390/305pxの `39 cases` と `10 confirm/actions`、unknown schema/save failure等のowner報告を受領した。39caseの横overflow確認を全statesの主操作可視PASSへ読み替えない。後の親確認でC-LOCAL-04のviewport外押出しを発見しており、主操作可視性の最終validationは未完了。
- owner証拠: `C:/Users/tts13/AppData/Local/Temp/issue188-r5-qa/` の `evidence.json / actions.json / prototype-evidence.json / console.json` とimages。親の独立中間MCP製品確認は新worktree内ignored `.tmp/issue-188-phase-c/root-ui-inprogress-evidence.json`。これらは製品R5証拠であり、Phase A保存試作の操作証拠と区別する。
- C-LOCAL-03はledgerの候補として追跡する。親は `/root/front_resume` へ表示だけの補正follow-upを実際に送信した。既知3終了理由を日本語で表示し、storage/APIは維持する。affected testsとfinal/history QA更新の返却を待ち、R5の最終checkpoint/local commitへ進む。
- 親所有のlocal検証process: Vite `18920` / session `80917`、Worker `8787` / session `39922`。Worker persistenceは新worktreeの `.tmp` へ隔離し、production操作はない。終了時はtask-owned processのみを対象にする。
- 初回helperのrelative persistence pathが1階層ずれ、wrapperの `.tmp` に新規scratchが生成された。親は即stopし、正しい新worktree `.tmp` へ切り替えて再起動した。これは今回新規生成物で旧原本ではない。削除せず保全する。
- source reconciliation gate: MCP自動生成物が元rootの `.playwright-mcp` に保存された。開始時cleanを確認したtask-owned生成物であるため、最終時に全内容を新worktree `.tmp` へmoveして保持し、元rootをread-backしてcleanへ戻すことが完了条件。移動・read-backは未完了であり、coordinatorはファイル操作を行わない。
- current status: R5 owner限定結果は受領済み、C-LOCAL-03/04補正・再QA待ち。両finding解消前はR5 commitと次GOを保留する。R6/R7と最終CI相当・source reconciliationは未完了。

### R5 precommit gate — 狭幅の主操作可視性

- 親はownerの39case `evidence.json` をread-onlyで確認し、結果/全順位やHost切断時のmobile main/footerがviewport外になる値を検出。MCPで製品305×844px `event-many-ranks` の押出しを独立実確認した。記録はC-LOCAL-04へ対応する。
- 親はfrontへ結果一覧/全順位も独立scrollにし、footer/buttonをviewport内に保持する最小CSS修正を実際に通知した。Host `NEXT_PICK` を含む1280/390/305pxの追加画像・寸法・実操作をR5 outputで受領する。
- success criteria / stop condition: 各対象caseで `footerBottom <= innerHeight` と主操作buttonの可視/操作を確認し、C-LOCAL-03の日本語終了理由表示と合わせて再QAする。横overflow0だけでは完了にしない。仕様/互換の変更やowner追加は不要。未解消の間はR5 gateを保留し、製品全体C完了を主張しない。

### R5補正 checkpoint — C-LOCAL-03/04 の取得証拠と残確認

- frontの補正後結果: client tests `144 PASS`、lint/build/diff PASS。root型診断は既知R6の3件のみを保持し、root全体PASSとは扱わない。
- C-LOCAL-04 owner再QA: 13states×3widthの39casesで `footer.bottom <= 844` と横overflow0を確認。`corrections.json` は全順位20人のparticipant/Host、Host切断・長い名前・3widthの実操作でscrollY不変を確認。1280/390/305pxのHost button bottomは `809/815/815`、footer bottomは `825/831/831`。
- 親の独立MCP製品確認（305×844px）: `event-many-ranks` で全順位を実clickしPLAYER20まで一覧scroll、content scrollHeight `1290 → 2090`、footer top `780` 固定/bottom `831`。Host全20人・長名でrow20までscroll、scrollHeight `2989`、footer top `750` 固定/bottom `831`、主操作button bottom `815`、Ready操作なしを確認した。
- 親の画像証拠は元rootの `.playwright-mcp/root-ui-305-allranks-scroll-corrected.png` と `.playwright-mcp/root-ui-305-host-next-fixed.png`。最終時は上記source reconciliation gateに従いtask-owned画像を新worktree `.tmp` へ移して保全し、移動先/read-backを追記する。現在は移動済みとは扱わない。
- C-LOCAL-04 dispositionは上記の補正/owner再QA/親独立操作を根拠に `fixed（R5限定）`。残riskはR6の実統合とR7の両最終監査に持ち越し、全製品PASS/R7 COMPLETEへ拡張しない。
- C-LOCAL-03: 既知終了理由3enumの日本語表示をroom/historyで確認し、未知原本保持も確認した。追加で欠場理由2値 `DEADLINE / NOT_PRESENT` のraw表示を同findingの表示だけのscope内でfrontへ補正依頼し、front継続中。storage/API/互換は変更しない。返却とaffected validation後に最終finding判定/R5 commit/R6 GOへ進む。
- current status / stop condition: 記録scopeのみ更新完了。C-LOCAL-03追加補正待ちによりR5 commit/R6 GOを保留。R6/R7最終・全CI・source reconciliationは未完了。

### R5最終checkpoint・local commitとR6実GO

- frontは欠場理由 `DEADLINE / NOT_PRESENT / SKIP / LEFT / KICKED` の日本語表示をroom/historyへ補正し、公開型に合わせたtyped testsで確認した。API/storageには原値を保存し、未知原本保持を維持する。client tests `145 PASS`、lint/build/diff PASS。root型診断はR5対象0件、既知R6 consumerだけ3件でroot全体PASSはまだ未取得。
- 親はC-LOCAL-03/04補正の限定完了を受領し、両findingをR5限定 `fixed` と判定。最終R6/R7の残riskはledgerどおり保持する。
- 親による追加独立製品証拠: ignored `.tmp/issue-188-phase-c/root-ui-r5-corrections.json`。305/390/1280pxのHost全20row・Readyなし・footer bottom `831/831/825`、主操作button bottom `815/815/809` を確認。
- R5 local commit: `10112c37d153b929cd5bbf58cf0a7ecb3f74fafb`（17files、+404/-379）。親が対象17pathsのみstageし、strict UTF-8/no BOM/LF、diff check、index scope checkのPASS後にcommitした。read-backでは本taskだけがdirtyで製品sourceはclean。coordinatorはstage/commitを行わない。
- 親は `/root/front_resume` へR6実GOをfollow-upで送信済み。R6 harness/scripts/testdata/client integrationはfront単独owner。共有helper hiddenの既許可境界、実Tauri可視、task-owned PID/生成物保全を継承する。
- 次のvalidation: R6 source確定後に親の12面full CI相当を実行し、Cargo競合を避けて実Tauri2端末・20 DO接続・合同/大会各2曲、通常ARENA2試合/BPL/BPL4を検証する。これは実施依頼と次checkpointの記録であり、未実行の結果をPASSへしない。
- current status / stop condition: R5 `COMPLETE`（local commit済み）、R6進行中、R7実GO未送信、最終full未実行。今回のcoordinator出力は記録更新のみで停止し、全製品C完了/最終監査完了は主張しない。

### R6 first freeze — 初回統合証拠と最終full開始

- owner `/root/front_resume` がR6の初回source凍結を報告。tracked 6paths: `apps/client/src/services/e2e-scenario-runner.ts`、`scripts/capture-host-event-visuals.mjs`、`scripts/host-event-e2e.test.mjs`、`scripts/run-host-event-e2e.ps1`、`scripts/run-local-e2e.ps1`、`scripts/start-local-two-clients.ps1`。task追記はcoordinator単独scopeとして検証source hash対象から除く。再編集が必要になった場合は親へ通知し、source凍結と検証証拠の対応を取り直す。
- front結果: root typecheck/lint PASS、Host Event integration `6/6 PASS`、PowerShell syntax/diff PASS。R1後から継続したR6旧consumer型診断3件はこのroot typecheck実行で解消した。
- integration対象: 合同/大会各2曲、20 capacity、15人の14提出待機と締切前復帰、次曲deadline/late拒否、旧protocol/Ready action拒否。これは初回integration suite証拠であり、実Tauri2端末・各source・実DO20WSの追加統合証拠をすべて取得したとは扱わない。
- 親の12面full CI相当runnerはsession `17945` で実際に開始し、source manifest/hashを記録済み。現時点agents/design/lint PASS、typecheck実行中。全12面の結果は未受領であり最終full PASSは未確定。
- frontは親のCargo終了を待って競合を避け、ignored helperによる実DO20WS/14-of-15の実統合を継続する。通常実TauriとHost Eventはport衝突を避けて順次実行する。この進行境界を実端末検証の完了と混同しない。
- current status / stop condition: R6進行中、R7最終GO未送信。今回は取得証拠とfreeze/実行開始の記録までで停止。coordinatorは製品source・git index/commitを変更しない。全製品PASS/C完了は未判定。

### R6 local full CI相当 — 12面PASSとsource対応

- 親runner session `17945` はexit `0`、`12/12 PASS`。実行HEADは `10112c37d153b929cd5bbf58cf0a7ecb3f74fafb` とR6 dirty 6source固定内容、finish UTC `2026-10-05T10:47:24`。新仕様oracleを実行したlocal full相当の結果で、hosted CIを実行したとは扱わない。

| 最終local full面 | 結果 |
| --- | --- |
| `npm run check:agents` | PASS / exit 0 |
| `npm run check:design-contracts` | PASS / exit 0 |
| `npm run lint` | PASS / exit 0 |
| root `npm run typecheck` | PASS / exit 0 |
| `npm run build:client` | PASS / exit 0 |
| `npm run test:client-stats` | PASS / 17項目 / exit 0 |
| `npm --workspace @infinitas/client run test` | PASS / 145 / exit 0 |
| `npm run test:worker` | PASS / 187 / exit 0 |
| `npx tsx --test scripts/host-event-e2e.test.mjs` | PASS / 6 / exit 0 |
| Tauri `cargo check` | PASS / exit 0 |
| Tauri `cargo test` | PASS / 20 / exit 0 |
| Worker `npx wrangler deploy --dry-run` | PASS / exit 0、本番deployなし |

- evidence: ignored `.tmp/issue-188-phase-c/final-ci/` の各command log、`results.json`、`validation-source.json`。親はmanifest全current sourceのSHA256一致を確認した。task/docsはhash対象から除外し、記録追記が製品検証sourceの同一性を変えないよう分離する。runner準備時のsyntax/root-path checkもPASS。local Windows/Node22と継承quick/full stepに対するparityを上記12面で満たす。
- 親はfull Cargo終了後にfrontへ実Tauri Cargoの実GOを送信済み。R6 runtime validationはまだ未完了で、実DO20接続/14-of-15、合同/大会各2曲、通常ARENA2/BPL/BPL4、visual captureをownerが継続する。12面PASSはこれらの追加runtime gateを代替しない。
- current status / stop condition: R6 runtime validation継続中、R7最終GO未送信、全製品C未完了。公開・本番drainは未実施でC境界外。今回の出力は結果/証拠対応の記録までで停止し、製品/Git操作は行わない。

### R5 MCP証拠のsource reconciliation完了

- 親はMCP pageをclose後、元root `.playwright-mcp` の今回task-owned生成25filesを内容SHA manifestで確認し、安全な絶対target pathを検証して新worktree ignored `.tmp/root-browser-evidence/r5-mcp/` へMoveした。
- evidence: `.tmp/root-browser-evidence/r5-move-manifest.json`。25filesのSHA一致、元source path不存在、元root `v1` のgit status cleanをread-backしPASS。旧原本/stashの削除は行っていない。上記source reconciliation gateはこのbatchについて `COMPLETE`。
- 画像provenance対応: 元 `.playwright-mcp/root-ui-305-allranks-scroll-corrected.png` → 現 `.tmp/root-browser-evidence/r5-mcp/root-ui-305-allranks-scroll-corrected.png`、元 `.playwright-mcp/root-ui-305-host-next-fixed.png` → 現 `.tmp/root-browser-evidence/r5-mcp/root-ui-305-host-next-fixed.png`。過去の原URL/取得場所は観測履歴として保持し、現保存先はmanifestで追跡する。
- 今後MCPが新batchを生成した場合は同様にtask-owned証拠を保全・source read-backする。今回の移動完了はR6/R7や製品C完了を意味しない。

### R6実端末開始・harness raceと再freeze gate

- frontは実Tauri CASUALのsession `8198` を実際に開始。task-owned Worker `8790` / Vite `1420`、実Tauri2 clientのCargo compileは `.tmp/cargo-e2e` へ隔離している。runtime結果は未完了。
- 発見したharness race: 兼任HostのLOBBY自動開始がHost自身1participantだけで先に進む。親はR6 runnerの最低2participant待ち条件への補正GOを送信済み。製品の1人 `START_EVENT` を拒否する仕様変更ではなく、検証harnessだけを対象にする。補正/再実行の証拠は未受領。
- tracked source再編集の通知を受領したため、上のlocal full `12/12 PASS` は初回freeze内容の証拠として保持する。最終freeze後にsource manifest整合を再取得し、必要なfull再実行で最終sourceとの対応を確認する。前sourceのPASSを再編集後の無条件PASSへ読み替えない。
- 親はR6最小実証境界をfrontへ再掲した: 実Tauri2 client＋補助WSで**同一開催の20枠**を構成する（専任Hostは20枠外、兼任Hostは20枠内）。別室WS20と別室Tauri2を組み合わせてこの条件をPASSにしない。
- ignored supplemental daemon/既存harness最小拡張は計画内として許可済み。新dependency/CI・製品仕様の追加はしない。source3種＋legacy、TECH skip/SOURCE_UNAVAILABLEの証拠対応表もfrontへ要求済みで、結果待ち。
- current status / stop condition: R6 runtime未完了、R7最終GO未送信、C全体未完了。今回は記録scopeの更新のみで停止。再freeze/同一開催20枠/各sourceの不足を暗黙補完せずownerの具体的証拠で解消する。

### R6実画面validation gap — C-LOCAL-05 と再run境界

- 親が同開催20人CASUAL batch `runtime-host-event-casual-20261005-195445` の実成果物をread-only確認。client-a active/event-finalは双方65734bytesの同画像で通常Lobby、client-b final-mobileも通常Lobbyだった。summaryのscreenshots PASSやsnapshot phase=resultだけでは実開催viewを証明できず、現時点の最終visual PASSとしては不採用。
- state/source/WSの2曲進行証拠はその経路の限定証拠として保持し、画面検証だけを未完了へ戻す。R5のeventSnapshot強制view撤去は合意どおりで、検証のために製品force-backを復活させない。
- 親はfrontへR6 harness/E2E observabilityのexplicit navigationと実DOM/画面predicate確認を加え、合同/大会20人の実Tauriを再runする実GOを送信した。必要ならApp E2E-onlyの最小callbackを同frontのR6 ownershipで扱うことは許可済み。通常製品のnavigation仕様は変更しない。
- 別室real DO JSONはUTC `10:54:38` 時点の `6 groups PASS`。4capacity20（types×roles）と15人中14待機/reJOIN/deadlineLate/results2/invalid upsertの証拠を含む。別roomの直接WS検証として有効だが、同開催Tauri2＋WS20のruntime条件と併用して満たしたことにはしない。
- tracked予定の `testdata/e2e/host-event/ws-participants.mjs` WS daemon追加はR6 scope内として事前許可済み。現時点は未追跡のR6成果物として存在する。再編集/追加sourceにより初回full manifestは旧内容の証拠となる。再freeze後にsource整合と必要full再実行を行い、最終commitとの対応を残す。
- current status / stop condition: C-LOCAL-05は未解消、実開催render未完了、R7未開始、最終full再freeze待ち、C全体未完了。今回は台帳/証拠境界の記録のみで停止し、製品/Git操作は行わない。

### R6 visual再検証の中間確認・native viewport gap

- 親が新CASUAL batch `195940` の実画像を独立確認: ACTIVE20cards/footer、Host切断300秒、participant result、final desktopの2曲complete/footerが開催画面として描画され、explicit navigation補正の方向を確認した。fresh全final/大会証拠は未受領でC-LOCAL-05全体はまだ未解消。
- 追加gap: native mobile390pngはsidebar約100px/header一行のdesktop layoutが切られ、footerが見えない。正本Tauri config/test configは `minWidth=1280 / minHeight=900` で、MoveWindowによる外枠390だけでは実WebView viewport反映を証明できない。
- 親はfrontへ実 `innerWidth / innerHeight`、overflow、footer寸法とresize反映後captureを記録する最小補正GOを送信済み。製品configを無断変更しない。検証用生成runtime overrideのminSizeだけ調整する方法、またはnative1280証拠とbrowser305/390 responsive証拠を明示分離する方法は許可済み。clip390native画像をPASSへ読み替えない。
- 親のvalidation gap証拠: ignored `.tmp/issue-188-phase-c/root-r6-visual-finding.json`。画像SHAと同値baselineを保持し、補正後fresh証拠との差を追跡する。C-LOCAL-05の製品forceback復活禁止・harness/E2E-only境界は維持する。
- SOURCE_UNAVAILABLE/TECH skipの不足証拠を補うため、親はfrontへR6内で `apps/client/src/services/event-source-submission.test.ts / source-submission.test.ts` の最小追加を再assignした。同front単独ownerで標準test登録とroot型検査を維持する。新dependency/CI/API形式変更は許可しない。
- 通常実端末E2Eでは親所有Worker `8787` を `SkipWorker` でreuseすることを許可済み。実行結果は未受領。R7最終GO未送信、最終source再freeze/full結果待ち、C全体未完了。
- stop condition: 本taskの証拠/台帳更新のみ完了。実端末最終visual・source failure tests・通常E2Eをcoordinatorが代行/補完せず、各ownerからの結果で判定する。

### C再開2 — 停止確認・actual ownership・証拠ゲート（2026-10-08 JST）

- objective: 既B計画・初回C Kickoff・初回spawn・1回目再開の実績を保持し、停止前のR6差分と未解消findingを引き継いで、同じPhase Cを検証・独立監査・local commitまで継続する。新仕様や公開計画の再定義は行わない。
- success criteria: 実績と予定、検証したsourceと現在source、owner報告と親の独立確認を区別し、V1〜V9・C-LOCAL-01〜05の不足証拠を追跡する。最終sourceに対応するfull相当・R6実端末・R7両最終監査とfinding処置が揃った後だけC完了判定へ進む。
- Stage / affected layers / contract-sensitive / execution profile / Plan Mode: Phase C継続、client/Worker/shared/規範/検証scriptの既計画内全差分、yes / `High-Risk` / required。本taskのbounded計画と初回C Kickoffを継承する。適用規約はroot 3文書と既記録のclient/worker/sharedローカル規約。
- current request ceiling: `implementation-ready / Phase C実装・検証・独立監査・local commitまで`、Implementation authorization: `YES`。allowed outputs now: 引渡し済みownerの計画内最小修正、隔離検証証拠、独立監査報告、coordinatorによる本taskのC追記、親によるscope限定local commit。
- forbidden outputs now: push、PR/Issue等の外部write、merge、deploy、本番drain、仕様/CI/依存/lockfile変更、他owner編集のrevert、旧stash・原本・worktree・branchのdelete/apply。coordinatorは製品/design docs/Git index/commitを変更しない。
- next unlock condition: 実装の追加ユーザー解除は不要。R6 source再freeze→親の最終full相当とsource manifest照合→R6不足証拠の受領/確認→親のR7最終GO→両監査・finding disposition→scope限定local commitの依存gateを維持する。公開・外部操作は別の明示指示が必要。
- 親は再開時のlive agent listが `/root` のみで旧ハンドルが消失し、旧ownerが停止済みと確認してからwrite scopeを再assignした。coordinatorの本task C追記とfrontのR6 scopeは単独ownerを維持し、停止前dirty差分を引き継いだ。初回と1回目再開のspawn記録は上の歴史記録を維持する。

#### delegation execution record — 再開2の実spawn確認

| role / actual agent id | spawned | objective / ownership / 確認時status |
| --- | --- | --- |
| execution-coordinator `/root/coordinator_c_resume2` | yes | 本taskのC追記・証拠台帳整合だけをwrite、記録継続中 |
| front-implementer `/root/front_c_resume2` | yes | R6 harness/scripts/testdata/client observabilityと再assign済みsource testsを単独write、実端末/検証継続中 |
| contract-auditor `/root/contract_c_resume2` | yes | R0〜R6全差分/正本/証拠の契約監査をread-only準備中、R7最終GO未送信 |
| implementation-auditor `/root/implementation_c_resume2` | yes | R0〜R6全差分/視覚正本/証拠の実装監査をread-only準備中、R7最終GO未送信 |

- 根拠: 親が4 actual idの実spawn/read-back、全4担当 `gpt-6.1-sol / fork none` と上記ownership/statusを通知した。coordinatorも自身/front/contractのlive存在を確認した。監査担当の準備・spawnを最終監査実行済みとは扱わない。
- server-implementerの初回/1回目再開とR3 `COMPLETE` は上の実績を保持する。再開2は新serverをspawnしていない。現在Worker write taskはなく、監査でWorker修正が必要になった場合は親が元roleへbounded scopeを再assignする。coordinatorから再委譲なし: 親が分割した単一task記録scopeで再分割不要。
- front packetのin-scope追加確認: 既R6の6tracked paths、事前許可済み `testdata/e2e/host-event/ws-participants.mjs`、E2E-only `apps/client/src/app/App.tsx` のnavigation/observability最小callback、再assign済み `event-source-submission.test.ts / source-submission.test.ts`。製品のforce-backを復活させず、通常navigation/source/API形式は維持する。
- allowed side effects / continue-without-escalation boundary: 各ownerは既R6/R7 packet内の最小修正・typed tests・実検証・証拠更新を自走可。検証生成runtime overrideのminSizeだけを305pxまで調整し、実 `innerWidth / innerHeight`・overflow・footer/主操作寸法・capture反映を証拠化する許可を持つ。製品Tauri configの変更、clip画像を実viewport検証へ読み替えることは不可。実Tauriは可視、helperはhidden、停止対象はtask-owned PIDだけ。
- expected output / stop condition: 各ownerは `COMPLETE/BLOCKED/ESCALATION`、実command/結果、source・画像/DOM・finding証拠と残riskを返す。coordinatorは受領済み実績の記録までで止まり、親の最終GO前にclosing appendやC全体COMPLETEを書かない。

#### 再開時点の履歴・環境・進捗のread-back

- local HEADを `10112c37d153b929cd5bbf58cf0a7ecb3f74fafb` とread-back。E0固定#189 `90856a4` の履歴merge `f87f05a`、R0 `36a6c7d`、R1 `ede3b3c`、R2 `6e11dc0`、R4 `3c17193`、R3 `88a16a8`、R5 `10112c3` はcommitted成果として保持する。R6と本taskの後続追記はdirtyのまま引継ぎ、R6 commit済みとは扱わない。
- 親の再開前確認ではlocal検証7portsにlistenなし、旧検証processは停止済み。これは再開前の状態であり、以下の新ownerによるruntime起動へ更新される。旧 `8787 / 18821` を稼働中として無条件reuseしない。
- 親は元root `v1` clean、既存stash2件・旧worktrees・試作原本の保持を確認した。R5 MCP25filesは既記録のSHA一致moveと `.tmp/root-browser-evidence/r5-mcp/` 保存を維持し、旧原本削除0。新batchのsource residueが生じた場合はtask-owned証拠を保全しread-backする。
- 前の利用制限で一度停止したが、停止前にはR5 commit、初回freezeのlocal full `12/12 PASS`、実runtime validation gapの発見と最小補正証拠取得が進んだ。同じ未解消gateの反復だけを根拠にno-progressと判定しない。現在は2026-10-08の再開記録として継続する。
- 初回full `12/12 PASS` はHEAD `10112c3`＋旧6dirty source/旧manifestの証拠。その後のApp callback/source tests/daemon/harness再編集を含む現在sourceの最終PASSへ適用しない。親の最終runnerは分離batchで実行可能な準備状態だが、現在sourceに対する最終full結果は未取得。hosted CIも未実行。

#### C-LOCAL-05とV1〜V9の継続checkpoint

- C-LOCAL-01/02はR4限定、03/04はR5限定 `fixed` を維持し、最終R6/R7の全consumer・実統合検証の残riskを保持する。**C-LOCAL-05は未解消**であり、現在のC完了を阻害するvalidation gapとして継続する。
- `195445` の通常Lobby画像はvisual証拠として不採用。`195940` の開催desktop描画は親確認済みの限定証拠で、native390のclipはmobile PASSにしない。E2E-only explicit navigation/DOM predicate、生成runtime overrideだけのminSize補正、actual viewport/footer/captureが新検証境界。
- 親経由でfrontのCASUAL batch `200630` actual DOM報告を受領: 全captureのpageは `event-room`、LOBBY/PICKING/ACTIVEは20cards、desktop `inner1280×900 / footer881`、mobile `inner374×805 / footer792`、horizontal overflow false。ownerのsummary/DOM報告であり、親のfresh画像独立確認前なのでC-LOCAL-05を `fixed` としない。
- frontのfresh TOURNAMENT runはsession `50134` で実開始、Worker `8790` / Vite `1420` は新helper自身の所有。親はCargo競合を避けて待機する。開始実績のみであり、TOURNAMENT結果・通常ARENA2試合/BPL/BPL4の3実端末結果・新captureの結果はまだ未受領。

| 残gate / 対応V | 必要な取得・判定 | 現時点の扱い |
| --- | --- | --- |
| R6同開催20枠と各2曲 / V1・V2・V8 | CASUAL/TOURNAMENTの実Tauri2＋補助WSを同じ開催へ接続し、3役割/人数/Readyなし・実view/overflow/主操作と履歴を証拠化 | CASUAL owner報告受領・親fresh画像確認待ち、TOURNAMENT実行中 |
| R6例外/各source / V3・V4・V5・V7 | 14/15待機・締切前復帰/後拒否、Host切断/再JOIN、history再読込/無効upsert、3source＋legacy、SOURCE_UNAVAILABLE/TECH skipを各command/test/実証へ対応 | 既pure/直接WS/owner限定証拠を保持、新source failure testsと最終対応表待ち |
| 通常回帰 / V1・V6・V9 | ARENA2試合、BPL、BPL4実端末と既Worker経路の証拠を分け、開催変更が通常Ready等へ波及しないことを確認 | 通常3実端末結果未受領 |
| 最終local/CI parity / V1〜V9 | 最新tracked/untracked source SHA256と12面full相当、標準test登録/root型検査、継承quick/full CI stepの保持とlocal commit内容照合 | 親runner準備のみ、旧full PASSの適用禁止 |
| R7両最終監査 / V6・V9および全V | 親の最終GO後にcontract/implementation両最終報告、finding→disposition→evidence→remaining risk、Blocker/Must fix処置を取得 | 両担当準備中、最終GO/最終結果未取得 |

- Replan Gate: 新仕様判断、契約/互換/依存/CI/resource拡張、通常仕様変更、参照不能、ownership衝突、必須検証不能が生じたら影響packetを停止して親へ `ESCALATION`。合意内のharness・証拠補完は上のcontinue境界で継続する。
- 記録更新の状態: `COMPLETE`（今回の再開/取得済み証拠記録scope限定）。R6 runtime・現在source最終full・R7両最終監査・C-LOCAL-05は未完了、Phase C全体は未完了。coordinatorは製品/Git/外部操作を行わず、次の親/owner実績受領を待つ。

### 再開2追加checkpoint — CASUAL実画像確認とC-LOCAL-06候補

- 親が2026-10-08にCASUAL batch `200630` のclient-a ACTIVEとclient-b final-mobile実画像を独立確認したとの通知を受領。20cards、未公開結果のprivacy、footerを確認し、mobile actual `inner374×805 / footer792`、横overflowなしのDOM証拠と対応した。上の「親fresh画像確認待ち」はこの限定範囲で解消。CASUAL batch全場面の再確認やfresh TOURNAMENT/new captureの完了へ読み替えない。
- C-LOCAL-05 disposition: 引き続き未解消。CASUALのexplicit navigation/actual viewport補正は上の画像確認を部分証拠とし、fresh TOURNAMENTとcaptureの確認が揃うまで `fixed` にしない。初回clip390画像の不採用と、製品config/force-backの変更禁止は維持する。

| ID / severity | finding -> disposition / owner | evidence / remaining risk |
| --- | --- | --- |
| C-LOCAL-06 / Must fix候補 | implementation-auditorが曲別順位カードのself欠落を報告。`EventFinalReview.tsx` の `rank !== null && rank <= 3` 抽出だけでは4位以下・欠場の自分のカードが表示されず、「上位3人＋必要なら自分」と差異がある。親は同一front ownerへ最小表示修正を追加assign済み、修正/検証返却待ち | 正本 `issue-188-draft.md:82`、規範 `05_screen_list.md:498`、保存試作 `prototype/event-host-led-prototype.html:368/369` のtop3＋own。coordinatorも現抽出と試作のown追加をread-only照合。候補受領のcheckpointでありR7最終verdictではない。修正・typed回帰・viewport再確認・最終source fullと監査は未取得 |

- actual ownership更新: `/root/front_c_resume2` に `apps/client/src/features/event/EventFinalReview.tsx` と必要最小の関連tests/visualを追加assignした親実績を受領。既 `EventFinalReview.test.tsx` のtyped回帰とR6 visualで扱い、親/coordinator/auditorはread-onlyを維持する。新ownerのspawnや他scopeのtakeoverは行っていない。
- bounded objective / success criteria: 上位3人を維持し、プレー参加者のselfが上位に含まれない場合は4位以下・欠場のselfカードも一度だけ表示する。専任Hostの架空selfを追加しない。詳細表のHost全順位/参加者周辺＋全順位切替、同順位の同強調、欠場理由/値と大会pt、0結果表示を維持し、上位内selfの重複を防ぐ。
- validation / expected output: 公開typeに沿う4位以下self・欠場self・上位self重複なし・専任Host・同点の最小回帰、標準client unitとroot型検査の対象含有、関連lint/build/diff、および1280/390/305pxでカード/表/footer/overflowの影響証拠をfrontから受領する。source変更を最終manifest/fullへ反映し、implementation-auditorの再確認へ渡す。結果未取得をPASSへしない。
- allowed side effects / continue-without-escalation boundary / stop condition: 合意した結果表示内の最小抽出・表示・typed tests/visual補完まで。順位/pt計算、Wire/storage shape、source/通常対戦仕様、CI/依存を変更しない。仕様判断やscope拡張が必要なら親へReplan、packet修正検証返却で停止。R7最終GOはまだ未送信でclosing appendは行わない。
- status: `COMPLETE`（本追加記録scope限定）。C-LOCAL-06候補は未解消、C-LOCAL-05・R6不足証拠・現在source最終full・R7両最終監査も継続中。前checkpointのlocal commitまでのceilingと禁止境界を維持する。

### C再開3 — coordinator再assign・取得済み証拠のcheckpoint（2026-10-08 JST）

- objective / success criteria: 既B・初回C・再開1/2の履歴を保持して、停止後に取得したR6実績をsource別に追跡し、V1〜V9とfindingの最終判定に必要な残gateを明示する。今回のstop conditionは本task Cの記録更新まで。親の全gate成功GO前に最終closingやC全体COMPLETEを書かない。
- Stage / affected layers / contract-sensitive / execution profile / Plan Mode: Phase C継続、既R0〜R6のclient/Worker/shared/規範/検証scope、yes / High-Risk / required。本taskと合意draft、publication保存試作・prototype-review、root/local規約を継承する。
- current request ceiling / Implementation authorization: `implementation-ready / Phase C実装・検証・独立監査・local commitまで / YES`。allowed outputs nowは元ownerの既合意内最小補正・検証・独立監査、本coordinatorのC追記、親のscope限定local commit。forbidden outputs nowはpush、GitHub全write、PR/Issue/merge/deploy、本番drain、仕様/CI/依存/lockfile変更、他owner差分revert、旧stash/branch/worktree/原本のapply/delete。coordinatorは製品/design/Git index/commitを変更しない。
- next unlock condition / dependency order: downstream実装のユーザー解除は取得済み。frontのfresh両type再runとsource freeze、親の最終full/manifest照合、両R7最終GO/結果/finding処置、scope限定local commit、C closingの順にgateを満たす。公開/外部操作は別の明示指示が必要。

#### delegation execution record — 再開3の実在・ownership

| role / actual agent id | spawned | ownership / 確認時status |
| --- | --- | --- |
| execution-coordinator `/root/coordinator_c_resume3` | yes | 停止済み旧coordinatorから本task C追記だけを再assign、証拠記録中 |
| front-implementer `/root/front_c_resume2` | yes（再開2の同handle継続） | R6と追加assign済みC-LOCAL-06の単独writeを継承、fresh再検証中 |
| contract-auditor `/root/contract_c_resume2` | yes（再開2から継続） | read-only準備COMPLETEのみ、最終R7 GO/製品verdict未 |
| implementation-auditor `/root/implementation_c_resume2` | yes（再開2から継続） | read-only準備COMPLETEのみ、最終R7 GO/製品verdict未 |

- 根拠: 親が旧coordinator handle消失/停止確認後に本scopeを再assignし、coordinatorはlive agent listで上記4 actual idとstatusをread-backした。全担当のsticky modelは `gpt-6.1-sol`。同frontはusage errorによる一度停止後、親がUTC 13:47の継続で同handleへscopeを再assignし再開した実績を受領。親/coordinatorの製品writeはない。serverの初回/再開とR3 COMPLETEは既履歴を保持し、新server spawnはない。
- 本coordinatorのallowed side effects / continue-without-escalation boundary: task Cのappendとread-only証拠/Git照合、自身のignored検査証拠だけ。既合意内の記録は自走し、新仕様/互換/CI/依存判断、ownership衝突や証拠不足がある場合は親へESCALATION。No-delegate reason: 親に分割済みの単一記録scopeで再分割不要。他owner差分は保持する。
- read-back: HEAD `10112c37d153b929cd5bbf58cf0a7ecb3f74fafb`、branch/worktreeはE0記録どおり。E0 merge `f87f05a` と開始 `64c640f`・固定#189 `90856a4` 両parent、R0〜R5のlocal commitsを保持する。R6とC追記は未commitで、最終source/commitと旧証拠の一致を未確定のまま保持する。親確認の元root `v1` clean、stash2件、worktrees5件と試作原本は保全継続。旧session `85109` はmissing、旧task-owned helpers/listeners消失を親が確認済みとの通知を受領し、旧sessionを稼働中としてreuseしない。

#### R6実績の取得根拠・source境界

- normal-runtime実績: ignored `.tmp/issue-188-phase-c/normal-runtime/results.json` をcoordinatorがread-back。ARENA `reflux-reflux-full / matches=2` はUTC `00:15:07→00:19:54`、BPL `mixed-daken-v3-notebook / matches=1` は `00:19:54→00:23:31`、BPL4同scenarioは `00:23:31→00:29:00`、3runともexitCode 0。通常create→Ready→pick→play→resultの実端末証拠として受領し、全例外をこの3runで実行したとは扱わない。
- 補助の通常境界: owner記録 `.tmp/issue-188-phase-c/r6-owner-summary.md / r6-validation-evidence.json` はproduction直接importのignored補助tests 70/70 PASS、公開型fixture `.mts` の明示 `npx tsc -p .tmp/issue-188-phase-c/tsconfig.normal-supplement.json` PASSを報告。duplicate譜面差替えとSKIP_HOST_ASSIGN拒否は補助assert、TIMEOUT/FORCE_ADVANCE/ROOM_STATE_LOSTは標準Worker testsへ対応する。補助testsを実端末での当該例外操作証拠にしない。
- native限定証拠: `testdata/runtime/e2e/host-event-casual-20261008-090950` / `host-event-tournament-20261008-091219` の両client state/eventsをread-back。両typeとも20participants・20eligible・公開結果2曲・両client historyReloaded=true、最終event-room描画のDOMはdesktop1280×900/footer881、mobile実inner374×805/footer792、横overflowfalse。親はbackgroundLobbyと2曲finalの実画像をactual view済みと通知した。CASUALは専任Host＋19補助WS＋実参加者、TOURNAMENTは兼任Host＋18補助WS＋実参加者の同開催証拠で、別室realDOの6groupsとは分ける。
- nativeログのgap: 上記両batchの `event_background_submission_started` は起動直後lobby、roundId/roundStatusがnull。CASUAL client-bと大会両clientの後続 `event_background_submission_accepted` は実第2曲roundId・lobby・server SUBMITTEDを持つが、startedログを第2曲の開始証明に使わない。親は同frontへ最小oracle補正後、fresh両type再実行と最終freezeを実GO済み。上記batchは限定有効証拠として保持し、補正後sourceの最終PASSへ流用しない。
- `.tmp/issue-188-phase-c/root-r6-native-confirmation.json` は親のactual image view/SHA記録だが、記載大会は旧090040まで。新090950/091219の親viewは今回の親通知と当該runtimeを根拠として区別する。通常Lobby/stale startup/別app/外枠390clipの不採用batchは既記録とowner記録を保持し、再採用しない。
- visual fixture: `.tmp/issue-188-phase-c/r6-visual-final/manifest.json` の5状態×1280/390/305px=15caseでrole/state assert、horizontalOverflow=false、mainActionVisible=true、footer781/831をread-back。`.tmp/issue-188-phase-c/r6-self-cards-scrolled/manifest.json` のself10/欠場/top3/ties×3幅=12caseはself1枚、全順位click後20rows、scrollY0、footer781/831。4位以下/欠場selfは4cards、top3selfは3cardsで重複なし。これは公開fixtureのrender/操作証拠で、実server順位/pt計算や20端末通信の代替証拠ではない。
- ownerのclient153、lint/root型、integration6、PowerShell3syntaxとsource failure tests結果はowner報告/ログhashの限定証拠として受領。両source tests/FinalReview testは標準client test登録とroot型面を担い、tmp補助fixtureとmjsは明示コマンドで補完する。旧full12PASSは旧6dirty source/manifestの実績で、現在のApp/runner/scripts/tests/daemon差分を含む最終fullへ適用しない。hosted CIは未実行。

#### finding disposition checkpointとV1〜V9残gate

| finding / severity | disposition / evidence | remaining risk |
| --- | --- | --- |
| C-LOCAL-01/02 / Must fix | R4限定fixedとcommit/testsの既記録を継承 | 現source fullとR7全consumer最終照合待ち |
| C-LOCAL-03/04 / Must fix | R5限定fixedと日本語理由/viewport/実操作証拠を継承 | 最終統合・R7再照合待ち |
| C-LOCAL-05 / Must fix・validation gap | navigation/actual viewport/capture補正、親の両type新実画像viewとDOM/2曲/historyの部分証拠取得 | started nullのoracle補正後fresh両type・source freeze/full・R7が未のため最終fixed未 |
| C-LOCAL-06 / Must fix候補 | frontのtop3＋必要self最小補正・typed testsと12case/all ranks操作証拠受領 | 親の最終source fullとimplementation-auditor最終再確認前、最終fixed未 |

| V | 今回の取得済み証拠と経路区別 | 残gate |
| --- | --- | --- |
| V1 | 別室realDOのcapacity、同開催native20枠2type、normal3run | fresh両type/source対応とR7最終 |
| V2 | R2/integrationの対象0・LEFT/KICK/pending・Readyなし、native各2曲、15case20cards/主操作 | oracle補正後fresh/full/R7 |
| V3 | 別室realDO14/15・復帰/締切/late拒否、4source×2metric/replay/障害typed tests、native第2曲actualLobby中SUBMITTED | started誤log補正後freshと最終full、各source実parser/unit対応をR7照合 |
| V4 | R2固定N/同点/欠場数値、realDO invalid upsert、R4同期、fixture欠場0pt/同強調/0曲 | fixture値を数値正当性証拠にせず最終R7で対応確認 |
| V5 | R2/R3 fake-clock300秒直前/一致/超過・alarm/復元、realDO/native短Host断/reJOIN | 実時計300秒待ちとは区別しR7期限/復元経路照合 |
| V6 | protocol1/旧Ready拒否・両方向fail-closed/秘匿の標準tests、nativeACTIVE非公開画像、normal3runの通常Ready | 現sourcefullとR7全channel/consumer監査 |
| V7 | browser v1/v2/未知/保存失敗/原本保持unit、Rust v2 save legacy保持、native両client再読込/2曲schema2 | fresh/source対応・最終Rust/full・R7照合 |
| V8 | R5入口/戻る/役割/確認操作、native両type実view・backgroundLobby、15case3幅主操作/overflow | freshnative/finalsource・R7視覚正本最終照合 |
| V9 | R0規範/R5確認量・前曲無効化、C06 self12case/全順位click、通常境界の標準＋補助検証 | R7両最終GO/報告・finding処置、local commitと最終C closing |

- Replan Gate / risk notes: 新仕様・契約互換・CI/依存/resource変更、通常仕様の変更、参照不能、ownership衝突、必須検証不能はaffected packetを止めて親へESCALATION。合意内のoracle/証拠補完は既continue境界で自走する。hostedCI、本番drain/deploy、全OS/DPI/読み上げは未実施で、C検証と公開gateを分ける。
- checkpoint status: `COMPLETE`（本再開3記録scope限定）。Phase C全体・fresh両type/runtime source freeze・現source最終full・両R7最終監査・C-LOCAL-05/06最終disposition・R6 local commit/closingは未完了。親の全gate成功GOを受けるまで最終closingを追記しない。

### R6 final freeze・local commit・R7 FINAL GO checkpoint（2026-10-08 JST）

- objective / success criteria / stop condition: 親から取得したfresh両typeとcurrent-source full/commit対応を実績として記録し、両R7最終GOを実行recordへ更新する。今回の停止は記録更新まで。両auditor返却・親の全gate成功GO前にR7/C最終COMPLETEやclosingを記入しない。
- 実行境界: Phase C / High-Risk / contract-sensitive yes / Plan Mode requiredを継承。current request ceilingはR7独立監査とscope限定local commitまで、Implementation authorization YES。allowed outputsは単独ownerによるC追記とread-only照合、自身ignored proof。forbidden outputsは製品/design/index/commit編集、外部write/公開/merge/deploy/drain、旧stash/worktree/branch/原本apply/delete。他owner差分は戻さない。next unlock conditionは両最終監査返却・finding処置・親GOで、外部操作は別明示指示が必要。
- R6 owner `/root/front_c_resume2` は担当範囲COMPLETE、12files freeze後source編集停止。最終owner記録は `.tmp/issue-188-phase-c/r6-owner-summary.md` SHA256 `E4E7C85A298D1C3412BFE44AED3A751E8FA63227B1CC74F8C85C8E2ACD49F4C4`。coordinatorもSHA一致をread-backした。最終runtime証拠は同directory `r6-final-runtime-evidence.json` SHA256 `C2F71183A183E27E001FAB5CDD3B7D27C14939C4DFAEDFD7A95AA53C1849339E`、sourceは `r6-source-freeze.json`。当時HEAD10112c3＋dirty freezeで実行した証拠で、下記commit後の一致を別に照合した。
- 親のscope限定local commit実績: C-LOCAL-06表示/tests2pathsは `c79a3b771fca36c7173d7775f3cf6663b4dcd7fe`、R6の10pathsは `98ae4a9ec31faacb4abdbdb5f8fc5cc940841e7a`。coordinatorもHEADと両commit statsをread-back。実装writeはfront、Git commitは親が担当した。本task C追記だけがdirtyであり、文書commit/最終closingは未実施。

#### fresh両type・native・normalの最終検証証拠

- 最終batchは `testdata/runtime/e2e/host-event-casual-20261008-225436` と `host-event-tournament-20261008-225717`。coordinatorはruntime証拠の両clientをread-backし、各type内で同じroom/event ID、20participants、2曲各20result rows、両client history reload2曲、native schema2 JSON2曲/COMPLETEを確認。CASUAL event `c05875e2-1aaf-4359-92ea-ab2c3cdabc47`、TOURNAMENT `f70ff465-f6db-4a4f-9555-e2c011b99516`。専任Host＋19補助WS＋実参加者／兼任Host＋18補助WS＋実参加者を同開催の実Tauri2と対応する。
- 各11枚、計22 native画像とDOM/log/state/補助WS/nativehistory SHAを最終runtime証拠に保持。desktop実inner1280×900/footer881、native外枠390の実inner374×805/footer792、横overflowfalse。305/390/1280のbrowser15caseとC06 self12caseはfixtureのrender/実click証拠として分離し、native305や実順位計算を行ったとは扱わない。
- 起動直後null started誤logをfrontが最小補正し、fresh両runの第2曲actualLobby/PLAYING/ACTIVE/CONNECTEDでroundId非nullの開始が1回、same round server SUBMITTEDへ対応。CASUAL Bはround `21b1d476-2130-4052-b09a-44ecdb4820a1` UTC13:56:14→13:56:24、大会Bは `e62cee30-75b6-4070-b2fa-ab7551c135e0` UTC13:58:53→13:59:03。大会兼任Host Aもsame roundで背景提出受理。実reflux observationと受付ログを保持し、seat/intentionalexitを変更していない。旧null batchは履歴/限定通信証拠として保持する。
- 親の独立actual image view通知: fresh CASUAL背景Lobbyと2曲final mobile、TOURNAMENT A20card/非公開ACTIVEと2曲final mobile、self10 narrow・欠場mobile・tiesdesktopを実閲覧。ownerの実画像view/DOM assertと親確認を分けて受領。C-LOCAL-05/06の補正と影響検証はこの証拠で最終監査へ渡すが、独立R7 verdictは未取得。
- normal3実Tauri exit0（ARENA2試合/BPL/BPL4）、補助70testsと公開型fixture明示tsc PASS、4source×2metric/unit/parser/replay/障害TECH、browser v1/v2/未知/原本保持/保存失敗は既記録とowner最終報告の具体path/commandsに対応する。実nativeは3source、Host断は短いreJOIN、300秒境界はfake-clock、通常例外は標準Worker/補助testsへ対応し、実端末で全部行ったとは扱わない。
- task-owned runtime helpersのfinally停止/空きread-backは `r6-runtime-cleanup.json` UTC14:00:47、指定8ports listen0、Cargo/rustc/client/該当helper0をownerが報告。これは実行processの終了で、旧worktree/branch/stash/原本のcleanupではない。

#### current-source local full・CI parity・commit対応

- 親の最終fullは `.tmp/issue-188-phase-c/final-ci-r6-20261008-late/results.json`、UTC14:05:25〜14:06:06、12/12 exit0をcoordinatorもread-back。resultsのHEADは実行当時10112c3で、dirty sourceを `validation-source.json` の472files SHA256へ固定した。commit後親のSHA照合0mismatch、coordinatorの同manifest対現source472files照合も0mismatch。本taskはmanifest対象外で、記録appendによる製品source変更はない。

| local full相当command | 実結果 |
| --- | --- |
| `npm run check:agents` | PASS |
| `npm run check:design-contracts` | PASS |
| `npm run lint` | PASS |
| root `npm run typecheck` | PASS |
| `npm run build:client` | PASS |
| `npm run test:client-stats` | PASS 17項目 |
| `npm --workspace @infinitas/client run test` | PASS 153/153 |
| `npm run test:worker` | PASS 187/187 |
| `npx tsx --test scripts/host-event-e2e.test.mjs` | PASS 6/6 |
| `cargo check --manifest-path apps/client/src-tauri/Cargo.toml` | PASS |
| `cargo test --manifest-path apps/client/src-tauri/Cargo.toml` | PASS 20tests |
| worker cwd `npx wrangler deploy --dry-run` | PASS |

- CI parity: E0継承workflowのWindows/Node22、PR quick/tag/manual full、design-contract/client unit/Host Event integration、full cargo check/test/build/Wranglerを保持。coordinatorもworkflowの該当stepとNode22/quick-full接続をread-only再確認した。root型面と標準列挙testがtouched3testsを含み、mjs/ignored typedfixtureは明示実行で補う。新依存/lockfile/CI変更なし。hosted CIは未実行で、上記はlocal full相当。旧full12PASSを今回の完成証拠へ流用していない。

#### delegation execution record — R7 FINAL GO実送信

| actual auditor / ownership | 実績 / status |
| --- | --- |
| `/root/contract_c_resume2` / R0〜R6全差分・正本・証拠のread-only契約監査 | 親がHEAD98ae4a9/source manifest/fresh証拠でR7 FINAL GO送信済み、running / final pending |
| `/root/implementation_c_resume2` / 同全差分と視覚正本・V1〜V9のread-only実装監査 | 親が同HEADでR7 FINAL GO送信済み、running / final pending |

- 根拠: 親の実GO送信通知とcoordinatorのlive agent read-backで両runningを確認。将来予定や準備COMPLETEを最終監査完了へ読み替えない。最終finding→disposition→evidence→remaining risk、CR-01〜07とC-LOCAL-01〜06の最終判定は両返却後に集約する。
- status / remaining gates: `COMPLETE`（本証拠/GO checkpoint記録scope限定）。R6/current-source full/source-commit整合/local製品commitは取得済み。R7両最終verdict、未処理Blocker/Must fixゼロの確認、親の全gate成功GO、C最終closingとtask local commitが未。High-Riskの本番drain/公開・hostedCI/全OS-DPI-読み上げは別gate/残riskとして保持。Replan/continue境界は前節どおり。

#### R7 GO後の親追加visual確認

- 親がfresh TOURNAMENT225717の `artifacts/client-b.event-background-submission.png` を実画像toolで独立閲覧し、通常Lobby・公開room0・通常対戦sidebar activeと「開催へ戻る」を確認した通知を受領。上のCASUAL確認と合わせて、**両最新typeの背景Lobby画像を親もactual view済み**。背景での開催接続/提出維持は同roundログ・server SUBMITTEDと組み合わせる証拠であり、画像だけで受付成功を判定しない。
- 両R7最終verdict/親の全gate成功GOは未受領のまま。coordinatorは最終closingやC全体COMPLETEを記入せず、製品/外部/Git操作なし。

### R7契約最終監査受領 — 実装最終待ち（2026-10-08 JST）

- objective / success criteria / stop condition: 正式FINAL GO後の契約最終verdictと全finding処置を、準備/途中報告から分けて記録する。親から `/root/contract_c_resume2` のimmutable製品HEAD `98ae4a9ec31faacb4abdbdb5f8fc5cc940841e7a` に対する最終報告を受領。statusは **COMPLETE / pass-with-followups**、未解消Blocker/Must fix 0、新規契約finding 0、missing updates 0。実装監査の最終返却と親の全gate成功GOが未のため、今回のstopは契約結果記録まで。C最終closingはNO。
- 現境界: Phase C / High-Risk / implementation-ready、R7とscope限定local commitまでの既ceilingを継承。coordinatorはtask C append/read-only/self ignored proofのみ。製品/design/index/commit、push/GitHub全write/merge/deploy/drain、旧stash/worktree/branch/原本apply/deleteは禁止。next unlockはimplementation最終返却・全finding処置・親GOで、追加のsynthetic実装許可を要求しない。
- 契約分類は開催専用breaking v1→v2。protocol/live snapshot/DO record/history新保存を2へ同期し、通常protocol/minimum client/Readyを維持。旧/未知開催はfail-closed、history1 readerは原本保持、DO1の自動移行なし。drainは公開gateとして分離し、Cに未処理Must fixがあるという意味ではない。
- 最終独立検証: client関連55/55、Worker関連85/85 PASS（fail/skip/cancel 0）、ignored `.tmp/issue-188-phase-c/r7-contract-client-98ae4a9.log / r7-contract-worker-98ae4a9.log`。coordinatorも末尾件数/結果をread-back。auditorは472source manifest、12freeze files、34runtime hashesとpeer2件を照合し全mismatch0と報告。fresh両type同event20枠・各2曲20rows、native4history COMPLETE、CASUAL B/TOURNAMENT A・Bの非null第2曲actualLobby→same round SUBMITTED各1を独立read-back済み。V1〜V9の契約証拠を確認した正式最終結果で、準備COMPLETEとは区別する。
- 親のcommit後固定証拠 `.tmp/issue-188-phase-c/root-final-readback.json` もcoordinatorがread-back。472SHA一致/full12PASS、当時dirty freeze→製品commit内容同一、本taskをmanifestから除外、開始64c640fと固定#189 90856a4両ancestor、元root v1 cleanとstash2件保持、productionOperations noneを確認。JSONのR7 pendingは保存時UTC14:15:13時点の記録であり、契約最終受領は本追記で更新する。

#### 契約側最終finding台帳 — finding → disposition → evidence → remaining risk

| finding | 契約側最終disposition | evidence | remaining risk / 境界 |
| --- | --- | --- | --- |
| CR-01 / 開始集合 | fixed | `event-room-state.ts:795 / :1314` の対象0拒否、CONNECTED/DISCONNECTED保持・LEFT/KICK/pending除外、固定N。R2/tests・fresh20枠各2曲 | 実20Tauri総起動は行わず2実Tauri＋補助WS。実装監査最終待ち |
| CR-02 / version・新旧consumer | fixed | strict protocol/snapshot/DO/history2、create/JOIN/capabilities/guard、旧/未知拒否・通常Ready維持。独立client/Worker tests | 公開時client/server切替はdrainゲート後 |
| CR-03 / schema1稼働record | Cコードfixed、公開gate分離 | `event-room-controller.test.mjs:412` の全5phase schema1拒否/原record保持、ROOM_STATE_LOST、再初期化/cleanup拒否、DO1自動変換なし | 本番旧接続/復元可能record不存在、terminal retention1800満了、原本保持rollbackを公開前に実証。C Must fix残ではない |
| CR-04 / history互換 | fixed | history専用DTO、v1 byte/key保持、メモリ内ready除去、v2 key/`.v2.json`、標準unit/Rust test、fresh両type両端末4nativeJSON schema2/2曲/COMPLETE | 全OSの保存環境差は未総当たり、旧JSON自動走査はscope外 |
| CR-05 / authority・操作時期 | fixed | readsyncをmutationPending前に許可、Host断中提出のみ、PICKING前曲invalid、Kick後受理済結果保持、古socket/権限試験とR5操作証拠 | 実装監査の役割UI/確認量最終照合待ち |
| CR-06 / 新oracle・検証面 | fixed | 標準client/Worker test entries、root型面、fresh非null第2曲background oracle、472SHA/freeze/commit/full12対応、独立55+85 | hosted CI未実行。local full相当と区別 |
| CR-07 / source維持 | 維持確認、fixed | parser authority再実装なし、4source×2metric unit/replay/障害、Rust20、実端末3source・expected_keyと最初の有効提出 | 全source×metric実端末総当たりは未。unit/parser/nativeの分担で確認 |
| C-LOCAL-01 / snapshot shape | fixed | required top/nested strictshape fail-closedのR4補正/tests、独立client55と最終full | 実装監査最終待ち |
| C-LOCAL-02 / pending中read | fixed | read action判定優先のR4補正、STATE_GET/RESULTS_GET回帰、独立client55/full | 実装監査最終待ち |
| C-LOCAL-03 / raw enum | fixed | 既知終了/欠場理由の日本語labels、storage/API原値維持、R5 tests・最終full | 未知原本は保持、実装監査の表示最終待ち |
| C-LOCAL-04 / 主操作viewport | fixed | 内部scrollとfooter固定、R5親実操作、R6 15case/C06 12case footer/overflow・fresh actualviewport | 全OS/DPI未、実装監査最終待ち |
| C-LOCAL-05 / native実描画gap | fixed | fresh両type計22native images、DOM/pixel/actualviewport、親actualview、background非null2曲受理とhistory4件、invalid旧batch不採用保持 | 実Tauri2＋補助WS、native305とはしない、実装側最終判定待ち |
| C-LOCAL-06 / top3＋self欠落 | fixed | commitc79a3b7、top3＋必要self/欠場理由0pt/重複なし typedtests、self12case実click/all20rows・親画像view | fixtureの架空値を配点証明にせずR2数値試験と分離。実装最終待ち |

- 残riskは20実Tauri同時起動、実時計300秒待機（fake-clock299999/300000/300001ms＋短実断で分担）、全source×metric実端末総当たり、hostedCI、全OS/DPI、公開drain/1800秒retention/原本保持rollback未実施。これらを契約未処理Blocker/Must fixや公開成功へ読み替えない。既合意continue/Replan境界を維持する。
- delegation execution record更新: contract auditorは正式R7 **COMPLETE / pass-with-followups**、implementation auditorはfinal pending。coordinatorの本記録scopeはCOMPLETE。R7全体/C closing/task local commitは、implementation返却と親全gate成功GOまで未完了のまま。

### Phase C final closing — 両R7最終結果とlocal停止（2026-10-08 JST）

- objective / success criteria: 合意draftの7製品AC、V1〜V9、13findingの処置、各ownerの実成果/監査/検証とlocal commitを一つの現在状態へ集約する。既B・初回C・過去再開/pending checkpointは当時の歴史として全byte保持し、このclosingだけを最終技術判定の参照先にする。
- 親がimplementation最終verdictを受領して**C final closing GOを実送信**。coordinatorは受領後に本記録を確定した。Stage Phase C、execution profile High-Risk、contract-sensitive yes、Plan Mode required（既bounded Bと実C Kickoffで充足）、root/local適用規約とsticky全subagent gpt-6.1-solを継承する。
- current request ceiling: `implementation-ready / Phase C実装・検証・独立監査・local commitまで / Implementation authorization YES`。allowed outputs nowは本最終task C追記と親のこの文書のscope限定local commit/read-back。forbidden outputs nowはpush、GitHub全write、PR/Issue作成更新close、merge、deploy、本番drain、旧worktree/branch/stash/原本のdelete/apply、新仕様/CI/依存/lockfile変更。他owner差分を戻さない。coordinatorは製品/design/index/commit/外部操作を行っていない。
- stop condition: R7/localまでで停止。**技術gateは全COMPLETE、本closing artifactもCOMPLETE。残る本taskのlocal記録commit/read-backを親が実行した時点でPhase Cを終了する。** 記録commitの自己参照hashは本文へ先取りせず、親の最終commit read-backを確定証拠とする。next unlock condition: 公開/PR/外部操作/Phase D等は別の明示指示と各gateを要する。実装解除を再要求しない。

#### delegation execution record — 両R7 FINAL返却

| role / actual agent id / owner | immutable監査対象 / 正式最終結果 |
| --- | --- |
| contract-auditor `/root/contract_c_resume2` / read-only契約監査 | 製品HEAD `98ae4a9ec31faacb4abdbdb5f8fc5cc940841e7a`、COMPLETE / pass-with-followups。未解消Blocker/Must fix0、新規契約finding0、missing updates0 |
| implementation-auditor `/root/implementation_c_resume2` / read-only実装監査 | 同HEAD、COMPLETE / pass-with-followups。未処理Blocker/Must fix0、新findings0、責務境界違反0、V1〜V9必要証拠充足/必須validation gapなし |
| front-implementer `/root/front_c_resume2` / R6＋追加C06単独write | freeze済みCOMPLETE、source停止・runtime終了。上の初回R4/R5と各再開履歴も保持 |
| execution-coordinator `/root/coordinator_c_resume3` / task C単独append | 本closing COMPLETE。製品/Git/外部writeなし、記録handoff後停止 |
| 親 `/root` / R1・Git・全gate判定 | 全gate成功GO済み、製品commits/freeze照合済み、本task記録commit/read-backだけ残る |

- implementation独立検証は重点127/127＋guards/replay/sync15/15＋通常補助70/70＝**212/212 PASS**、公開型fixture明示tsc PASS。coordinatorも `.tmp/issue-188-phase-c/r7-implementation-independent-tests.log / r7-implementation-guards.log / r7-normal-supplement.log` のpass/fail/skip/cancel件数をread-backし、`r7-normal-fixture-type.log` は診断出力なし・exit0を親の最終報告で受領した。contract独立client55/55＋Worker85/85、local full12面PASSは前節記録どおり。
- implementationは472current-source SHA mismatch0、36native image/state/event/history/peer hash mismatch0、C06 typed/12case自己1枚・top3自己時3cards/他4cards・全順位20行/footerを再照合した。self10 narrow/欠場mobile/tiesdesktopをactual viewし、保存試作の曲・中央カード・footer・右情報・狭幅2列・selfに対応すると判定。E2E-only navigationとruntime-only minSizeに限定し、製品force-back/normal波及なしを確認。contractの34runtime hashes＋peer2、親のfresh両type背景/最終/大会ACTIVEとself画像actual viewは、それぞれ別確認面として保持する。
- normal ARENA2試合、BPL3stage、BPL4の実TauriとReady/replay/sourcealias/history、標準/補助のduplicate/TIMEOUT/FORCE_ADVANCE/SKIP_HOST_ASSIGN/ROOM_STATE_LOSTを独立確認。実端末と標準/補助testsの経路分担を維持し、架空fixture・短実断・native2台をそれ以上の実証へ拡張しない。

#### 7製品AC → 実装・最終証拠・V対応

正本は `docs/ux/issue-188-redesign/issue-188-draft.md` の「製品に求める観測可能な受入条件」。R0の規範対応表は保持し、最終実装/証拠を次のとおり対応する。

| AC / 観測可能な結果 | 実装 / 最終証拠 | V / 判定 |
| --- | --- | --- |
| 1 Top通常を保持、専用作成/参加/履歴、画面移動と退出を区別 | R5 App/Sidebar/Entry/Create/Join/History、R4参加排他と接続維持。R5親実入力/戻り操作、fresh両type actualLobbyで接続/自動提出→開催復帰、独立実装監査 | V1/V7/V8/V9 PASS |
| 2 Ready/連続設定なし、曲/対象/次曲待ち/Host待ち、正常連続無操作 | R1開催SET_READY撤去、R2eligible投影、R4 App全体source監視/replay、R5役割view。integration6、4source×2metric、fresh同開催20枠・各2曲・非null第2曲background受理 | V2/V3/V8 PASS |
| 3 確定譜面/対象1人/Host接続で開始、休憩切断保持、対象0拒否 | R2 state/controller、R5server対象数/Host操作。pure CONNECTED/DISCONNECTED/LEFT/KICK/pending/0試験、fresh20対象、source/Host短実断とfake-clock | V2/V3/V5/V8 PASS |
| 4 14/15未提出を待つ、締切確認1人、実行後欠場0pt/N維持 | R2締切/配点、R5確認と欠場表示。15人pure/別室realDO14/15→締切/late拒否、R5確認操作、C06欠場0pt/理由、固定N数値tests | V3/V4/V8/V9 PASS |
| 5 一時復帰は同曲初回提出可、締切後不可、枠保持、LEFT復帰次曲 | R2/R3session/対象受付、R4reconnect/source/replay。pure＋realDO同曲reJOIN/deadline/late、freshHost断中受付、古socket/idempotency、LEFT/pending試験 | V2/V3/V5/V6 PASS |
| 6 専任source/自己カード不要、兼任自己状態と全体操作、参加者Host操作なし | R4専任source不要、R5Host/participant境界、C06 top3＋必要self。3役割tests/visual、CASUAL専任とTOURNAMENT兼任実Tauri、20cards/秘匿ACTIVE/participant final、両監査 | V1/V2/V8/V9 PASS |
| 7 未公開score/順位秘匿、同点/N/欠場/300秒/無効期間/完全部分維持 | R2集計/期限、R3全channel秘匿/復元、R4history DTO/v1 reader/v2保存、R5結果。pure数値/299999・300000・300001ms/controller全channel、realDO invalid upsert、history unit/Rust20/fresh4native完全、0曲/同強調fixtureと両監査 | V3/V4/V5/V6/V7/V9 PASS |

#### V1〜V9 最終PASS・証拠の面

| V | 最終採用証拠 / 経路 | 最終判定 |
| --- | --- | --- |
| V1 | R2容量/役割、R3非公開lobby、別室realDO4capacity、fresh2type同開催native2＋補助WS20枠、normal3run | PASS |
| V2 | authoritative eligible/0/LEFT/KICK/pending、Readyなしintegration6、fresh各2曲20結果/役割view | PASS |
| V3 | pure/realDO14/15・締切前復帰/後拒否、4source×2metric/replay/SOURCE_UNAVAILABLE/TECH、fresh非null2曲背景受理 | PASS |
| V4 | 固定N・1/1/3・欠場SCORE0/MISSCOUNT9999/0pt数値試験、invalid revision/upsert、0曲/同強調/欠場fixture | PASS |
| V5 | fake-clock300秒直前/一致/超過、alarm/復元/ROOM_STATE_LOST、短い実Host断/reJOIN（実時計300秒待機とは区別） | PASS |
| V6 | protocol/未知/新旧両方向fail-closed、秘匿全message/ACK/reJOIN/RESULTS、malformed guard、normalReadyと実ACTIVE画像 | PASS |
| V7 | browser v1/v2/未知/破損/原本保持/保存失敗、Rust legacy JSON保持、fresh両type両端末reload/schema2完全2曲、通常stats | PASS |
| V8 | 保存試作対応、R5入口/実入力/戻り/3役割、3幅15caseとfresh22native実DOM/pixel/主操作/接続維持 | PASS |
| V9 | R0 7規範、R5確認表/前曲無効化/結果全順位/C06 self12case、全fullと両独立最終監査/finding処置 | PASS |

#### 13finding 最終台帳 — 両監査の処置・証拠・残risk

| finding | 最終disposition | evidence | remaining risk |
| --- | --- | --- | --- |
| CR-01 / Ready gate・開始集合 | fixed | R2 state795/1314対象0拒否・切断保持・LEFT/KICK/pending、pure/fresh20×2 | 2実Tauri＋補助WSでの20接続、20実Tauri総起動未 |
| CR-02 / breaking version・consumer | fixed | v2 strict同期、create/JOIN/capabilities/guard、旧/未知拒否、通常Ready維持、両監査 | 公開切替はdrain後 |
| CR-03 / DO1復元 | Cコードfixed、公開gate分離 | controller.test412全5phase原本保持/fail-closed/ROOM_STATE_LOST、自動移行なし | 本番drain/旧record・接続不存在/1800秒retention/rollback未。C Must fix残ではない |
| CR-04 / history live依存・互換 | fixed | 専用DTO、v1 reader/key/byte保持、v2 key/JSON、unit/Rust、4nativeCOMPLETE | 全OS保存差の総当たり未 |
| CR-05 / UI authority・readsync | fixed | pending前read許可、Host断提出のみ、PICKING前曲invalid、Kick済提出保持、R5操作/独立tests | 合意外の操作/仕様拡張なし |
| CR-06 / 旧oracle・検証面 | fixed | 新oracle/標準entry/root型面/fresh非null背景、full12/472SHA/freeze/commit/両監査一致 | hostedCI未実行、local full相当 |
| CR-07 / source維持 | 維持確認、fixed | parser authority再実装なし、4×2unit/Rust/replay、実3source、source failure/TECH | 全source×metric実端末総当たり未 |
| C-LOCAL-01 / required snapshot shape | fixed | strictshape補正/R4 tests/独立55/full/両最終確認 | 未知版fail-closedを維持 |
| C-LOCAL-02 / mutationPending read | fixed | read判定優先/R4 policy tests/replay-sync独立/full | authoritative同期を維持 |
| C-LOCAL-03 / raw理由enum | fixed | JP labels/room-history typed tests/storage原値保持/両監査 | 未知原本保持 |
| C-LOCAL-04 / footer押出し | fixed | 内部scroll/R5親操作/3幅capture/C06全順位scroll/freshactualfooter | 全OS/DPI未 |
| C-LOCAL-05 / native画面gap | fixed | fresh22native/DOM/親実view/非null2曲背景/4history、旧invalid不採用保存、両監査 | native実inner374×805、305はbrowser面、2Tauri＋補助WS |
| C-LOCAL-06 / selfカード欠落 | fixed | c79a3b7 typedtests、self12case自己1/top3自己時3cards/他4、欠場理由0pt・全20行/scroll/footer/親＋auditor実view | fixture値を配点証明にせずR2数値面と分離 |

- 両最終verdictは全13findingについて上の処置を確認し、未処理Blocker/Must fix 0、必須validation gap 0。`pass-with-followups` の残riskを未処理findingの暗黙延期にしない。新しいfollow-up Issue番号や公開操作を作っていない。

#### E0〜R6履歴・local成果・保全の最終read-back

- E0は開始最新v1 `64c640fab3a4e03a0a7fe8f71b9bf259be675167` に固定#189 `90856a42d9e199b49d97966e1dd620e6b626b5dd` を履歴mergeした `f87f05a7bc07e1b70dd1cc97e846625ecbce0572`。coordinatorも両ancestorの到達性をexit0で最終確認。87files旧差分/CI保持、E0 quick8面は旧Ready baseline再現として保持し、新7ACのPASSはR0〜R7の上記証拠による。
- local logical commits（coordinatorがgit log read-back）: R0 `36a6c7d`、R1 `ede3b3c`、R2 `6e11dc0`、R4 `3c17193`、R3 `88a16a8`、R5 `10112c3`、C06 `c79a3b771fca36c7173d7775f3cf6663b4dcd7fe`、R6 `98ae4a9ec31faacb4abdbdb5f8fc5cc940841e7a`。依存checkpointとownership引渡しの実施歴を保持する。
- 最終製品HEADは98ae4a9。local full当時HEAD10112c3＋frozen dirty contentとcommit後sourceを472files SHAで0mismatch確認（親root-final-readback＋coordinator再照合＋両auditor）。12freeze/typedtest標準entrypoint、native/log/保存原本証拠の整合を確認。本taskはmanifest対象外なのでこのappendで製品再freeze/テスト再実行を必要とする製品変更はない。
- 元root v1 clean、保全stash `issue-188-phase-a-b-originals-published-pr-191` と `codex-pr3-before-sync`、既存worktrees5件・旧branch・試作原本を保持。R5 MCP25filesのSHA一致reconciliationは既履歴を保持。実runtime process終了はtask-owned PIDだけで、元WIP/原本/stash/worktreeのdelete/applyは0。parent read-backを保全根拠にし、coordinatorはcleanupを実行していない。

#### 最終現状・停止境界

| 面 | 現在状態 / 完了証拠 |
| --- | --- |
| 7製品AC / V1〜V9 | 全PASS、上の実装/経路対応、必須gapなし |
| 13finding | 全処置済み、未処理Blocker/Must fix0、両監査が確認 |
| 両R7独立監査 | COMPLETE / pass-with-followups、契約55+85・実装212＋typedfixture、immutable98ae4a9 |
| local full / CI parity | 12/12 PASS、472source一致、標準test/root型＋mjs明示面。hostedCI未実行 |
| local製品commits | E0〜R6/C06全read-back、最終98ae4a9、両ancestor維持 |
| 元root/旧資料/WIP | v1 clean・stash2/worktrees5/原本保持、未知/user-owned process停止なし |
| 本closing artifact / 最終文書commit | artifact COMPLETE・親GO済み。親によるtask限定local commit/read-backだけ残る。完了後Phase C停止 |
| ceiling / 禁止操作 | R7/localのみ。push/GitHub/PR/Issue/merge/deploy/delete/applyなし・禁止継続 |
| 公開gate・残risk | 本番drain/1800秒retention/旧record接続不存在/原本保全rollback未実施。hostedCI/全OS-DPI-読み上げ/実時計300秒待機/全source×metric native総当たり未。公開許可/成功とは扱わない |

- Replan Gateは新仕様/契約互換/CI依存/resource判断、ownership衝突、証拠不整合、新Must fixの発見でaffected packet停止・ESCALATION。既scopeの記録を締めた現在、coordinatorは追加実装/監査/公開へ進まず停止する。
- final closing artifact status: **COMPLETE**。技術gate全COMPLETE、親の最終task local commit/read-backをもって本Phase Cを終了する。古いpending checkpointは履歴として保持し、現在のpendingは上表の記録commitだけ。
