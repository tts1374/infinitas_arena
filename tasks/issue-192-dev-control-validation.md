# #192 AC・検証・準備判定台帳

2026-10-23 JST。正本: [実行計画](issue-192-dev-control-window.md) / [bounded tasks](issue-192-dev-control-tasks.md)。本書のV1〜V9は**将来Cで必須の計画**であり、Bで実行済みではない。

## AC → task → 検証 → 保存証拠

| Phase A AC | 実装task | 検証group・合格条件 | Cで残す証拠 |
| --- | --- | --- | --- |
| AC-01 起動・別窓・識別・通常/配布拒否 | T1/T4 | V1/V2/V7。専用起動だけでmain+操作窓。環境/session/room/client/player/sourceが判別可 | launch manifest、全窓画像、通常/release直呼び拒否log |
| AC-02 通常3モード・全ROUND・再戦 | T2/T4 | V5。ARENA=各人1曲、BPL=各1+serverランダム、BPL4=各2。Ready/全枠/全ROUND/最終結果/手動再戦 | 各modeの2match ID、選曲/受付/結果snapshot、画面 |
| AC-03 A実連携と相手模擬・元環境保全 | T1/T3/T6 | V2/V3。Aの実プレー＋B入力が同室で受理。元設定/履歴/連携へのtool writeゼロ | source経路図、A/B送信と受付相関、本人データ領域とtool write先の比較 |
| AC-04 通信受付と3source実client経路の別証明 | T2/T3/T4 | V3。headless受付と、画面あり3sourceの投入→解析→送信→受理。非対応/legacy拒否・二重接続なし | source別raw fixture/観測/ID/ACKまたはconfirm/snapshot、対応可否画像 |
| AC-05 開催2種2曲・Readyなし・固定N | T2/T3/T4 | V5。合同/大会で2曲、hold→締切欠場→次曲。固定N/配点/結果秘匿 | event/round IDs、eligible/playing/固定名簿/N/status、公開前後画像 |
| AC-06 切断/復帰・退出・Host切断 | T2/T5 | V4/V5。正規期限内/期限到達時の復帰、同曲対象・次曲待ち、Host停止中SUBMITと公開保留 | transport epoch、切断/退出別log、deadline/snapshot、結果 |
| AC-07 任意値・同点・遅延・hold・編集・確認・失効 | T2/T3/T4 | V4/V7。値編集可、確定値不変、auto即時適用の確認/取消、10秒と古い予約失効 | draft/value/policy revisions、確認画像、取消/dispatch/受信、次曲反映 |
| AC-08 背景監視・復帰・検証履歴再読込 | T1/T3/T4/T5 | V3/V5/V8。Aが開催画面外でも提出、戻って結果、終了後history再読込 | page transition、実観測/提出/受付、専用history path/hash/再読込画像 |
| AC-09 操作/投入/送信/受理/失敗と保存・秘匿 | T2/T5 | V6。各段階/unknownを区別し実write/画像欠落を確認、mainへ未確定値漏れなし | JSONL、bundle manifest、snapshot、公開前main画像、保存失敗/再試行 |
| AC-10 保護・停止・再表示・再起動・証拠保持 | T1/T5 | V1/V2/V8。非検証先/許可先外拒否、全予約/所有process停止、hide→再表示、新session起動 | deny log、canonical path、process/port read-back、旧新session別bundle |
| AC-11 操作表・複合状態・説明・表示phase | T2/T4 | V5/V7。5モードのN/E各状態、本人/相手・Host/guest・接続・提出・返答待ち、無効理由 | matrix case ID→画像/操作/結果、N2/N4が独立FSMでない証拠 |

## V1 — 起動・権限の否定試験

T1 owner。debug専用起動、通常debug起動、release起動を比較。query-only/debugUi/E2E-only、偽/期限外manifest、別session/client/window/role、token不一致/匿名、停止済みsession、非loopback/redirect/任意URLを拒否する。A対象のresult/Ready/選曲/切断/退出代理commandをUIだけでなくnativeとbrokerから拒否。focus/読取/全体停止の許可は別actionとして確認。

Worker/frontendが既にportを使っている場合に無条件attachしない。自分で起動した子processのport/readiness/実行path/作成時刻を照合。Node global WebSocket/PowerShell local WS/Rust依存が指定環境で利用できることを実測。releaseでは入口も制御commandも利用不可、普通の製品機能が起動できることを確認。

## V2 — 本人・保存先・process保全

T1/T5 owner。session×client別WebView/localStorage/native/settings/snapshot/history/fixture/logを列挙して一致をread-back。特に開催履歴の固定localStorage keyとRust event-resultsが普段/別sessionへ漏れないこと。Aのsource参照だけを明示し、fixture path/portが重ならないこと。本人設定・履歴のbefore/after比較を行う。

A実連携ファイルは連携ソフト自身が正規更新するため、内容が変わらないことを要求しない。toolの書込先・権限/拒否記録と実連携プロセスの入力更新を区別し、A宛の模擬書込を直接試して拒否を確認する。本人ファイルをreadonly属性へ変更して連携を妨げる試験はしない。root外/相対脱出/UNC/symlink/junction/新fileの親による脱出、別client宛書込を拒否。

停止前後のprocess handle/PID/起動時刻/pathとportを記録。起動途中失敗、broker異常終了、mainだけ終了、操作窓close→hide、全体停止を分け、本人のIIDX/連携/普段アプリが停止対象外であることを確認。

## V3 — source別実経路

T3 owner、T6が統合証拠を収集。最低試験面は**3source × 通常/合同/大会**。通常source共通adapterの試験に加え、通常3モードの実進行はV5で全て通す。画面なしWS成功は別runで証拠保存し、source実証欄へ流用しない。

| source | baseline/入力正常 | 境界・異常 |
| --- | --- | --- |
| inf-notebook | 監視開始時summary baseline、recent補助先行、summary新着、EX/MISS指定、同点/同曲再選曲 | timestamp単調増加/同秒待ち、監視再起動、古い入力、alias未解決/partial/ambiguous、破損、observed≠expected |
| reflux | latest/tracker、EX=exscore/MISS=bad+poor、hash/timestamp鮮度 | file順序/途中更新、破損、再接続、同曲同値、observed≠expected |
| daken_counter_v3 | 相手専用port、空today_updates baseline、新着差分、通常/開催のcontext切替 | latest replay、同曲同値fingerprint、battle、chart_idなし/不一致、invalid payload、local WS断/再接続 |

全sourceで`observed_key == expected_key`、初回有効観測/重複排除、SOURCE_UNAVAILABLEとTECH導線を確認。legacyは#192起動拒否と既存通常拒否の回帰を確認、廃止sourceの抽出成功を要求しない。Aの普段のsource設定を変えず、本人実プレーとB相手入力が同室で受理されるrunを別保存。

## V4 — 曲・世代・予約・復帰

T2/T3 owner。10秒遅延の仮時計単体試験と実source連続操作を両方行う。session/target/connection epoch/room generation/match/event/round/expected key/selection_revision/policy/value revisionを固定し、どれか変われば古い確認/予約を無効にする。

開始前、manual/auto/hold、提出後、欠場、次曲待ちで次値を編集。0/上限/空欄/小数/負数/不正文字を試す。上限は製品規則/選択譜面に従い、試作の固定4000を移植しない。auto適用中の対象/曲変更、確認取消、連打、重複poll、adapter await中のcontext切替を含む。現在確定値は不変、次曲だけ新値を使用する。

既投入file・mock latestは予約取消だけで消えないため、監視再起動・再接続・次曲・同曲再選択で古い観測が採用されないことを確認。既投入後の取消は取消成功と表示せず追跡を継続。新IDでの無条件再投入はしない。

一時切断→同じID/復帰情報で正規復帰。通常の再接続期間、Host猶予、開催Host300秒の直前/到達/超過は規範・実装の時刻条件に沿って試験。短縮した独自timerへ置換せず、unit/既存server試験に加え代表の実時計runを保存する。明示退出後の再入室は既存アプリの正規導線で試し、通常の再接続と混同しない。開催の同曲復帰と退出後次曲待ち、大会の固定名簿ID復帰を分ける。

## V5 — 正規進行・権限・対象集合

T2/T4/T6 owner。以下は既存契約の回帰と#192操作の統合を分けて記録する。

- 通常ARENA/BPL/BPL4でcreate→全員Ready→全選曲枠→全ROUND→最終結果→手動再戦。初版人数を維持。BPLランダム曲とBPL4各2曲、共通候補取得、duplicate pick差替えを確認。
- 通常TIMEOUT/FORCE_ADVANCE、SKIP_HOST_ASSIGN拒否、ROOM_STATE_LOSTと明示close、lobby公開条件の既存回帰。ツールへscope外の管理操作を増やさず既存harnessで補完。
- 合同/大会それぞれ2曲。毎曲Readyなし、Host A/B双方の導線、有効対象1人以上で開始。round_statusのPENDING/SUBMITTED/SKIPPED/ABSENT・対象外nullとpending_next/欠場理由、在室/接続/固定Nを分け、当該曲snapshot集合と表示分母・分子を比較。通常のPLAYEDと開催のSUBMITTEDを混同しない。
- Host切断中も既開始曲の有効SUBMITは継続、進行/退出などは停止。全員提出しても復帰まで公開保留。期限で閉じる場合も新規進行を捏造しない。
- 大会開始後新規ID追加拒否、合同の途中追加が次曲待ち、退出/不在でも大会N/配点不変。終了時未確定曲無効と確定済み曲保持、結果秘匿を確認。
- Aが開催画面外へ移動→監視/提出→開催へ復帰→終了→専用history再読込。模擬stateや公開前ローカル値を結果へ混ぜない。

## V6 — 受付・失敗・保存

T5 owner。operation/input/send/confirmの段階とIDを突合。source `ok`を受付としない。通常はPLAYER_ROUND_CONFIRMED＋snapshot/ERROR、開催はACK request_id/applied_revision＋対象round statusを根拠にする。ACKだけ先行、snapshotだけ先行、遅延/重複/順不同、競合ERROR、送信後timeoutを試験。unknownは再同期で解決し、未確認の成功へ変えない。

保存は各fileのwrite/flush/read-backを確認。権限エラー/容量相当失敗/終了窓画像欠損/途中broker停止を作り、保存失敗・部分保存・再試行結果を表示する。取得できない画像をPASSにしない。bundleの秘密token不在、操作窓の未確定値と公開snapshotの分離、メイン表示への漏洩なしを確認。

## V7 — design source・操作表・実窓

T4 owner、implementation-auditorが独立確認。manifestの6資料/7画像を確認し、最新correctedを基準にtext/layout/visibility/placement/overflowを照合。5mode×N/E各7表示×A/Bに加え、Host A/B・切断/退出/提出済み/欠場/次曲待ち・Host断・返答待ちの有意な組合せをcase IDにする。単なる試作70表示PASSを製品の全状態PASSへ流用しない。

1024/736/320px、1024×700の20人目、メニュー/設定/入力元を開いた状態、実mainと操作窓を並べた低高さ、キーボードだけの移動/確認/取消/保存/再表示を確認。有効primary最大1、無効理由の関連付け、フォーカス移動/復帰、横はみ出しを記録。UX-RN-03の2組同期値欄はNoteとして密度/誤読を評価し、意図を変える集約は再合意へ。

## V8 — 停止・restart・履歴保全

T1/T5 owner。窓hide→再表示と全体停止を分ける。停止時は新mutation/予約/供給を止め、in-flight分類→画面/ログのcontroller spool回収→bundle flush/read-back→検証runtime全終了の順序を確認。process/port再列挙、予約なし、古いcallback/replayなし、controller以外の検証runtimeなしを確認。停止後のcontrollerはroom/source接続もpollも持たず、同梱DEV assetと限定native writerで保存/再試行できる。保存失敗時もspoolは残り、停止を取消して再接続しない。終了窓の画像欠損を表示する。controller自体の終了→専用launcherで記録read-only再表示も検証。新sessionで旧予約/IDを再使用せず、旧証拠・履歴を残す。履歴再読込は元の専用profileから行い、普段のhistoryへ混ぜない。

## V9 — 技術検証とCI parity

CI正本は指定HEADの`.github/workflows/validate-reusable.yml`。C最終検証はquickより広い**full相当**を要求する。

| 面 | Cで実行するcommand |
| --- | --- |
| CI quick共通 | `npm run check:agents` / `npm run check:design-contracts` / `npm run lint` / `npm run typecheck` / `npm run test:client-stats` / `npm --workspace @infinitas/client run test` / `npm run test:worker` / `npx tsx --test scripts/host-event-e2e.test.mjs` |
| full追加 | `npm run build:client`、`apps/client/src-tauri`で`cargo check` / `cargo test`、`apps/worker`で`npx wrangler deploy --dry-run` |
| release保護 | native releaseで新commandが不在または拒否する検査＋通常配布起動確認。`cargo check --release`だけでUI/実行時拒否を代替しない。配布/公開はしない |
| 追加Node script | 追加/変更mjsごと`node --check`、新tool試験は`node --test scripts/dev-control/<実在するtest名>.test.mjs`等を実在一覧で明記 |
| 追加PowerShell | `[System.Management.Automation.Language.Parser]::ParseFile`で構文検査、V1/V2/V8の実Windows process試験 |
| 実local E2E | 新dev-control harnessと既存local/host-event E2E。実行引数とsession/run/sourceを記録。GUI/実source/本人実プレーはCI greenで代替不可 |

root typecheckはclient testも含む。client workspace tsconfigは`src/**/*.test.ts`を除外するのでworkspaceだけのPASSで終わらない。client test scriptは列挙式、新testはfoundationがscript登録するか明示実行する。scriptsのmjs/PSはroot lint/typecheck対象外なので追加面を必須とする。新依存/lockfile/CI更新を前提にしない。

## findings disposition ledger（Phase B）

| finding | disposition | evidence | remaining risk |
| --- | --- | --- | --- |
| CR192-R01 / 3source実現性 | 調査完了、T3実証へ割当 | 正規parser/watcher/local WS/fixtureを特定、親計画source表 | 実bridge/source通信は未実証 |
| CR192-R02 / 固定集合サンプル | T2/T4/V5のsnapshot比較へ割当 | Phase A操作表§9と製品集合規範 | 全欠場理由/復帰/期限組合せはC検証 |
| SC192-01 / Must fix: v3開催payload通常context依存 | **T3の必須修正へ割当**、延期しない | source-storeのhandler/同定helperとsource規範§8 | 修正・source3種×開催合格まで製品完了不可 |
| SC192-02 / Should fix: 投入済みreplay失効 | T2/T3/V4へ計画反映 | broker/client両token、新baseline、既投入取消の別扱い | 実sourceの非同期競合はCで検証 |
| SC192-03 / Should fix: 送信と受付の混同 | T5/V6へ計画反映 | 通常confirmと開催ACK/statusの方式を明記 | 実受信順序/unknownの相関未実証 |
| SC192-04 / Note: 観測とrunnerのgate結合 | T2/T5へ分離を計画 | manualでも観測継続、timer/subscriptionの排他 | 既存E2Eとの回帰未実証 |
| SC192-05 / Note: v3同曲同値 | T3/V3/V4の必須case | timestampのみでfingerprint変化なしと明記 | 正規新着成立を実測。不成立時A/Bへ戻す |
| UX-RN-01 / 旧render | source manifestで最新correctedへ固定 | 13資料hashと親の7画像目視 | 原本可用性はT0で再確認 |
| UX-RN-02 / 表示例と実受理 | V3/V6で別証拠を必須化 | source/通信経路を別run/段階で保存 | C実証まで未完 |
| UX-RN-03 / Note: 同期値欄2組 | Note維持、T4/T7で密度/到達性を評価 | 最新confirmation画像と独立UX報告 | 誤読/縦密度。合意変更は別判断 |
| B192-C01 / Should fix: task検証の循環 | corrected: 各task exitは責務部分のcheckpoint、後続依存のV全体はT6 | packetのwrite ownership直後とT1/T2/T4 validation補正 | Cで部分PASSと全体PASSを分けて記録 |
| B-P01 / Must fix（B192-C02 / Should fixと同一）: 停止後UIが消失 | **resolved（計画補正）**: Aと別のcontroller process、同梱DEV asset、停止前spool回収、停止後native export/再起動 | 親計画の停止protocol、T1/T5、V8補正。契約/品質監査が補正をread-back済み | 実process/保存失敗/再表示の成立はC実証 |
| B192-C03 / Note: 開催status表記 | corrected: 開催SUBMITTED/SKIPPED/ABSENT/PENDING/nullと通常PLAYEDを分離 | V5を現shared型に整合 | 実表示と集計はCで比較 |
| B-P02 / Should fix: C開始条件にC内checkpointが混在 | corrected: C開始前条件とC開始後の後続解禁を別記 | 親計画のPhase C開始前条件の段落 | C Kickoff時に権限と実spawnを再判定 |

SC192-01のMust fixは**将来製品実装に対する必須項目**。Phase Bの文書不足として未処理のまま残すのではなく、修正owner・scope・依存・検証・停止条件をT3に固定した。製品側の解消済みという意味ではない。旧Phase Aの7件は最新correction reviewでresolved、再オープンしない。

## Phase Bで実施する検証・完了記録

- 指定worktree branch/HEAD/clean、開始cwdの独立状態、root/local規約、指定Phase A6資料、corrected7画像を確認。
- 資産調査と契約調査は別agent。親が計画文書を単独所有。独立計画レビュー結果・format/link/AC/packet/read-back結果は完了時に追記する。
- 製品build/typecheck/lint/tests/Rust/Worker/実E2E/release試験は **not run**。理由: 今回は計画Markdownのみで、製品実装・実行は未許可。これはCのV1〜V9を免除しない。Bの検証は文書構造・正本hash・scope・AC追跡・独立レビューと差分検査。
- Phase B完了は計画完成の判定、製品機能の準備完了・C Kickoff完了・C実装許可とは区別する。

### 最終結果

| B check | 結果 |
| --- | --- |
| execution-coordinator資産調査 | COMPLETE。起動・保存・runner・既存script・CI実面を確認。初回のlauncher欠落との報告は同担当が実在確認後に撤回しており、欠落riskを残していない |
| contract-auditor独立調査/計画再監査 | COMPLETE / pass-with-followups / READY。B192-C01〜03は計画でresolved、SC192-01はCのT3必須修正へ割当。manifestの13/13 bytes/hashを独立照合 |
| implementation-auditor独立計画監査/再監査 | COMPLETE / pass-with-followups / READY。B-P01 lifecycleのMust fixを計画補正で解消、B-P02開始前/開始後境界も補正。AC/ownership/CI parityに未処理重大findingなし |
| repository consistency | `npm run check:agents` PASS（8 agents）、`npm run check:design-contracts` PASS。製品のbuild/E2E合格を意味しない |
| 文書検査 | 計画4件UTF-8 no BOM/LF、trailing whitespaceなし、相対Markdownリンク解決、8packetのobjective/success criteria/scope/non-goals/allowed side effects/validation/continue/escalation、AC-01〜11の対応を確認 |
| scope/基点 | 指定branch/HEAD維持。追跡済み製品差分なし、未commitの計画Markdown4件のみ。開始cwdの別branch/worktreeへ書込みなし |
| 未実施 | C Kickoff、実装、product build/typecheck/lint/tests/Rust/Worker bundle、実source/通信/期限/保存/配布拒否、commit/PR。planning-only境界による未実施で、C検証へ継続 |

**Phase B COMPLETE / handoff READY**。製品実証は未完。Implementation authorizationはNO、C開始には別途ユーザー明示指示が必要。未処理のB Blocker/Must fixなし、現在確定したPhase A差戻し事項なし。Cの必須riskとNoteは上表/各taskに維持する。
