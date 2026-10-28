# #192 開発用コントロール窓 — Phase B 実行計画

2026-10-23 JST。Phase Aは補正・独立再レビュー・ユーザー合意済みの **COMPLETE / READY**。本書は実行計画であり、実装完了の証拠ではない。

## 目的・成功条件・停止条件

- objective: 本人Aの実アプリと普段の連携を使いながら、別窓で相手を操作し、通常ARENA/BPL/BPL4と合同プレー／大会を1人で確認できる開発ツールを、再解釈なしで着手できるtaskへ分割する。
- success criteria: 起動・隔離・正規入力経路・操作排他・受付証拠の方式、AC対応、write ownership、依存順、独立監査、検証、commit境界、未実証項目を具体化する。
- current request ceiling / terminal phase: **Phase B / planning-only・task-authoring-only**。
- allowed outputs now / allowed side effects: 指定worktreeの`tasks/issue-192-*.md`、参照元のhash台帳、read-only調査と独立計画レビュー。既存製品ファイル・Phase A成果物の変更なし。
- forbidden outputs now: C Kickoff、製品・テスト実装、検証セッション起動、branch/worktree作成、commit/push/PR、Issue更新、merge/close/deploy、stash/cleanup。
- stop condition: 計画・bounded packet・検証対応・準備判定・未解決事項を提示して停止。
- next unlock condition: **ユーザーによる別途のPhase C開始明示指示**。その後も実行基点確認・High-Risk再判定・必須spawn・C Kickoffを満たしてから実装する。本書のREADYだけでは解除されない。

## Entry Protocol と参照基点

| 項目 | 固定内容 |
| --- | --- |
| Stage | Phase B / execution planning |
| affected layers now | tasks文書のみ |
| affected layers future | client UI/state/source/Tauri、client用ローカルscripts・fixture・検証資料。Workerは既存ローカル実行対象、sharedは既存契約のconsumer。両者の製品コード変更は予定しない |
| contract-sensitive | 将来のsource I/O、接続・復帰、settings/history保存先、正規WS操作との境界に該当。製品契約自体は維持 |
| execution profile | **High-Risk**。cross-layer/native/source I/O・本人環境保全・運用影響を基準に分類 |
| Plan Mode | リポジトリの計画成果物必須ゲートとして**必須**。本書と子文書で満たす。対話環境のモード切替や実装許可を意味しない |
| 規約 | 指定worktreeのroot AGENTS/WORKFLOW/QUALITY、client/worker/shared各AGENTS。ユーザー提示AGENTSを追加適用。root AGENTSは開始cwdと指定worktreeでSHA256一致 |
| Spawn Gate | Bはexecution-coordinatorによる資産調査とcontract-auditorによる契約調査を実施。Cはfront-implementerと両auditorの実委譲が必須。Worker変更を要するならReplan後server-implementerも必須 |
| 正本 | 指定Phase Aのdraft・operation matrix・補正後v3・correction review・独立再レビュー。最新READYはcorrection review/合意済みdraft。再レビュー中の過去の「合意未成立」は履歴 |

開始時read-back:

- 製品参照・今回の計画保存先: `C:/Users/tts13/.codex/worktrees/issue-188-phase-c-host-led/infinitas_arena`。
- branch: `codex/issue-188-phase-c-host-led`。HEAD: `0dac1b02d3b23d9449d1e63d7ca3f822f98f9e50`。`git status --short --branch`はbranch行のみ、dirtyなし。Phase A確認時HEADとの差分なし。
- チャット開始cwd: `C:/work/infinitas_arena/infinitas_arena`、branch `codex/ddrgp-workflow-adoption`、HEAD `b8547805d8b9c3181baf0d6881263737c0c54075`、開始時clean。こちらには書き込まない。
- `v1`への差替え・fetch・checkoutは実施しない。将来Cの作業基点はこの#188参照内容を保持したtask専用branchとし、当時のbranch/HEAD/dirtyを再確認する。upstream統合やbase変更を暗黙に行わない。

## 維持する合意と非目的

「対象を選んで操作」の別窓。主催者進行は上部、参加者一覧は左、現在対象は右、記録は下部。現在の主操作を優先し、送信設定・接続のテスト・進行の調整・確認全体の操作を名前付き入口に置く。本人Aにテスト値入力を設けず、本人の製品操作は実アプリへ誘導する。

通常Readyは維持し、開催の毎曲Readyは追加しない。#188合意・実装・規範を使用し、旧#189へ戻さない。通常N2/N4は表示フェーズであり、サーバーへ新FSMを追加しない。開始カウント中の送信待機はツールの保守的制限で、serverが+55秒以前を拒否するとの説明にしない。

次の提出値は開始前・auto/hold・提出後・欠場・次曲待ちでも編集可能。現在曲の確定値は独立保持し変更不可。現在の提出待ちへautoを適用する場合は対象・曲・値・即時送信を確認し、取消時はpolicy変更も送信もしない。

切断・退出・欠場・次曲待ちを分離。当該曲分母はsnapshotの`current_playing_player_ids`、分子は同集合の確定status。接続数・在室数・大会固定Nを代用しない。固定Nと配点を縮めず、合同に総合ptを追加しない。

非目的: 本番/リモート接続、普段起動済みのアプリへのattach、任意WS編集・FSMジャンプ・期限変更、20実窓負荷試験、ライブの画面なし→あり切替、管理機能の全コピー、CI刷新、新依存、legacy再有効化、製品履歴schema変更、汎用自動シナリオ生成。

## 既存資産・再利用判定

以下のpathは指定worktree相対。行番号よりsymbolと開始HEADを参照する。

| 資産 | 再利用する責務 | そのまま利用できない点・task |
| --- | --- | --- |
| `scripts/start-local-two-clients.ps1` | local Worker/frontend/Tauri複数起動、identifier/port/runtime分離の例 | 2〜4窓、E2E時2窓、固定client ID。Aにもfixtureを初期化するので呼出し丸ごと再利用しない。T1 |
| `scripts/run-local-e2e.ps1` / `run-host-event-e2e.ps1` | source fixture構成、待機・証拠収集 | 自動シナリオは手動ツールとの同時実行不可。T2/T6 |
| `testdata/e2e/host-event/ws-participants.mjs` | 実WS JOIN/同期/開催ACK/error観測 | 固定開催シナリオ。通常対戦・対話的対象管理・制御停止は新adapter。T2 |
| `scripts/start-daken-counter-v3-mock.ps1` | loopback local WSとcontrol file投入 | 再接続時latest replay、固定port流用、古いpayload残存を管理する必要。T3 |
| `testdata/e2e/{inf-notebook,reflux,daken_counter_v3}/` | 正規形式のfixtureと失敗例 | 任意値/現在譜面/鮮度/連続同曲同値へ拡張。T3 |
| `runtime/runtime-config.ts` / `buildScopedStorageKey` | settings/通常履歴等のinstance分離 | query/E2Eは権限境界ではない。開催履歴の固定localStorage keyはこのhelperを使わない。T1 |
| `services/e2e-scenario-runner.ts:startE2EScenarioRunner` | 正規store操作の参考・既存E2E回帰 | scenario=manualでも自動処理抑止にならない。manual観測とautomationを別gateにする。T2/T4 |
| `services/e2e-observability.ts` | dump/log/画像取得の参考 | e2e.enabled依存、書込失敗catchを保存成功と扱えない。T5 |
| `commands/e2e_file.rs` | nativeの既存file出力例 | envフラグのみ・任意path。#192の書込みには使用せず、専用allowlist commandを設ける。T1/T5 |
| `commands/match_history_window.rs` / `app/AppBootstrap.tsx` | 別webviewの作成、query保持、再focus、App分岐 | 操作窓をAppとして二重起動するとwatcher/store/runnerが競合する。T1/T4 |
| `services/event-action-policy.ts` / 通常・開催store/WS client | 正規の権限/状態判定、送信・再同期・結果取得 | UI独自のserver authorityを作らない。通常と開催で通知形式が異なる。T2/T4/T5 |
| `services/event-history.ts` / Rust `commands/event_result.rs` | 既存履歴read/write | JS固定key、native app_local_data_dir。session/client別identifierとWebView/native保存領域を実測。T1/T6 |

### 確認できた既存の不足

`stores/source-store.ts:handleDakenCounterV3SocketMessage`はlocal WS lifecycleに開催対応がある一方、payload処理で通常`roomStore.snapshot`のPLAYINGだけを見てreturnする。規範`docs/design/06_source_io_spec.md` §8が定める開催contextへの切替が不足している。T3で**既定仕様への最小adapter整合**と通常/開催回帰を行う。新source仕様・新WS契約・dedupe弱体化で成立させる必要がある場合はPhase A/Bへ差戻す。

legacyは通常client入室・通常Workerで`SOURCE_DEPRECATED`拒否、設定UIも拒否する。一方、開催の低レベルJOIN型だけを見て全面拒否実装済みとは断定しない。#192は起動時にlegacyを拒否し、既存低レベルserverの受理範囲自体を拡張・変更しない。

## 採用する実装方式（将来Cへの技術方針）

### 起動・session・接続

1. 新規`start-dev-control.ps1`がsession IDを生成し、`testdata/runtime/dev-control/<session>/`を所有。起動条件はモード、Host A/B、人数、画面あり相手、source、Aの実source参照先。初版はARENA=4人、BPL/BPL4=2人、開催=4人から定員内追加。ローカルPRIVATE部屋・手動開始/再戦を既定にする。
2. 専用Node brokerをloopbackへ起動。既存Node 22のHTTPとWebSocket client、既存PowerShell mock、Rust reqwestを使う計画で新依存は予定しない。Worker/frontendもsession所有の別port/保存領域で起動し、既存の任意loopbackサービスへattachしない。port占有時は失敗または起動前再割当。子process/port/作成時刻/実行pathの一致とreadinessを確認する。
3. Aと画面あり相手はsession/client別Tauri identifier・WebView領域・native履歴先・player ID・設定keyで起動。Aのsource設定は明示選択した元path/portの読取専用。普段の設定/履歴をcopy/migrateしたり、fixtureをAへ作成したりしない。Aは実clientから正規入室する。
4. A/Bとは別の**制御専用Tauri process**に`dev-control` webviewを作成。session用の実clientとは別identifier・保存領域を持つ。`AppBootstrap`で通常Appとは分岐し、操作窓はwatcher・room接続・updater・scenario runnerを起動しない。閉じる操作はhide、明示終了とは別。専用launcherの再表示入口は既存controllerをfocusし、新しいparticipantを作らない。
5. 制御は`操作窓 → debug専用native command → loopback broker`。画面あり相手はmainだけに入るadapterがnative経由でpollし、自分の正規store操作を実行して観測を返す。画面なし相手はbroker内のWS peerが正規API/WSを使う。操作窓にroom接続を増設せず、同一playerは一つのtransport ownerだけが保持する。
6. brokerは検証ツールの意図・予約・操作記録だけのauthority。room state・結果・権限・期限は既存Worker/DOとsnapshotが唯一のauthority。画面あり/なしの変更、モード/Host/source変更は記録を保持して**新session**。退出後の再入室は既存アプリで確認し、切断の再接続ボタンに混ぜない。

### 専用起動の保護

- frontendは専用`dev-control` build modeの遅延load、nativeはdebug compile条件＋明示起動manifest＋session/client/window label/roleで多重確認。通常bundleでは入口を含めない。query、debugUi、INF_ARENA_E2Eだけで有効化しない。releaseは同じenv/queryを与えてもcommand/入口を利用できないことを試験する。
- nativeはmanifestが指定する固定loopback brokerにだけ接続。任意URL・redirect・非loopbackを拒否、timeout/size上限を設ける。起動tokenはnative環境だけに置き、URL/公開dumpへ出さない。brokerはsession tokenとclient roleを検査し、汎用CORS/匿名mutationを提供しない。
- 実source参照先とfixture許可先は別。書込はcanonical pathでsession配下・相手専用だけを許可し、相対脱出、UNC、symlink/junctionによる脱出、Aの元pathとの重なりを拒否。新fileの親も検査する。画像・ログにも同じ境界を適用する。
- 所有process handle/作成時刻/pathを記録し、停止時に再確認。process名一括kill・全ネットワーク遮断・本人のIIDX/連携/普段のアプリ停止をしない。初版は証拠削除機能を設けない。

### 停止後の制御窓の生存範囲

停止対象はsessionのA/B実client、headless peer接続、source mock、local Worker/frontend、broker、予約・poll・供給timer。操作窓だけのcontroller shellは、停止後の記録保存/再試行/新session起動のため存続する。これはroom/source接続も背景の検証処理も持たず、停止判定のprocess台帳ではcontrollerと検証runtimeを明確に分ける。動作確認停止はcontrollerアプリ自体の終了とは別。

停止protocol: 新規mutation/予約を禁止→未送信予約を失効→source供給とparticipant操作を停止→in-flightをconfirmed/rejected/unknownへ分類→取得可能な画面とログをcontrollerのsession専用spoolへ回収→bundle flush/read-back→全検証runtimeを停止しport/processを再確認。保存失敗時も証拠spoolを保持し、停止を取り消してruntimeを再開しない。

停止後の保存はcontrollerの限定native writerがspool/既存bundleを読み取り、許可保存先へexport/再試行する。broker/frontendがなくても動作するよう、既存Viteを`--mode dev-control`で専用runtime asset先へbuildし、controllerだけの生成Tauri configの`frontendDist`へ指定、`devUrl`を使わずdebug executableに同梱する。frontend compile条件は`MODE === "dev-control"`を使い、build時にfalseになる`import.meta.env.DEV`だけへ依存させない。通常/release bundleには入口を含めず、native release gateは常に拒否する。終了済み実窓の新規画像は取得不能と表示。新しい検証はcontrollerの限定native起動commandからhidden launcherを起動し、新session/token/process台帳を作る。controller自体を終了した場合は専用launcherからread-only再表示/既存記録読込が可能。controller終了時にもactive runtimeを放置しない。

### source別の入力契約

| source / 対象 | 投入・観測経路 | 実現性判断とCのgate |
| --- | --- | --- |
| A（対応source） | 明示参照した普段のfile/local WS → 既存watcher/parser/提出 | 読取のみ。元設定/履歴/連携入力に書かない。本人の実プレー証拠はT6で別記 |
| 画面なし相手 | 正規room/event WS SUBMIT | 通信・受付だけを証明。source監視済みの表示にしない |
| 画面あり `inf-notebook` | 相手専用export/recent補助 → records/summary更新 → Rust watcher/parser → source提出 | 既存fixtureあり。watcher起動baseline後に新着を投入。timestampの単調増加・summary/recent順序・同曲再選曲・再接続を実証 |
| 画面あり `reflux` | 相手専用latest.json/tracker.tsv → Rust watcher/parser → source提出 | 既存fixtureあり。content hash/timestampの鮮度、複数file更新と同曲同値を実証 |
| 画面あり `daken_counter_v3` | 相手専用mock port/control file → local WS `today_updates`差分 → 既存parser/提出 | 既存mockあり。空baseline、新着fingerprint、再接続latest replay隔離、開催adapter整合が必要。Aの実portを割当禁止 |
| legacy `inf_daken_counter` | #192の選択・起動を拒否 | enum/parser/mock選択肢の存在は有効化根拠にしない。現行拒否を迂回しない |

timestampやdedupeをツール都合で無効化しない。v3 fingerprintはtimestampだけでは変わらないので、sourceの正当な新着条件で連続同曲同値を作る。成立しない場合に直接WSへ代替せずT3を停止し、規範への最小整合で足りるか、合意範囲の変更が必要かを監査へ戻す。

### 排他・遅延・確認

- manual-controlと既存scenario automationは排他的。観測の有効化とautomationの起動を分離し、runnerのtimer/subscriptionをdisposeする。Aも自動Ready/選曲/scenario投入の対象にしない。
- brokerを相手のmanual/auto/delay/holdの一元ownerにする。画面ありはsourceを一回投入し、**既存自動提出だけ**がWS送信。brokerによる同時直接SUBMITをしない。host/Ready/選曲は画面ありadapterの正規store、画面なしpeerの正規WSへ配送。
- 予約/確認tokenはsession、target、transport epoch、room generation、match_idまたはevent_id、round_indexまたはround_id、expected key、開催selection_revision、policy/value revisionを固定。該当しない識別子はnullで明示し、別識別子へ代用しない。brokerとclientで送信直前・非同期解決後に再照合。
- 値編集はdraftを保存し旧予約・確認を取消す。policyは適用時だけ変更。対象選択の変更は開いた確認を失効し、そのUIが保持する遅延予約も取消す。曲/世代/接続/停止/session変更では古い入力を失効、再開時に予約を復活させない。
- auto適用確認は対象・現在曲・EX/MISS・即時送信の効果を固定し、取消ではpolicy/送信不変。提出確定後のdraft編集は次回用。既送信・既投入を「取消成功」とは表示せず、受付/失敗/不明を最後まで追跡する。
- mock latestやfileに既投入の古い観測も失効対象。取消だけで物理入力を巻戻せたとはみなさず、新baseline・供給停止・client再照合で次曲への漏れを防ぐ。timeout後に新IDで自動再投入しない。開催は既存request再送規則、通常は最新snapshotへ再同期して確認する。

### 操作と証拠

`操作受付 → 検証待ち/予約 → source投入（画面ありのみ） → 解析観測 → WS送信 → server受付確認`を別イベントで記録。拒否・取消・投入失敗・送信失敗・返答timeout・保存失敗は別terminal。証拠のない段階を推測で進めない。

- 開催の受付は既存`EVENT_ACTION_ACK(request_id)`＋当該曲status/snapshotで照合。通常には新しい汎用ACKを追加せず、既存`PLAYER_ROUND_CONFIRMED`と最新snapshot/ERRORで対象・曲を確認する。source-submissionの`ok`は受付証明ではない。
- JSONLにoperation ID、session/client/player、入力経路、上記token、client_msg_id/request_id、時刻、操作・投入・送信・受信・ERROR・取消理由を結ぶ。token等の秘密は保存しない。入力値と公開済み結果を別欄にし、操作窓が知る未確定値をメインへ注入しない。
- 保存bundleはmanifest、操作記録、source投入物/観測、raw受信・状態、取得可能な実画面画像、欠落/失敗一覧を含む。保存完了は実write/flush/read-back結果で判定し、失敗時は保存先・失敗内容・再試行を表示。画面なし/閉じた窓は画像なしと明示。
- 開催画面外での監視・提出と、検証用履歴の終了後再読込を実clientで確認。ログ上のSUBMITや表示用mockを代替証拠にしない。

## 実行分割・監査・commit

詳細packetは[issue-192-dev-control-tasks.md](issue-192-dev-control-tasks.md)、AC/試験は[issue-192-dev-control-validation.md](issue-192-dev-control-validation.md)。

依存順: **C明示許可 → 基点/正本確認・C Kickoff → T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7**。T1/T2/T3の安全性とsource成立を先に確認し、見た目を接続する。限定mockによるUI検討はT4 owner scope内で可能だが、T3未合格を実受付passにしない。

| task | owner（将来のrole instance） | commit単位 |
| --- | --- | --- |
| T0 正本固定・private制御境界 | execution-coordinator（文書/参照保存のみ） | design source保全と制御境界文書 |
| T1 専用起動・隔離・native制御 | front-implementer / foundation | session launcher/broker基盤＋debug native gate＋隔離試験 |
| T2 正規操作adapter・予約排他 | front-implementer / foundation | 画面なしpeer・画面ありadapter・manual排他・token/予約試験 |
| T3 source供給・既存開催adapter整合 | front-implementer / source | source fixture/mock供給と最小既存整合＋source回帰 |
| T4 合意UI・別窓 | front-implementer / UI | 操作窓と操作表対応・visual/interaction試験 |
| T5 証拠・保存・停止 | front-implementer / foundation | 受付相関・bundle保存・再表示/停止/再起動・失敗試験 |
| T6 統合・回帰・実機証拠 | front-implementer / foundation | client側harness/fixtureと検証文書。各層修正は各ownerへ返す |
| T7 独立最終監査 | contract-auditor / implementation-auditor（read-only） | 監査報告のみ。修正commitは元owner |

scriptsはclient側のローカル検証ツールとしてfoundation担当が所有し、Worker authorityを実装しない。親は委譲中scopeへ書き込まず、進行/監査調整だけを行う。共用fileのowner移譲は停止宣言→状態確認→再割当を先に行う。詳細の例外表を子文書に記す。

commit/publishは将来依頼の権限で再判定し、`commit-pr-flow`を適用。単独commitに未検証・無効な機能が露出しないようdefault-offを保つ。T1〜T3を途中公開して全機能完成としない。

## 影響・互換・rollback

- ユーザー: 通常起動と配布版に入口/command/追加processを露出しない。本人の設定・履歴・実source入力は保全。
- データ: 新session専用領域のみ。既存settings/history/snapshot形式は変更せず、開催history固定keyはnative/WebView保存領域から隔離。保存場所の変更を通常環境へ流用しない。
- 契約: additiveな開発専用制御。製品WS type/payload、shared enum/SourceType、RoomState、CloseReason、lobby、開催v2、履歴versionは変更予定なし。private broker DTOは`packages/shared`へ入れない。
- Cloudflare: ローカルWorkerを既存設定で実行するだけ。deploy、binding追加、wrangler設定・CI変更は計画外。
- rollback: sessionを停止して所有process/予約/portが残らないことを確認、証拠保持。コードはtask commit単位で戻す。T3の規範整合修正を単独保持するかは監査結果で判断し、fixtureだけ戻して製品不整合を再導入しない。本人データの復元/削除はしない。

## リスク・未決事項・差戻し条件

| ID | 現在の扱い | owner / gate |
| --- | --- | --- |
| R1 実通信・source・保存・停止未実証 | Phase Aの表示例から引継ぐ検証債務。実装方式は上記へ固定、成功保証はしない | T1〜T6。source別成果を別々に保存 |
| R2 v3開催contextの既存不足 | 規範への最小adapter整合をin-scopeへ明示 | T3、contract checkpoint。WS/parser semanticsの変更が必要ならA/Bへ戻す |
| R3 stale/replay/同曲同値 | 予約取消だけで解決しない。source鮮度・baseline・非同期照合を実証 | T2/T3/T6。成立しないsourceを黙って除外しない |
| R4 profileだけでは開催履歴未隔離 | identifier/WebView/native保存領域をsession単位で実測 | T1。普段データへのfallbackがあればBLOCKED |
| R5 2窓・20人・keyboard・低高さ | UX未検証のまま残っていたものを必須実機QAへ | T4/T6、implementation audit |
| R6 UX-RN-03 同期値欄が2組 | **Note**を維持。初版では同期・用途説明を担保し重複を理由に未合意の再設計をしない | T4/T7で密度と到達性を評価、改善案は別合意。既存値編集を削らない |
| R7 A実プレー環境 | Aのsource参照path/port・実プレー日時は起動時入力であり、製品仕様の未決事項ではない | T6で本人実連携の証拠。利用不可なら該当AC未検証と明記しC完了扱いしない |
| R8 新依存/CI/native機構不足 | 既存依存で成立見込み。実装時に不要な依存/CI変更を追加しない | 必要と判明した時点でReplan、根拠・選択肢を提示 |

Phase A差戻しが現在確定した項目はない。差戻し候補は、主要3sourceの一つを初版から外す、本人Aへfixture投入する、開催Ready/固定N/権限/期限を変える、画面あり入力を直接WSへ代替する、製品source semantics/legacy方針を変更する必要がある場合。根拠と「既存規範への整合修正／初版範囲再合意／別Issue依存」を比較し、勝手に選ばない。

Phase C開始前条件: ユーザー明示許可、指定基点と正本hashのread-back、具体packetの存在、High-Riskの担当/監査実spawnとwrite ownership確定、C Kickoff。**C開始後の後続解禁checkpoint**はT1安全性→T2操作/排他→T3 source成立→UI接続/証拠/統合の順とする。T1〜T3の実装済みをC開始前に要求しない。実装中の技術的未実証はそのtaskのexit gateで解消し、全packet合格・AC証拠・独立監査・QUALITYの必須検証完了まで製品COMPLETEを宣言しない。

## Phase B 実行記録・検証状態

delegation execution record（本Bの実記録、将来Cの予定とは区別）:

| role | spawned | agent id | ownership | status |
| --- | --- | --- | --- | --- |
| execution-coordinator | yes | `/root/phase_b_assets` | 起動/bridge/fixture/CI資産のread-only調査 | COMPLETE |
| contract-auditor | yes | `/root/phase_b_source_contract` | source/WS/FSM/保全境界のread-only調査と計画レビュー | COMPLETE / pass-with-followups / READY |
| implementation-auditor | yes | `/root/phase_b_plan_audit` | 4計画文書の独立品質/AC/所有/依存/検証監査（read-only） | COMPLETE / pass-with-followups / READY |

front/server implementerの非委譲理由: 今回は実装開始禁止。Cの必須spawn省略を意味しない。製品build/typecheck/lint/Rust/実E2Eはplanning-onlyにつき未実行、計画文書の範囲/リンク/文字コード/AC/packet/独立レビューを検証する。製品のpassや機能成立を主張しない。結果は検証台帳に追記する。

## Phase B 終了判定

**COMPLETE / READY（Phase B計画・引継ぎ準備）**。契約・品質の独立レビュー指摘を計画補正し、未処理のB Blocker/Must fixなし。T0〜T7の8packet、AC-01〜11とV1〜V9の対応、13資料hash、ownership/依存/commit/検証/rollbackを具体化した。`check:agents`と`check:design-contracts`はPASS。計画4文書のUTF-8 no BOM/LF・内部リンク・packet必須項目・AC網羅を確認した。

**Implementation authorization: NO。C Kickoff: 未実施。** 製品差分/commit/PRなし、指定branch/HEADは維持。計画はこのworktreeの未commit Markdown4件として保持する。将来Cの実証債務（特に開催v3整合、3source新着/replay、本人実連携、配布版拒否、停止後保存、期限/再入室、実2窓QA）は未解消であり、T各exitと最終監査まで製品COMPLETEとしない。本依頼はここで停止する。
