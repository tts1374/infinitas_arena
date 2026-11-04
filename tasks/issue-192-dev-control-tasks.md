# #192 bounded delegation packets

正本: [Phase B実行計画](issue-192-dev-control-window.md)。2026-10-23 JST。以下は**delegation execution plan**であり、実spawn記録ではない。

## 全packetの契約

- 現在のimplementation authorized: **no**。current request ceilingはPhase B計画作成まで。T0も含め以下の将来taskは未実行。next unlock conditionは別途ユーザーのPhase C開始指示とC Kickoff。
- non-goals: 親計画の非目的すべて。製品契約再定義、通常/開催FSMの一般化、本番・既存アプリattach、新依存、CI/lockfile変更を含めない。
- forbidden scope: 他ownerのwrite、Phase A原本の改変、無関係整形、生成物直接編集、user WIP破棄、許可外Git/GitHub/deploy、Aへのfixture投入・代理mutation。
- allowed side effects: **C許可後のみ**各packet記載の最小差分と所有session内の検証生成物。本人環境を変更しない。今turnは本packet文書の作成だけ。
- expected output: `COMPLETE/BLOCKED/ESCALATION`、変更path/symbol、success criteria・ACとの対応、実行command/結果/skip理由、design source、`finding → disposition → evidence → remaining risk`、次taskの依存充足状況。結果不明・未検証をPASSと書かない。
- continue-without-escalation boundary: 個別scope内で合意に沿う関数/型分割、同scopeのtyped fixture・試験補完、既存規範への指定整合だけ。隣taskのwrite権限は引き継がない。
- escalation: 規範/製品仕様・source範囲・依存/CI・互換・権限・本人保全を変える必要、参照不能、scope外改修、必須検証不能、未知の既存不整合。理由・影響・選択肢を示して停止する。
- stop condition: 個別success criteriaと必須checkpoint完了、またはBLOCKED/ESCALATION。全体実装完了はT7/AC/QUALITYの結果を統合して親が判定する。

## write ownership / handoff

| owner instance | 排他的write scope |
| --- | --- |
| coordinator | `docs/ux/issue-192-dev-control/**`（承認sourceの凍結copy・制御境界の文書）、`tasks/issue-192-*.md`の将来C記録 |
| front-foundation / front-implementer | `scripts/start-dev-control.ps1`、`scripts/dev-control/**`（sourcesを除く）、新`testdata/e2e/dev-control/**`（sourcesを除く）、native新`commands/dev_control*.rs`/models、`lib.rs`/`commands/mod.rs`、専用capability、`src/runtime/runtime-config.ts`、新`src/dev-control/{protocol,transport,adapter,scheduler,evidence}*`、`services/tauri-bridge.ts`/`e2e-observability.ts`/`e2e-scenario-runner.ts`/WS clientの限定接続点、`app/App.tsx`のadapter接続、`docs/testing/dev-control.md`。専用modeのbuild配線が必要ならclient `vite.config.ts`の限定接点 |
| front-source / front-implementer | `scripts/dev-control/sources/**`、`testdata/e2e/dev-control/sources/**`、`stores/source-store.ts`、`services/source-{observation,submission}.ts`、`services/event-notebook-replay.ts`の必要最小差分と対応tests |
| front-UI / front-implementer | `app/AppBootstrap.tsx`、新`pages/DevControlWindow.tsx`、新`features/dev-control/**`、専用CSS、必要な`styles.css` import、対応UI tests |
| auditors | read-only。監査報告をcoordinatorへ返す。製品/他owner文書の編集なし |

パスは予定追加名も含む。既存ファイルの全体改修権限を意味しない。T1の窓起動nativeはfoundation、T4のAppBootstrap分岐はUI。`app/App.tsx`はfoundationだけ。source担当へe2e runnerやWS clientのwriteを渡さない。

`apps/client/package.json`はテスト登録の共用接点なのでfoundationだけが編集。source/UI担当は追加test一覧を返し、foundationが登録するか明示実行を記録する。`scripts/start-daken-counter-v3-mock.ps1`は既存E2E回帰を保つため変更を既定にせず、source担当が専用wrapper/moduleを追加する。既存mock改修が必要ならそのfileだけsource担当へ明示再割当する。Tauri既存`models`の共用mod等はfoundationだけ。

同じfront roleでもinstanceを識別し、二重所有しない。基本は依存順で逐次実行。T3/T4のmock作業を並行する場合でもwrite scopeと基盤interfaceを固定し、親は実装へ参加しない。Worker/shared製品コードは**所有者なし・変更禁止**、必要ならReplan。

検証groupの参照はtask責務に該当する**部分checkpoint**を示す。後続未実装部分を前taskの完了条件にしない。T1は起動・guard・隔離・部分起動失敗の安全な停止まで（mock供給interfaceはstub可）、T2は操作/予約/排他の単体・adapterまで、T3は実source成立、T4はDTO/mockと利用可能な実経路によるUIまで。T5で停止後保存を接続し、V1〜V9全体と実窓/保存/再起動をT6で再統合する。T1/T2の部分PASSは全ACのPASSではない。

## T0 — 正本・private制御契約を固定

- task label / owner: T0 / execution-coordinator。
- objective: 後続が同じdesign sourceとlocal制御契約を読めるようにする。
- success criteria: 指定branch/HEAD/dirtyを再確認し実行基点を記録。Phase A指定6ファイルと最新corrected 7画像をhash照合して`docs/ux/issue-192-dev-control/phase-a/`へ凍結copy。由来/合意日/旧資料の扱いをREADMEへ記す。必要なfragment/組立器は参考資料として追加し、生成HTMLを編集しない。private DTOのversion、必須識別子、許可action、role、status、timeoutと再同期方針をreviewableな表へ固定。
- in-scope files/layer: 上記coordinator scope。新`control-boundary.md`。製品design規範はread-only。
- non-goals / forbidden scope: WSやsnapshot schemaの更新、試作の状態ジャンプ/固定配列/仮受付の移植。prototypeの全APIコピー。
- allowed side effects: C許可後の参照copy・manifest/制御境界文書のみ。
- validation: [参照manifest](issue-192-design-source-manifest.md)のSHA256、最新correction review、操作表N/Eの全行、product message型を照合。contract-auditorの契約checkpoint。
- continue-without-escalation boundary: private DTO名・file配置・tokenのnullable表現など意味を変えない文書具体化。
- escalation / stop: source欠損/hash不一致/製品契約変更が必要ならBLOCKED/ESCALATION。成功時T1へ。実装しない。

private制御の最低内容（T0で名称だけ具体化可）:

| 境界 | 必須データと制約 |
| --- | --- |
| launch manifest | protocol version、session、source HEAD、runtime root、clientごとのplayer/identifier/role/transport/source・read/write path・port、所有process。秘密tokenは別管理 |
| command | operation ID、session/client/actor/target、固定context token、allowlisted action、draft/policy revision、payload。任意WS/raw file path指定は不可 |
| main adapter poll | 対象clientの未処理commandをclaim、一つの実行owner。重複pollは同じoperation結果を返す。claim後epoch変更は実行拒否 |
| observation | monotonic sequence、context、操作/投入/解析/送信/受信/失敗、元client_msg_id/request_id、snapshot revisionまたは取得順。rawとderivedを区別 |
| result | transport sent、authoritative confirmed/rejected、timeout unknown、cancelled、failedを区別。request再送は既存product規則へ従う |

## T1 — session launcher・隔離・native gate

- task label / owner: T1 / front-foundation。
- objective: 本人環境に触れない、明示した開発起動だけの制御基盤を作る。
- success criteria: 制御専用Tauri shellとlocal Worker/frontend/broker/A/指定実画面相手を所有processとして起動（source mock供給本体はT3）。session/client別identifier・WebView/native/localStorage・履歴・snapshot・log分離、Aの明示source参照read-onlyを確認。manifest/role/window/debug/loopback/token guardを成立させ、通常起動/release/query/偽manifestを拒否。失敗起動は所有分だけ停止し証拠を残す。controllerは同梱DEV専用assetで表示し、検証用frontend停止後も閲覧可能とする。
- in-scope files/layer: foundationのlauncher/broker基盤・runtime・native/capability/bridge。session用Tauri configはruntime内生成。通常配布configは変更しない。
- non-goals / forbidden scope: 既存2client launcher丸ごと起動、既存portサービスへの無検証attach、A fixture初期化、普段履歴の移行、他process停止。
- allowed side effects: 専用client tool/nativeの最小差分、session内生成物、hidden helper process。既存依存を使用。
- validation: V1/V2の基盤部分とV8の部分起動rollback。PS parser、Node構文/基盤test、Rust debug/release拒否試験、全保存先read-back。sessionを2回起動し固定キーの開催履歴も交差しないこと。guardの無効表示だけでなくcommand直呼びも試験。source mockはstubの所有/許可先検査まで、T3供給後とT5停止完成後の統合はT6。
- continue-without-escalation boundary: 既存依存を使うhelper分割、client毎process引数/portの一意化、許可session領域内の生成config。
- escalation / stop: releaseを無効化できない、本人領域へのfallback、process所有証明不能、新依存/OS権限設定変更を要する場合は停止。T1安全性checkpoint通過後T2。

## T2 — 正規操作adapter・対象管理・予約排他

- task label / owner: T2 / front-foundation。
- objective: 操作窓の意図を対象の正規操作へ配送し、手動/auto/delay/既存runnerの競合を防ぐ。
- success criteria: 通常/開催のheadless peerと画面ありmain adapterを実装。各playerに一つの接続owner、A代理mutationはnative/broker双方拒否。Ready/選曲/開始/強制進行/再戦/開催操作はoperation matrixの許可と既存store/WSに一致。接続を意図的に切ると既存自動復帰を抑止し、明示再接続時だけ同一ID/復帰情報で正規復帰。退出は別action。draft/policy/確定値を分離し、broker単独の予約・confirmation token・in-flight排他を成立させる。
- in-scope files/layer: foundationのbroker command/peer/scheduler、private DTO/adapter、App接続、runner/runtime/WS観測の限定接点。
- non-goals / forbidden scope: 独自FSM・別timerによる製品進行、任意WS編集、同じplayerの二重接続、A自動Ready/選曲、画面あり相手の結果直接WS送信。
- allowed side effects: 対象moduleとtest、隔離local session通信、正規create/join/mutation。通常roomのtimerは変更しない。
- validation: V4/V5の操作adapter・予約単体部分、V6の送受信イベント相関interfaceまで。manual専用でも観測は有効、scenario runnerはtimer/subscriptionなし。fake clockの10秒予約、確認取消、連打/重複poll、値/policy/対象/曲/接続/停止変更、非同期処理途中のepoch変更、0未提出、既存リトライとtimeoutの再同期を検証。source実投入はT3、保存はT5、全体統合はT6。
- continue-without-escalation boundary: allowlisted actionのprivate内部名、型付きtoken、既存storeの薄いadapter、既存再同期を用いたunknownの確認。
- escalation / stop: 正規APIにない操作、snapshot/store強制更新、actor/対象の取り違え、WS/shared改変が必要なら停止。contract checkpointでT3へ。

## T3 — 3source隔離供給と開催v3 adapter整合

- task label / owner: T3 / front-source。
- objective: 画面あり相手の任意値を正規watcher/parser/自動提出へ流し、source別に成立を証明する。
- success criteria: notebook/reflux fileとv3 local WSを相手専用領域から供給。起動対応可否を返し、非対応/legacyを拒否。notebook起動baseline→補助recent→summary新着、Refluxのfresh payload、v3空baseline→差分と再接続replay処理を成立させる。**SC192-01**の通常snapshot依存（payload handlerと譜面同定helper）を既定の通常/開催contextへ最小整合し、開催でもキー一致・対象PENDING・初回観測を守る。
- in-scope files/layer: source担当scopeのみ。既存parserは参照・回帰試験対象であり、再実装/意味変更をしない。T2のfixture供給interfaceを使用。
- non-goals / forbidden scope: A書込、dedupe撤去、timestamp/expected_keyガード無効化、source unavailableを隠す、直接WSによる代替、開催Workerのlegacy受理変更。
- allowed side effects: 相手専用file/control payload/mock processと必要最小のsource adapter/test差分。source mockはT1所有manifestで起動・停止。
- validation: V3/V4。3source×通常/合同/大会、同点・連続同曲同値・曲再選択、起動直後/監視再起動/接続再開、遅延中変更と古いpayload再配信、alias解決await中のcontext変更。notebook同秒・partial/ambiguous、Reflux破損、v3battle/無効payload/chart_id欠落、observed/expected不一致、SOURCE_UNAVAILABLE/TECH導線。通常/開催の既存source testsも実行。
- continue-without-escalation boundary: source形式に沿うfixture生成・鮮度管理と規範§8への指定adapter整合。timestamp粒度による待機は投入待ちと表示し、投入/送信済みと偽らない。
- escalation / stop: 主要source除外、dedupe意味変更、legacy有効化、新parser/WS仕様、正規新着を作れず同曲同値ACを満たせない場合は根拠と選択肢を返す。sourceごと実経路証拠が揃うまでT3 COMPLETE不可。contract-auditor checkpoint後T4。

## T4 — 合意済み操作窓を接続

- task label / owner: T4 / front-UI。
- objective: 最新v3/操作表を、実snapshotと制御基盤に接続した別窓として提供する。
- success criteria: 合意配置・名前付き開示・有効主操作最大1を実装。A入力なし、A一覧の役割/接続/提出状態あり。5モードN/E各表示状態、Host/target分離、当該曲集合と固定N、切断/退出/欠場/次曲待ち/返答待ちの理由を表示。開始前/auto/hold/提出後の値編集、現在曲auto適用確認/取消、入力元詳細とsource対応拒否を満たす。試作の状態ジャンプは搭載しない。
- in-scope files/layer: UI担当scope。T1の制御専用processのnative窓をAppBootstrapで専用viewへ分岐。T2/T3のtyped DTOだけを消費し、store authorityを複製しない。
- non-goals / forbidden scope: 未合意の再デザイン、2組入力Noteを理由に値編集到達性を削る、source解析のUI再実装、製品メイン画面の改造。
- allowed side effects: 新UI/CSS/typed UI testsとbootstrap最小分岐。専用build mode条件で遅延loadし通常配布へ機能を露出しない。Vite buildでfalseになるDEVフラグだけを同梱controllerの入口条件にしない。
- validation: V5の表示部分とV7。design source manifest全件確認、対応画面と差分を記録。最新corrected画像と比較、1024/736/320px、1024×700の20人、実2窓配置、keyboardのみで対象/値/確認/設定/保存/再表示へ到達。text/layout/visibility/placement/overflowを確認。T5未接続の保存/停止後表示はtyped mockの状態検査に限定し、実保存完了はT5/T6で検証する。
- continue-without-escalation boundary: 合意意図を変えないcomponent/アクセシビリティ分割、軽微な密度調整。UX-RN-03は同期/用途説明を維持して残リスクを報告。
- escalation / stop: source参照不能、合意の入力時期/情報配置を変える必要があれば停止。未実証のmock表示を実受付と扱わない。visualとinteractionの証拠が揃えばT5へ。

## T5 — 受付相関・証拠保存・再表示/停止

- task label / owner: T5 / front-foundation。
- objective: 操作・source投入・送信・受付/拒否・保存を区別し、停止後も追跡可能にする。
- success criteria: 通常PLAYER_ROUND_CONFIRMED/snapshotと開催ACK/statusの相関を実装。投入物・解析・送信ID・raw受信・実画面・欠落をcontroller専用spool/bundleへ保存し、保存失敗と再試行を表示。hide→再表示、明示停止→予約/供給/検証runtime全process/port停止、新session再起動→旧証拠保持を確認。停止後はroom/source接続なしのcontrollerだけを保持。broker/frontend終了後も限定native writerで記録export/再試行でき、終了窓画像は欠損を表示。controllerから限定native commandでhidden launcherを起動して新sessionを作る。broker停止やadapter切断もunknown/失敗とし、停止中に新mutationを行わない。
- in-scope files/layer: foundationのevidence/broker lifecycle/native書込/観測接点とdocs。UI担当に必要なDTO変更を伝え、UI fileは直接触らない。
- non-goals / forbidden scope: 未確定スコアのメイン/public反映、保存失敗の握りつぶし、取得不能画像を全取得扱い、本人process停止、証拠削除。
- allowed side effects: session配下限定spool/export書込・画像取得・所有検証runtime終了。controller自身は記録UIとして存続し、アプリ終了時はactive runtimeも停止。原本の実source読み取りは停止のみで変更しない。
- validation: V6/V8。遅延/重複/順不同通知、ERROR、unknown→再同期で確認、file権限エラー/容量相当失敗/画像取得失敗、途中停止、再表示、起動失敗時の部分cleanup。停止protocol順序とspool保全、全検証runtime停止後の保存/再試行/新session、controller終了→read-only再表示を確認。write/flush/read-back・process/port列挙でcontrollerだけ残ることを確認。
- continue-without-escalation boundary: 同じartifact schema内の欠落一覧・再試行、sourceと公開結果の分類、既存E2Eへの影響を避ける専用経路。
- escalation / stop: 受付相関が一意に示せない場合はunknownを維持し、必要な製品契約変更を勝手に追加しない。証拠保全/本人領域保護不能ならBLOCKED。T6へ。

## T6 — 統合検証・受入証拠

- task label / owner: T6 / front-foundation（harnessのみ）。
- objective: AC-01〜11を独立した観測根拠で満たし、未実証債務を閉じる。
- success criteria: validation文書のV1〜V9/AC表に実結果・path・run/session ID・source/モード・skip理由を記入。通常全ROUND/手動再戦、開催2種2曲・背景提出・終了後履歴、主要3source、A実連携、期限/復帰/退出、停止/再起動、配布版拒否を確認。QUALITY full面と新規script面を完了。
- in-scope files/layer: foundationのclient tool harness/fixture/検証docs。製品修正はT1〜T5の各ownerへ返す。
- non-goals / forbidden scope: CI greenだけで実機/source確認を代替、未実施ACの合格扱い、失敗したfixtureを弱める、担当外のバグ修正。
- allowed side effects: 所有local sessionでの正規操作・本人が行うA実プレーの読取、証拠生成。本人環境の操作自動化なし。
- validation: V1〜V9すべて。root typecheck・列挙test scriptの面を確認。source担当/UI担当から新test一覧を受け取り、標準登録または明示実行を記録。
- continue-without-escalation boundary: fixture/harnessの不具合補正、欠落証拠の再取得、同一条件の再試験。不合格を別条件へ差替えない。
- escalation / stop: 本人実連携/GUI/期限等の必須検証環境不足なら該当ACをBLOCKEDとし製品COMPLETEを返さない。規約外変更はReplan。成功後T7。

## T7 — 独立契約監査・実装品質監査

- task label / owners: T7-C contract-auditor、T7-I implementation-auditor（別instance、実装者と分離）。
- objective: 合意・製品契約・実装・証拠のずれを独立判定する。
- success criteria: 契約側はINV-01〜09維持、3source/legacy、Ready/対象集合/固定N/秘匿/期限/受付/復帰を監査。実装側は通常起動・release・本人保全・process/path境界・排他・保存失敗・UI source準拠・CI parity・AC証拠を監査。全findingがdisposition/evidence/residual riskへ対応し、未処理Blocker/Must fixなし。
- in-scope files/layer: 全scoped diffと正本・検証証拠をread-only。必要な独立試験は所有local test領域だけ。
- non-goals / forbidden scope: 実装主担当への転換、製品仕様再定義、他ownerの修正・自己承認・merge。
- allowed side effects: read-only検査と隔離した監査証拠。監査文書はcoordinatorへ返却。
- validation: QUALITY §3.1/3.3/3.4/3.6/3.7と差分。lobby/schema無変更も確認。他者の実操作報告と独立再実行を区別。
- continue-without-escalation boundary: scope内findingの再検証、根拠の追加要求、重大度の統一。修正は元ownerへ戻す。
- escalation / stop: 合意範囲/契約/互換変更が必要ならA/Bへ差戻し。参照不可や証拠不足はvalidation gap。独立監査完了まで全体実装COMPLETE不可。
