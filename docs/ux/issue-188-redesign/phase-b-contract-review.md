# #188 Phase B 契約・互換性・再利用調査

2026-10-04 JST。状態: `COMPLETE`（Phase Bの契約調査）。監査 verdict: `pass-with-followups`（計画入力として）。製品実装の適合判定は行っていない。

## 監査スコープと境界

- Stage: Phase B、`current request ceiling: planning-only`。
- objective: Phase A合意と現コードの差を、契約面・互換性・再利用根拠・必要検証として実行計画へ渡す。
- affected layers: docs/design、shared、Worker/DO、client transport/store/source adapter/history/UI。
- contract-sensitive: yes。execution profile: `High-Risk`、Plan Mode: required。FSM遷移条件、WS必須項目、永続化schema、client/worker/shared横断が該当する。
- success criteria: 維持する不変条件、更新が必要なconsumer、breaking分類、移行とrollback条件、検証gapとCでのdispositionを具体参照で記録する。
- stop condition: この調査資料を保存し、計画担当へ渡したら停止。C Kickoff、製品実装、commit、GitHub/PR更新、close/merge、deploy、削除/revertは不可。
- allowed side effects: この新規Markdownだけ。未追跡のPhase A資料と`target-e2e/`を保持。
- 適用規約: root `AGENTS.md`、`WORKFLOW.md`、`QUALITY.md`、`apps/client/AGENTS.md`、`apps/worker/AGENTS.md`、`packages/shared/AGENTS.md`。
- 参照skill: `fsm-protocol-guard`、`quality-check-matrix`。保存には`windows-utf8-safe-write`を適用。skillはリスク/検証参照であり、実装開始の許可ではない。
- 本担当の再委譲: no。No-delegate reason: 親から分割済みの契約調査であり、同じread-only範囲を再分割する必要がない。親の実委譲記録は全体計画で管理する。

## 正本と参照資料

体験・期待動作の正本は`issue-188-draft.md`、`phase-a-review.md`、`prototype-review.md`、`handoff.md`、`validation.md`。Phase A末尾の全体案合意とREADYを参照し、各資料の旧版検証記録に残る未合意・Ready記述を現仕様へ戻さない。今回のユーザー依頼がBだけを解除しており、Phase A文書中の停止記録をC許可とは扱わない。

規範参照は`docs/design/01_fsm.md` §12、`02_ws_protocol.md` §6、`03_data_model.md` §10、`06_source_io_spec.md` §8、`07_constants.md` §Host開催、`10_regression_guard_addendum.md` §4/7。現規範のReady部分は旧仕様であり、新合意との差を下記で明示する。`10`末尾が同期対象に含める`05_screen_list.md`もCで更新要否を確認する。

コード参照はHEAD `90856a42d9e199b49d97966e1dd620e6b626b5dd`、branch `codex/issue-188-host-event-mode`。親がread-only取得したPR #189はOPEN、base=`v1`、headは同HEAD、87 files / +8425 / -112。PR/Issue/旧`tasks/issue-188-host-event-mode.md`は旧仕様と当時の実施記録の参照であり、新B計画の正本ではない。再利用判断にモデル世代を使用しない。

独立試作の視覚・操作確認は全体Bのvisual evidenceを参照する。本担当は画面の視覚準拠を独立にPASSとは判定しない。

## 触れた契約面とcompatibility classification

| 契約面 | 分類 | 根拠・計画上の扱い |
| --- | --- | --- |
| 通常RoomState/CloseReason/SourceType、通常room protocol、通常TTL | 維持 | 開催だけを変更する。列挙や通常Ready、通常成績を連動変更しない |
| `EventRoomAction.SET_READY`と公開participant `ready` | breaking | shared `ws/host-event.ts`の必須action、`models/host-event.ts`の必須booleanを撤去し、同じv1で無意味化することは不可 |
| `START_ROUND`の参加対象・成立条件 | breaking（意味変更） | Ready1人/大会全員から、譜面確定・対象1人・Host接続へ変更。旧合同のReady対象集合をそのまま使えない |
| event protocol/capabilities/create/join gate | breaking、通常側は維持 | 現行protocol=1の完全一致gateをv2へ同期。旧開催clientはsnapshot前に拒否、新clientは旧serverの開催だけ無効にする |
| DO record/public snapshot | breaking | schema v1 validatorは必須readyを検証。公開snapshotと内部recordの版・移行を明示し、型変更だけで終えない |
| event history | breakingになり得る（方針を後述） | v1はlive participant型を直接保存し、readerがreadyを必須要求。live変更だけを投影すると新規保存したv1自身が読めなくなる |
| 選曲確定前の公開対象IDを追加する場合 | additive field、全体はv2 | 必要ならauthoritative ID配列をoptional推定でなく契約で定義。UIが接続人数をゲーム内準備完了と解釈しない |
| 公開曲結果、順位/pt、欠場理由、paging cursor | 維持 | Ready廃止で結果値・固定N・同点・public revisionの意味は変えない |
| 新入口/表示/配置 | UI変更、単独ではwire互換変更なし | Topから専用ページ、画面移動と退出を分離。参加ID＋codeを維持 |

技術推奨はevent protocol 2、public snapshot 2、DO record 2。historyは下記の依存を踏まえhistory2＋v1 reader/migrationを推奨する。全体B計画でDO schema1の自動移行は採用せず、旧runtimeのdrain・回収・retention満了・cleanup確認を切替条件に固定した。historyの読取移行とDOの自動移行は区別する。これは合意済みの体験を変える提案ではなく、breakingを隠さない互換方針である。具体版定数/型/エラーはCの契約packetで同時固定し、その前にconsumerが独自に変えない。

## Findingsとdisposition ledger

severityは将来の実装/リリース条件を示す。Bの処置は修正を始めることではなく、具体的C作業・検証・停止gateへ帰属させることである。下記の全Must fixはC必須項目として明示再スコープする。製品適合のPASSを意味しない。

| ID / severity | finding | Bでのdisposition | evidence | Cに残るrisk |
| --- | --- | --- | --- | --- |
| CR-01 Must fix | 毎曲Ready gateと合同Ready対象のみの開始が新合意と衝突 | shared/規範→Worker→clientの一貫した置換を必須化。Readyゼロという禁止理由を撤去し、切断/休憩を含む対象を保つ | `event-room-state.ts:789` setReady、`:808` startRound、`:826-838` Ready・固定名簿分岐。`event-presentation.ts:35/71/79`、`event-room-store.ts:340`。規範01:280-283、02:285-286、06:467 | UIからReadyを消すだけではサーバが拒否/合同対象を除外する。休憩状態の新設や自動ready化で代替しない |
| CR-02 Must fix | 同じprotocol1で必須項目/actionを撤去すると旧client/serverと意味が混ざる | protocol2の厳格gateを推奨。capabilities、HTTP create、WS join、shared literal、client support predicateと固定値を同一契約変更へ | `constants/host-event.ts:1`、`ws/host-event.ts:13`、controller`:258`、create service`:58`、client ws`:73`、worker-api-client`:56/235/245` | 新client+旧server/旧client+新serverの開催を正しく拒否し、通常対戦のversion gateを無用に引き上げない |
| CR-03 Must fix | DO schema1のready削除をhydrateが受理せず、稼働旧曲の意味を無条件migrationすると対象が変わる。activeゼロだけではterminal retention中の結果回収も破る | 全体計画でschema1自動移行なし・旧runtimeによるdrainを固定。履歴回収、生存terminalの1800秒retention満了、既存cleanup完了まで待ち、復元可能v1record/旧接続なしを証明して切替 | state`:267-280` isParticipant、`:419` schema判定、`:1136` hydrate、`:832`旧合同集合、controller`:359` commit、`:210-214` terminal cleanup。規範03 §10、10 §7 | TTL短縮不可。証明不成立ならrollout停止。legacy read adapter等が必要ならReplan。稼働集合変更・期限リセット・冪等消失・旧serverへの無条件rollbackは禁止 |
| CR-04 Must fix | event history schema1とlive型が結合し、ready削除でreader/writeが不整合 | history2＋v1 reader/migrationを推奨。v1原本保持、未知版保持、同じevent IDの更新/部分完全判定を検証。history1継続案は専用DTO/legacy adapterを明示する場合だけ可 | `event-history.ts:18-24` live型、`:101-104` reader、`:138` schema判定、`:233/263` snapshot直接保存。規範10 §4/7 | v1storage keyを切り替えるだけで旧履歴が消える。新clientの更新で未知schemaや原本を上書きしない |
| CR-05 Must fix | UI authority policyがサーバの維持ルールを狭めている | client policyを新契約対応表へ整合。次曲選曲中の前曲無効化、提出済Kick、Host切断中read同期をUI/store別に確認 | `event-action-policy.ts:15/29/30`、state`:939` kick、`:977` invalidateRound、controller`:310` STATE_GET。規範01 §12.2/12.3 | next PICKINGで前曲無効化が消える、Hostが許可操作を実行できない。server側制限を緩めて補わない |
| CR-06 Must fix | 既存testの一部が旧仕様成立を証明し、規範checkerだけでは新契約の意味を証明しない | 旧Ready assertionを新対象/開始条件へ改訂し、v1/v2・migration・休憩/切断14/15・秘匿の追加検証をC必須化 | state test`:168/183/233/326/472`、規範01/02/03/06、client/worker標準test entrypoint | 旧test PASSのまま新設計PASS扱い、snapshot/record/履歴fixtureの型更新だけで意味を検証しない |
| CR-07 Note | 規範06は準備済みをsource提出条件にするが、現adapterは既にReadyに依存しない | 規範06を新合意へ同期し、adapterは条件修正より維持回帰を優先 | `source-submission.ts:351-371`、規範06:467 | parserの再実装、同曲の古いsource結果再送、ACK前の提出済み表示を避ける |

## 維持する不変条件と再利用判定

| 対象 | 判定 | コード/検証の根拠 | 新設計に向けた扱い |
| --- | --- | --- | --- |
| 開催別model/phase/room_kind分離 | 構造を再利用 | shared models、state/controller、規範10 §7。通常recordと別key・EVENT message分離 | EventRoomPhase列挙を増やす必要はなく、PICKINGの「選曲中/開始待ち」はselected chartで区別。Readyフィールド/actionは再利用不可 |
| 選曲集合・capacity・reconnect/left/kick | 条件修正して再利用 | state`:637` join、`:694` disconnect、`:1187` reconnectParticipant、`:1362/1374` selectionParticipants/activeParticipantsはDISCONNECTEDを含む。state tests容量/途中参加/復帰/退出/Kick | Readyに代えて確定eligible集合とmembershipを使う。DISCONNECTEDだけでpending_nextや欠場を作らない。LEFT/KICKEDと一時切断を分離 |
| startRound | 既存枠組みだけ再利用、資格分岐を置換 | state`:808-845` round/selection context validationは有用だがReady条件は新合意に不適合 | 合同はReadyによる除外なし。大会固定名簿/N・LEFT/KICKED欠場の既存ルールは維持。対象0人をconnected数で判断しない |
| expected-key/初回有効提出 | 再利用 | state`:848-879` submitはround IDs、playing membership、CONNECTED、未提出、sameExpectedKeyを検証。source別chart ID test`:198/213` | Ready成功を提出条件へ追加しない。再接続時の同じ開始済み曲と未提出を維持、締切後提出を拒否 |
| 未提出締切・順位/配点 | 再利用 | state`:888` closeRound、`:1228` maybeFinalize、`:1247` buildPublicRoundResult、`:1322` buildOverallResults。test`:233/278/293/363` | 14/15人提出のまま待機、締切で残り1人だけABSENT/0pt、固定Nを維持。同点1・1・3位、欠場rank null、実測0と欠場0を区別 |
| Host5分・提出だけ継続 | 再利用 | state`:694/1025/1228`、tests`:391/406/420/435`、controller absolute deadline restore tests | deadlineは絶対時刻、now>=期限優先。提出で結果を公開せずHost復帰時に確定。SKIP/進行停止。初回未接続300秒・終了後1800秒も維持 |
| private/public分離・paging・durability | 再利用 | state`:1050/1065`公開投影、controller`:340` results、`:359` commit。controller tests保存失敗/冪等/conflict/期限/秘匿/無効化cursor | 全EVENT_STATE/RESULTS/ACK/ERROR、再接続、debug経路で未公開metric/source/rankを送らない。保存前の成功ACKなし |
| source submission/notebook replay | 再利用 | source-submission`:351`、event-notebook-replay、ws tests同request ID再送。標準client testに登録 | parser/normalizeを作り直さず提出先contextを維持。ACKをauthoritative受理とする。正常連続参加でアプリ操作を要求しない |
| result syncとhistory保存の基本構造 | 局所改修して再利用 | event-results-sync public revision restart、event-history partial/complete/raw unknown、Rust event_resultの別directory。各test登録済 | live/history DTO分離とschema移行が必要。通常archive/statistics/personal bestへ流さない。未知原本保持、partialを開催再開の根拠にしない |
| 旧Ready人数/未準備警告/開始不可文言 | 再利用不可 | event-presentation readySummary/startRoundBlockReason/shouldShowCasualUnreadyExclusionWarning | 対象/次曲待ち/切断/未提出へ置換。booleanを自動trueにして旧意味を残さない |

FSM skill不変条件: INV-01 DO authority、INV-03絶対期限、INV-04 expected-key/current round、INV-05 request冪等、INV-06 Host境界、INV-07公開ロビー非掲載、INV-08 state lost、INV-09復元は維持。INV-02の開始条件とWS意味は合意に従い変更し、規範先行同期が必要。

## 互換・移行・rollbackの計画条件

1. protocol2はstrict一致とする。404/未知capabilities/旧protocolは開催だけ受付不可。通常ROOM_*のschemaや互換gateを巻き込まない。HOST_EVENT_ACCEPT_NEW=falseはcreate/新IDを停止するが、既存Host/participant・大会固定名簿復帰・進行・結果回収を止めない。
2. v1が運用済みかは本Bでは未確認。PRがOPEN、default flagがfalseでも稼働ゼロの証明にはならない。全体B計画はschema1の自動移行を行わず、Cの切替準備で旧record/接続を確認する方針を固定する。v1があれば新規受付停止の上で旧runtime・旧契約・旧対象集合のままdrainし、終了と履歴回収を確認する。さらに生存terminalの既存1800秒retention満了と既存cleanup完了まで待ち、復元可能schema1recordと旧接続がないことを証明してからv2へ切り替える。active v1ゼロだけではterminalの結果回収を破るため十分ではない。drainを新たな5分強制終了へ置換せず、TTLを短縮しない。このgateが成立しなければrolloutを停止し、legacy read adapterが必要な場合はReplanとする。
3. DO2はschema1の識別とfail-closedを明示し、未開始recordを含めschema1を無条件にhydrate/migrationしない。稼働曲のeligible/playing ID、private submission、public result、revision、fixedNを再計算しない。既存v1recordが残っていないという切替gateが破れた場合に、readyを削ってv2として読むことや、record削除を自動fallbackにしない。将来Replanで移行adapterを採る場合に限り、対象phase・構造検証・identity/generation・絶対期限・membership・source/所持・冪等の保存と原子的確定を再設計し、契約監査をやり直す。
4. 旧recordが不正/移行不能なら既存ROOM_STATE_LOSTの明示通知を維持し、空の開催生成・silent reset・通常recordへ誤hydrateをしない。未知record原本を削除することを復元の代替にしない。
5. 全体B計画はhistory2＋v1 readerを採用する。readerはv2と直前v1を支持し、v1readyを参加意思/準備完了に再解釈しない。ここでいう読取migrationはメモリ内の表示用正規化であり、v1原本への移行上書きは計画しない。unknown/unreadable原本を保持し、旧storageを読んでから新保存を行う。読取変換失敗時は元データを維持し、保存成功・公開結果受信・完全同期をそれぞれ区別する。
6. history1維持という代案を採るなら、liveと別のlegacy participant DTOを定義して必須readyを非機能の互換欄として書き、reader契約を維持する。その欄はUI/開始/参加判定へ使用しない。これを採らずに同じschema1で必須項目を消すのはbreaking隠蔽になる。
7. rollbackは新規受付停止→既存v2終了/結果保存/回収→生存terminalの既存1800秒retention満了と既存cleanup完了→復元可能schema2record/旧接続なしの証明→互換server/clientへ戻す順。activeゼロだけでは不十分で、証明不能ならrollback停止。v2recordをv1-only serverへ渡さない。history2を保持する旧clientは読めない旨と原本保持を確認する。新規停止だけで既存開催まで安全になったと判断しない。

## missing updates

将来の同一契約変更で同期が必要な面を列挙する。今回はいずれも変更していない。

- 規範01: Ready/対象/開始条件、選び直し・次曲に準備resetを残さない。切断と明示退出の差を保持。
- 規範02: event protocol版、capabilities/HTTP/WS gate、SET_READY撤去、公開snapshot/自己操作一覧、Host切断read/submit境界。
- 規範03: event public/内部schema版とvalidator、participant ready撤去、history DTO/schema、migration/restore境界。
- 規範05: 専用入口・Top維持、開始待ち・役割別操作、参加者毎曲操作廃止、前曲管理/履歴導線。
- 規範06: `準備済み`提出条件と準備/開始説明を改訂。parser/newness/expected key/skipは維持。
- 規範07: event protocol/room/history版定数、関連拒否理由。通常TTL/SourceTypeは維持。
- 規範10: 分離・現行+直前schema・rollout/rollbackの具体適用を同期。
- shared: constants、models、ws action/map、HTTP API型、exportと利用fixture。
- Worker: capabilities/create/route、controller action shape/switch/gate、state persistence validator/mapper/target semantics、RoomDO event識別/復元連携。
- client: worker-api-clientの複数protocol1固定値、event-ws-client join literal、store SET_READY、policy/presentation、UI/fixture、source context型、history writer/reader/Rust保存連携。
- test/checker: 新契約fixture、変更したtestの標準entrypoint、規範checkerに必要な意味確認を追加。旧taskは履歴として保持し、新taskで新契約を正本指定。

## validation gapsと必要検証

親の現HEAD再実行: client標準test 121/121、worker標準test 156/156、Host Event integration `scripts/host-event-e2e.test.mjs` 4/4、root typecheck成功、lint成功（0 warnings）、client build成功。integrationのhelperにも旧Ready操作がある。これらは旧仕様ベースラインと再利用候補の品質根拠であり、新合意適合の証明ではない。詳細は`phase-b-evidence.md`を参照。旧PRの当時PASS主張とは区別する。

Cの必須検証は以下。QUALITY.md本文を正本とし、skill参照表の節番号/古いsource列挙だけで検証範囲を狭めない。

- root typecheck/lint、client build、Worker wrangler dry-run、標準client/worker tests、design contract checker。新testは標準entrypoint/CIと同等以上を確認。Rustを変更した場合cargo checkと該当保存/parser test。
- CASUAL/TOURNAMENT × 専任/兼任 × Readyなしの開始。確定譜面/対象1人で開始、0人/Host切断/未確定譜面で拒否。休憩申告は製品状態にしない。
- 15人中1人切断（確定前と確定後）/休憩→全15人対象→14人提出で待つ→締切のみ残り欠場、固定N=15、大会0pt/合同ptなし→次曲対象15人。一時復帰の同曲提出、締切後拒否、明示退出後次曲待ちを別assertion。
- ターゲットmembershipと共通譜面: disconnected保持、late join/left return pending_next、dedicated Host除外、20人cap/0人、確定前再計算/確定後凍結。
- fixedN/同点1・1・3位/順位飛ばし/SCORE0・MISS9999/欠場rank null/無効曲再集計/0確定曲架空優勝なし。
- Host期限299999ms復帰、300000ms以降期限優先、alarm/再起動/再接続で延長なし。切断中SUBMITだけ受理し、全員提出でも未公開、復帰で公開、期限で未確定曲無効。初回未接続・終了後retentionも回帰確認。
- 権限/action context: generation/event/round/selection revision、不正Host操作/他人SUBMIT/旧socket、同request再送/異payload conflict、保存失敗→再試行、ACK前の提出成功表示なし。
- 未確定score/source/rankの非送信をHost/participant、EVENT_STATE/RESULTS/ACK/ERROR、reconnect、debugへ全経路確認。invalidated markerへprivate結果が漏れない。
- v1/v2 client-server組合せ・未知capabilities・unknown schema・v1record各phaseの自動移行拒否・旧runtime drain/結果回収/terminal1800秒retentionと既存cleanup・復元可能v1record/旧接続ゼロgate・history v1→v2/unknown保持・通常stats非流入。migration原子失敗と再起動はhistory読取移行で検証し、DO adapterを後から採る場合はReplanで追加する。通常ARENA/BPL/BPL4のReady/進行、duplicate pick、TIMEOUT/FORCE_ADVANCE、SKIP_HOST_ASSIGN拒否、ROOM_STATE_LOSTを回帰する。
- source4種類（legacy有効時を含む）のparser/matching/newness/ACK-based retry。連続同譜面でも新round IDと古いnotebook結果を区別。実ファイル/20端末/実時計/保存は独立試作の成功を代用しない。
- UI source evidenceは合意試作の役割/20人/狭幅/配置/overflow/主操作とpolicyの対応。前曲無効化は次曲確定後でも開始前なら実行可、開始後不可。画面移動はLEAVEにならず、退出/Kickは明示操作。

Bのこの資料では実製品変更がないため、追加build/実通信/E2E/schema migration試験は未実施。残riskはCの上記検証へ帰属する。新規MarkdownのUTF-8 no BOM/LF、参照path、変更範囲を確認する。

## 判定

新体験を妨げる主要差分はReadyだけでなく、protocol・DOrecord・history・UI authorityまで追跡できた。契約変更は一部既存コードの置換と既存基盤の再利用で成立する見込みで、全面書き直しの根拠はない。breaking領域のconsumerと移行・rollbackをCで必須化した。

`pass-with-followups` / `COMPLETE`はPhase Bの契約調査としての判定。CR-01〜06はBでC必須scopeへ明示再スコープ済み。新製品の実装監査/互換保証/実行許可は未取得であり、Cはユーザーの明示解除後にのみ開始する。仕様追加の相談事項は検出していない。稼働v1があり提案したdrainで対応不能、維持ルールの変更が必要、または原本保持が成立しない場合は実装を進めず`ESCALATION`とする。
