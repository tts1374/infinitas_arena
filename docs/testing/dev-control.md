# #192 開発コントロール基盤・検証記録

## 最新状況（2026-10-28、軽量フローで再開）

以下を最新記録とし、後段のPhase/T2記録は履歴とする。branchは `codex/issue-192-dev-control`、製品基点は #188 の `0dac1b0`。`c1e6950` で #206 を暫定適用した。旧定義46ファイルはbyte一致のarchiveへ退避し、通常参照するCustom Agent/project Skillは0。Playwright・製品CI・製品/UX資料を保持。#206のmerge・正式移行は行っていない。

- 再開時の81 WIPファイルは `.tmp/issue-192-resume/before.json` にhash付きで記録。削除なし。既存2 stash、他worktree/branchを保持。#207のReceiptLedger修正は現在のファイルを正本として確認し、101件成功の基点を再確認した。再実装していない。
- native復元/停止/新session、atomic保存、process/port所有権、CIM中の消失、HTTP.sysのv3 readiness、専用build/asset/WebView loader、controller再表示/独立存続、main終了通知、受付相関を補正した。
- focusはnativeの実確認を根拠とし、製品WS受付と区別する。broker消失時は所有台帳と確認tokenを使う限定停止を許し、既存の証拠・元sourceを保つ。
- 実v3が文字列の外部譜面IDを送ることを実プレーで確認。人間の承認を得て、曲マスタの曲名/SPDP/難易度が完全一致・一意・全件取得済みの場合だけ内部数値IDへ正規化した。数値ID不一致/欠落、不正な小数ID、曖昧/未完/取得失敗は拒否する。模擬v3も文字列IDへ合わせた。製品WS/shared/snapshotのschema変更なし。
- 画像はUI threadを止めずに取得し、撮影中の機密表示/context変更を監視する。安全確認まではnativeメモリに保持し、拒否/期限超過/別ID/再利用ではspoolへ確定しない。独立レビューのprivacy TOCTOU指摘に対処した。実画像の統合確認とは分ける。

| 検証 | 結果・限界 |
| --- | --- |
| client標準unit | 178/178 PASS。v3通常/合同/大会、文字列ID、一意性/失敗/旧context、画像の一時private→safeを含む |
| 開発control標準unit | 114/114 PASS。停止前native保存の成功/partial/失敗/期限切れ・古い受付拒否を含む。`test:dev-control` を既存Windows CIへ登録 |
| native Rust | 33/33 PASS。停止前bundle相関・read-back、停止との競合・409拒否時の状態/証拠保全、Reflux空baselineの非観測/重複排除、メモリ画像の安全確認/破棄/期限/再利用拒否を含む |
| CI面 | root typecheck/lint、check:agents/check:design-contracts、client build PASS。Worker187、Host Event integration6、stats17は同再開作業でPASS、Worker dry-run成功（deployなし） |
| script構文 | mjs全件node --check、PS4件ParseFile PASS |
| rendered UI | 既存試験用seamとPlaywrightで初回/稼働中read失敗の再試行、terminal後poll停止、孤立runtime停止dialogを確認。凍結corrected画像/操作表を維持。mock成功をnative受理とは扱わない |
| 独立レビュー | receipt/atomic保存/復元/所有権/source/focus/画像privacyを別contextでread-only確認。重要な指摘は修正・再検証し、実証が残る部分を下記へ分離 |

| 実Windows session | 実証 |
| --- | --- |
| `s20261028092709-1de2a0d1` | 合同/B inf-notebook。実watcher/parser→SUBMIT→ACK→同曲snapshotを2曲連続（同譜面/同値）で確認。新入力前の再提出なし。B main公開SCORE400を目視。保存bundle/停止後記録保持、process/port完全停止 |
| `s20261028095536-4055e8a2` | controller hide→再表示。broker異常終了後に実所有process/port停止を確認し、独立read-only shellからnative restartで次sessionへ。旧証拠保持 |
| `s20261028115543-e052f72c` | 合同/A実v3の `.59 SPA` EX1086/MISS2は読み取り済み・数値ID不成立で未提出。B模擬v3はSUBMIT/ACK/同曲SUBMITTEDを確認。保存は画像欠損をpartial表示。停止時PID再利用を拒否し、offline再列挙で元process/port完全停止を確認 |
| `s20261028122911-91eb9842` | 修正後のA実プレー `.59 SPA` EX1094/MISS1を実v3から提出、normalize成功/SUBMIT/accepted ACK/同曲SUBMITTEDを確認。文字列IDのBも実parser→SUBMIT→ACK→SUBMITTED、両者提出後にround RESULT。A mainの公開結果でA1094/1位、B400/2位を実画像で確認。native保存のA画像も開いて同結果を確認。Bは旧privacy判定で欠損を表示しpartial保存。このsessionのbinaryはメモリ画像確定変更前 |

未完: 3source×通常/合同/大会のnative全経路、ARENA/BPL/BPL4の全進行、全異常/再接続の実GUI確認、停止前bundleの自動flush/read-back（独立確認でMust fix、修正中）。大会の実プレー2曲、メモリ画像確定保存/撮影途中の機密切替、release実行時拒否/通常起動は10/29に実証（下記）。単体/モック成功だけで #192 全体を完成扱いしない。

再開時はこの最新欄と現在の `AGENTS.md` / `QUALITY.md` を読む。元のWIPやstashをreset/上書きせず、対象sessionの `launch-state.json` / `manifest.json` / `controller-spool/state.json` を照合する。停止済み記録は `scripts/start-dev-control.ps1 -ReopenFrom <sessionのmanifest.json>`、新sessionはUIの確認付きrestartを使う。元A sourceはread-onlyを維持し、過去全日入力を証拠へ収集しない。PR merge/Issue close/deploy/releaseは未許可。

### 2026-10-29 再開

本人Aは現在参加不可。本人操作/実プレーを代行した成功記録は作らず、自動確認可能な範囲を進める。`91eb9842` のruntime/portは全終了していたがspoolはquiescingで途切れていた。専用ReopenFromで旧controllerを独立起動し、native readbackがstopped/complete・processesVerified/portsVerified trueを確認。停止後も前日のA実画像・受付ログを保持して新bundleへ再保存できた。旧shutdown.jsonは欠落としてpartialを維持した。

PR #208 の初回CIは追加broker試験の一時directory親が存在せずENOENTとなった。試験側に明示mkdirを追加し、空の作業directoryから既存broker testを実行して25/25 PASS。製品検査の削除・緩和なし。

`265d027` のPR CIは成功（run `40791136947`、check `123176357024`）。`s20261029000125-62374cff` は本人Aを未入室のまま保持し、B実client/Refluxで開催開始→選曲→入力→parser→SUBMIT→accepted ACK→同曲RESULT/500→開催終了を確認した。Aの代理操作や実プレー成功とは扱わない。B mainの「開催へ戻る」で実結果を開き、メモリ画像の確定保存とPNGの内容一致を確認。Aの入力画面はprivacy拒否のためpartialを正しく表示。最新capture B `3ce07624-9141-4f19-9841-d33ef4d2609b`、bundle `bundle-1793232474097421600`。

同sessionを実UIの確認から停止し、約9秒後にstopped/complete、process/port確認済み、errorsなしを確認。shutdown.jsonのincomplete/remaining/remainingPortsはいずれも空。元sourceプロセスは起動も停止もしていない。

`s20261029001104-47d06cd5` の起動で、owned frontendのTCPはlisten済みでも最初のHTTPが5秒内に準備できず失敗する事象を確認。終了後のowned process/port残存なし。HTTP timeout/abort/接続一時失敗/5xxだけを既存60秒期限内で再probeし、4xx・不正JSON・capability/content不一致は即拒否する修正を追加。各probeで所有PID/path/作成時刻を再照合し、TCP/HTTPを残時間で制限、応答後も期限を照合する。期限後の正しい応答も採用しない負例を含む2/2 PASS、独立レビューの期限指摘を修正・再確認済み。script全体109/109 PASS。

配布相当のrelease build（production assets、専用identifier `com.infinitas.arena.verify.issue192`、通常profileから隔離、bundle公開なし）を実起動し、通常ロビーが表示されることを確認。WebView2のlocal CDPから実IPCで開発command12種を呼び、すべて `Development control is unavailable in release builds` を返すことを確認。restartは正しいversion/options DTOでも同じ拒否。無効なrestart DTOの引数拒否だけをrelease guard成功の根拠にはしていない。テスト用APIはloopbackの未使用先で、製品roomへ接続していない。probe process/子processは所有identityを照合して終了し、debug port消失を確認。既存 `match_history_window.rs` のrelease警告2件は目的外のため変更していない。

その後本人が参加可能となり、曲は固定せずこちらで変えて選ぶ方針を確認。`s20261029001325-3b68e611`（大会、A実v3/B実clientの模擬v3/C headless）でAを開催前に入室、名簿とN=3を固定。第1曲5.1.1. SPAのA実結果244/MISS647をaccepted ACK/同曲SUBMITTEDと照合、実mainでB600/3pt、C450/2pt、A244/1ptを確認。Cを切断→同じ人として再接続し、epoch更新後も確定450・SUBMITTEDを保持。第2曲24th Century BOY SPHではA1811/MISS2とB/Cのautoを新曲として受付。A mainの最終結果は2曲完全記録、専用profileの保存documentもschema2/COMPLETE/ended/N3/名簿3/2曲、総合B5pt・A4pt・C3ptを確認した。

同sessionでnative `dev_control_capture` の実request開始を既存Playwrightから観測後、Bを設定画面へ切替→すぐ開催画面へ戻した。B capture `fe5efa80-ebd9-45fe-b335-70ffb29f5113` は「画像取得中に画面が変化」でmissingとなりPNG不存在。安全画面へ戻しても復活しないことを実native経路で確認。両窓が安全な状態で再保存するとmissing[]/savedとなり、最終結果bundle `bundle-1793233753153950000` を作成。runtime停止は約11秒、errors[]・process/port消失を確認。native画像/IPC試験ではBrowser plugin不在のため既存Playwrightで実WebView2へlocal CDP接続した。新しいharnessや依存は追加していない。

`s20261029002846-23896aa8` のBPLは3ステージ完走。A実v3でMENTAL MELTDOWN SPA 2289/MISS102、24h Endurance Race SPH 1949/MISS16、GALGALIM SPA 1954/MISS31を各曲の実送信/受付と照合。Bはinf-notebookの実watcher/parser経路から毎曲500/MISS10。最終RESULTは3/3曲、A3勝・B0勝で、実mainと公開結果が一致した。10/29夕方の再開時はアプリ終了済み、停止途中のspoolと全結果を保持している。

停止前bundle不足を補正。quiesce/収集後、停止ID・期限付きでnativeの新bundle flush/read-back受付を待つ。保存失敗/期限切れでも停止を続け、spool/旧bundleを保持する。独立レビューの外部collect再開・古い失敗上書き・nativeとbrokerの全state置換競合を修正し、稼働中の保存結果はbrokerのみが確定する。再レビューで未解決Must fixなし。停止後の保存・再試行は従来のnative経路を維持。実nativeの最新修正版での停止確認は継続中。

夕方のARENA `s20261029094734-d7fdfe8c` で、B/Refluxの曲切替時に架空baseline曲によるNB-UNRESOLVED-ALIAS dialogを実確認。供給側のbaselineをプレーでない空objectへ補正し、製品parserは変更していない。supplier7/7と既存Rust parserを通る空入力→実結果→空入力→旧結果再配信の試験がPASS。初期化/失効で架空aliasを作らず、古い結果を新規扱いしない。独立レビューPASS。次の起動で実GUIのダイアログ不在と2曲連続受付を確認する。

同ARENAはA実v3/B実Reflux/C・D headlessで4曲完走（match `03abbd5e-5d50-4bbd-bc25-d79204c236cb`）。AはLittle Little Princess SPA 2457/MISS9、.59 SPH 973/MISS1、24h Endurance Race SPN 961/MISS0、24th Century BOY SPA 2459/MISS15。Bは各700/MISS10。実main/最終RESULTはA8pt・B4pt・C/D0pt。最終画面をnativeで保存し、PNG内容を確認（bundle `bundle-1793268396592638900`、missing[]）。待機室復帰→A本人Ready→操作窓から再戦開始し、新match `4255f596-cac1-4fe9-8922-ffa6410abbd7` のPICKINGまで確認。追加プレーはしていない。操作窓からA実窓の表示/focusもnative確認によりconfirmedとなった。

復帰時の操作結果だけunknownになる不整合を発見。製品snapshotがLOBBYで `current_match_id = room_id` にfallbackするのに、ledgerがnullのみ要求していた。既存契約に合わせ、同室/世代・送信後・LOBBY・current_roundなし・result_ready=falseのときだけ同roomId fallbackも確認する。送信前/別室/別世代/別match/RESULT残存は拒否。broker+receipt70/70 PASS、独立レビューPASS。次の通常モード最終結果で実GUI再確認する。

ARENA停止は約12秒、要求ID一致の新native bundle `bundle-1793268581537080500` を停止前にflush/read-backしてからprocess/port完全停止、errors[]。選曲入力画面の画像拒否をpartialと表示し、前の最終結果画像bundleは保持した。旧controllerからnative restartし、大会/Reflux `s20261029101123-30ce7fff` の起動を確認した（以後の修正を反映したnative保存writer）。

停止そのものが成功しても操作記録で停止要求自身をcancelledとする表示不整合を発見。stop.operationIdで自要求だけ未投入予約の分類から除外し、nativeのprocess/port両方の照合後に同session/controller/操作IDだけconfirmedへ確定する。残存時はunknown、別操作/別session/拒否済みは保持。delivery/evidence25/25、root typecheck、独立レビューPASS。実GUIは次sessionで確認する。

2026-10-24。作業基点は `codex/issue-192-dev-control` / `0dac1b02d3b23d9449d1e63d7ca3f822f98f9e50`。Phase C の責務別checkpoint記録であり、製品全体の受入完了ではない。正本は `tasks/issue-192-dev-control-{window,tasks,validation}.md`、`tasks/issue-192-design-source-manifest.md` と `docs/ux/issue-192-dev-control/control-boundary.md`。

## T2 interface

- controller は `protocol.ts` / `transport.ts` の private DTO を使う。`getDevControlIdentity` / `getDevControlState` / `sendDevControlCommand` / `saveDevControlEvidence` / `restartDevControlSession` を入口とする。roomへの接続は持たない。
- main adapter は自分の native identity で report / adapter-state / poll / finish を使う。adapter-state の `hostClientId` / `hostReady` は、通常roomの最初のJOINを指定Hostへ限定するための観測gate。AのJOIN/製品操作は本人が実アプリから行う。
- 一つのplayerは manifest で `real-client` / `headless` のどちらかだけを持つ。画面あり相手の結果をbrokerから直接WSへ送らない。A宛は focus / state.refresh だけをnative・broker・adapterで許可する。
- supplier はprocessをspawnしない。launcherが `kind=source` / clientId と実identityでmockを台帳登録し停止する。`createSourceSupplier({manifest,clientId,verifyContext})` → `prepareInput` → source-armの単一claim → mainの `armedInputId` report → `supply`。`invalidate` / `stop` を持つ。v3 control file は相手fixtureRootの `today-updates.json`。このT2試験ではsupplier stubを使い、実parser/実sourceの証拠へ流用しない。
- pollは再実行許可ではない。各commandの直前に最新adapter-stateを再取得し、brokerが持つvalue/policy revisionとmainのsnapshot/connection epochを照合する。非同期供給準備/arm/supplyの境界でもcontextを検査する。
- broker単独のschedulerが10秒予約を所有する。期限到達時は `reserved` → `pending` にして単一claimへ進む。未claim予約だけ取消でき、claim後の取消を成功扱いしない。15秒timeoutはunknown、settled operationへの遅延finishは拒否し、新IDで自動再投入しない。
- draftは次回入力であり確定済みsnapshotを変更しない。競合製品操作の返答待ちでもdraft/policyの編集を保つ。unknownの結果投入は同曲へ再投入しない。操作可否の正本照合は凍結operation matrix §3〜6。通常N5接続操作、開催Host自身退出不可、Host断中guest退出不可と有効SUBMIT継続を分離する。
- raw観測はJSONLへ保存し、context、operationId、実client_msg_id/request_id、event revision、受信順を保持する。通常snapshotへ架空revisionは付けない。送信をconfirmedへ変換しない。最終受付相関・unknown再同期・保存停止protocolの完成はT5。

## T2で実施した検証

| command | 結果 / 範囲 |
| --- | --- |
| `npm run typecheck` | PASS。root tsconfigは追加 `src/dev-control/adapter.test.ts` を含む |
| `npm run lint` | PASS、exit 0 |
| `npm --workspace @infinitas/client run test` | PASS 156/156。追加adapter test3件を列挙scriptへ登録 |
| `npm run build:client` | PASS。通常production mode。専用controller実窓の証明ではない |
| `node --test scripts/dev-control/broker.test.mjs scripts/dev-control/delivery.test.mjs scripts/dev-control/scheduler.test.mjs scripts/dev-control/guards.test.mjs scripts/dev-control/processes.test.mjs` | PASS 12/12。10秒fake clock、claim単一実行、claim後取消拒否、timeout後finish拒否、async prepare中epoch変更、A保護、Windows所有identity停止 |
| `node --test scripts/dev-control/peer.test.mjs scripts/dev-control/delivery.test.mjs` | PASS 5/5（delivery4再実行＋peer1）。通常3mode/開催2modeの正規envelope、0を有効値として配送 |
| `node --test scripts/dev-control/broker.test.mjs scripts/dev-control/delivery.test.mjs scripts/dev-control/scheduler.test.mjs scripts/dev-control/guards.test.mjs scripts/dev-control/processes.test.mjs scripts/dev-control/peer.test.mjs` | 最終PASS 14/14。deliveryへsupply await中のstop後unknown維持を追加。停止後beginPeersの再開も防止 |
| `scripts/dev-control/*.mjs` 各 `node --check` | PASS。scriptsはroot TS/lint対象外のため別検証 |
| `scripts/start-dev-control.ps1` / `scripts/dev-control/processes.ps1` の PowerShell ParseFile | PASS |
| native cwd `cargo check --locked` | PASS |
| native cwd `cargo test --locked dev_control` | PASS 2/2。他20件はこの限定commandではfilterされる |
| `git diff --check` | PASS。依存・lockfile・Worker/shared製品変更なし |

client workspace tsconfigは `.test.ts` を除外するため、workspace typecheckだけでは検証していない。追加TypeScript fixtureは公開ContextToken/constructor inputへ `satisfies` を付け、root typecheckと標準testの両面で検証した。Node mjs/PowerShellには別の明示実行面が必要。

## 監査findingの修正対応

| finding | 対応 | 検証 / 残る確認 |
| --- | --- | --- |
| C192-T2-01 | action-policyで通常RESULTの接続操作、開催Host自身/Host断guest退出制限を補正 | delivery test。独立再監査へ返却 |
| C192-T2-02 | 同対象の競合製品操作を返答待ち中は拒否。draft/policy編集は維持 | delivery testのready逆値連打拒否。最終受付解除はT5 |
| I192-T2-01 | delay dispatchをpendingへ遷移しsource-armをclaim可能にした | fake clock10秒→poll1回→supply1回 |
| I192-T2-02 | claim後取消を拒否、settledへのlate finish上書きを拒否 | delivery test。既投入は取消成功としない |
| I192-T2-03 | normal WSのold socket open/message/errorをidentity guardで隔離 | typed adapter test。実pause/reconnectは独立VM/T6 |
| I192-T2-04 | poll後/command毎の最新adapter-state再取得、store接続の同期epoch照合 | root typecheck/client test。deferred pollは独立VM再検証へ |

親から独立再監査の受領結果を確認: C192-T2-01/02、I192-T2-01〜04はresolved。契約担当から最新delivery5/5（supply途中stopを含む）の独立PASS、`pass-with-followups` / T3解禁可を受領した。T2責務checkpointはCOMPLETE。最終全体T7 verdictではない。

C192-T2-N01（Note）は後続foundationへ継続: headlessの `client.focus` availabilityを無効にし、controllerの `state.refresh` をpoll不要の読取へ接続する。T4/T5接続前の同scope最小補正とし、UI fileへは書き込まない。

T1-S01の `WaitForExit(5000)` bool判定は実装済み。timeoutはfailedとしstoppedと記録しない。実runtime停止後のprocess/port read-backはT5/T6。

## 未実証・後続境界

T3の実source3種×通常/合同/大会とSC192-01、T4のUI/visual source照合、T5の通常confirm+snapshot/開催ACK+statusの最終相関とunknown再同期・停止前spool/停止後export、新session、T6のA実プレー・実窓・保存領域/履歴隔離・release直呼び拒否・全runtime停止は、このT2部分checkpointでPASSにしない。A元設定/履歴へのwriteやA代理操作は行っていない。

本checkpointでは見た目の実装を行っていない。UI正本は凍結operation matrixとdesign source manifestで、配置・画像の準拠証拠はT4 ownerが提出する。commit/push/PR/merge/Issue close/deployは実行しない。

## 2026-10-25 foundation依存接点・test登録checkpoint

`source-store.test.ts` の実在を確認し、foundation所有のclient標準test scriptへ追加。root `tsconfig.json` は同fileを含むがclient workspaceは `.test.ts` を除外するため、CIと同じroot `npm run typecheck` とclient標準testを実行した。

| command | 結果 / 範囲 |
| --- | --- |
| `npm run typecheck` | PASS、exit 0。追加source-store fixtureを含むroot面 |
| `npm run lint` | PASS、exit 0 |
| `npm --workspace @infinitas/client run test` | PASS 159/159。source-store 3件を標準実行。source ownerの後続補強後は再確認する |
| `node --test scripts/dev-control/restart.test.mjs scripts/dev-control/delivery.test.mjs scripts/dev-control/broker.test.mjs` | PASS 9/9。restart閉鎖DTO、v3 exact fingerprint arm、停止途中unknown維持などの局所接点 |
| native cwd `cargo test --locked dev_control` | PASS 3/3、20件filter。実restart/release直呼びの証明ではない |

source/UI ownerへの依存照会では、現private DTO/transportとsupplier interfaceの不足は報告されていない。UIの `DevControlView.test.tsx` / `presentation.test.ts` も実在確認後に標準登録済み。UI fixtureのstrict undefined補正後、foundationがroot `npm run typecheck` を再実行しPASS、client標準testは166/166 PASS。UIの後続rendered QAは継続中なので、その完了や実native保存の証拠へ流用しない。

Node supplier/runtime試験はclient標準scriptの対象外なので、T3 ownerの明示実行面を記録する: `node --test scripts/dev-control/sources/supplier.test.mjs`、`node --test scripts/dev-control/sources/v3-runtime.test.mjs`。後者はT3 owner報告で1/1 PASS（23.6秒、Windows相手専用PS mock実起動→supplier→raw WS/replay→停止後port再bind）。foundationの独立再実行結果ではなく、native watcher/parser全9面の実証でもない。

T5全体はT3/T4責務checkpoint待ちで、この時点ではread-only設計調査のみ。受付相関、停止前回収、停止後export/retry/read-only再表示、新sessionの実証は未完。実runtime検証前にraw送受信・snapshot・manifest・log・spool・bundle全体へ保存前の中央redactionを適用し、session認証およびhost/rejoin/resume等の製品secretを保存しない。相関ID/ACK/status/contextを保持し、redactionと取得不能資料を明記する。本人Aの元設定・全日source入力・無関係履歴は証拠へ収集しない。この予定を前taskの実証済み証拠として扱わない。
