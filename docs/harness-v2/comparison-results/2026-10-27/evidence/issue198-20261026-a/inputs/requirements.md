# 維持する保証とHarness v2への設計要求

本書のQ/Rは#197の設計入力。製品仕様を再定義するものではなく、詳細値・例外はリンク先の規範を正とする。現行規約への処置は[inventory](inventory.md)、実証の合否は[comparison-plan](comparison-plan.md)へ対応する。

## 絶対に弱めない保証

「既存接点」は調査で見つけた実装/テストであり、今回それらを全実行して製品保証を再認定した意味ではない。テストがあることと、対象変更を実証できることは区別する。

| ID | 保証・失敗条件 | 規範/既存接点（rootからのpath） | 必要な検証可能な証拠 |
| --- | --- | --- | --- |
| Q01 FSM/authority | Workerはthin、RoomDOがFSM/時刻/権限/受付/集計の正本。client storeで成立を捏造しない | [01_fsm](../design/01_fsm.md) §0〜4、worker/client local、`durable/room-state.ts`・`room-object.ts` | 正常遷移と不正遷移拒否、host/non-host、STATE_GET/resync。通常create→ready→pick→play→result、再戦reset。表示phaseをRoomStateへ追加しない |
| Q02 timer/deadline | 起点・期間・TTL・timeout主体を維持。client表示変更でDO期限を動かさない | [01](../design/01_fsm.md) §4、[07](../design/07_constants.md)、`constants/timers.ts` | fake clockの直前/一致/直後、alarmの複数期限、復元後の経過期限、重複alarm。主要な実時計経路も該当時に確認。共通定数との差を検知 |
| Q03 WS/受付 | envelope/type/payload、expected/observed/current round/generation、初回確定・host権限を維持 | [02](../design/02_ws_protocol.md)、[06](../design/06_source_io_spec.md) §1.2、shared/ws、`contract-guards.test.mjs` | 正常/欠損/不正payload、key不一致、旧round/generation、確定後提出、SKIP_HOST_ASSIGN拒否、TIMEOUT/FORCE_ADVANCE。未知/加法fieldの互換を明記 |
| Q04 冪等性 | `(player_id, client_msg_id)`と各request_idの重複排除を、意図された保存寿命/再作成境界で維持 | 02 §0/Envelope、[INV-05](../../.codex/skills/fsm-protocol-guard/references/fsm-protocol-invariants.md)、`room-object.ts: persistRoomRecord` | 同一再送、新client_msg_idで同request、処理中/受付後/復元後/世代変更のreplay。二重確定・二重統計・二重SEがない。全IDを永久保存する設計にも変えない |
| Q05 DO復元/再接続 | hibernation/recoveryで進行を発明しない。stale socket closeが新socketを切断しない。復元不能はROOM_STATE_LOST | 01、[10](../design/10_regression_guard_addendum.md) §2、`room-object.ts` attachment/persist、`room-object.test.mjs` reconnect test | cold restore/欠落/破損storage、旧attachment、socket交換と遅延close、host猶予、明示退出との差。ROOM_STATE_LOSTでblocking UIとローカル部分結果。mockだけの試験を実hibernationと呼ばない |
| Q06 lobby race/成長 | Directoryのみがpublic summaryの正本。stale cleanupはnewer/recreateを消さず、token同ms再一致なし、補助stateはbounded/reclaim可 | worker local、QUALITY §3.2、`lobby-directory-object.test.mjs`、`routes/lobby.test.mjs` | probe→await→newer upsert→古い削除、同ms、delete→recreate、順序逆転、legacy helper restore、remove/TTL後のstorage。API公開schemaに内部token等を漏らさない |
| Q07 結果/履歴 | RESULT_READYのsummary/per_round.rounds/per_player.playersとrated正本を維持。未完をauthoritative結果にしない | [02](../design/02_ws_protocol.md) §4.5、[03](../design/03_data_model.md) §8/9、[10](../design/10_regression_guard_addendum.md) §3、`features/stats` | worker生成→shared→client利用→保存→読戻し。`current_match_id → RESULT_READY.summary.match_id → room_id`のfallback条件、同match統計の重複防止、unratedでも履歴保持 |
| Q08 保存/復元互換 | schema_version、optional加法とbreaking更新を区別。現行+直前、旧版fallback、失敗観測とデータ保全 | 03 §9、10 §4、`services/result-archive.ts`、`features/stats`、Rust storage | 旧writer値→新reader、新writer→対応reader、欠損/null/破損/未来版、失敗ログ・再保存。現writerが生成しない旧値を即拒否してよいと推測しない。将来直前版が生じた時の移行も対象 |
| Q09 Source I/O | 1端末1source、参加中変更不可。3主要source+許可時legacy。正規watcher/parserを通す | [06](../design/06_source_io_spec.md)、[10](../design/10_regression_guard_addendum.md) §1、Rust parsers/watchers、source-store/submission | notebook summary主キー/recent timestamp一意補完、v3 local WSの新着差分/battle/chart_id、Reflux exscore/bad+poor/hash、legacy絶対値。stale/replay/非同期中context変更、SOURCE_UNAVAILABLE/TECH、未同定の明示承認。直接WS成功を実source証拠にしない |
| Q10 consumer/rollout | sharedは契約専用、全consumerの型/parse/serializeを整合。片側移行なし | shared local、10 §5、shared/src、client/worker usage | additive/breaking分類、client旧/新×worker旧/新、該当保存版fixture、最低client版/期間/撤去条件。破壊的変更は規範・互換戦略・公開順を先に明確化 |
| Q11 UI/native/source正本 | 指定wireframe/画像を確認し、authoritative/stale/fallback/source異常を表示で区別 | AGENTS §6.4、QUALITY §3.7、[05](../design/05_screen_list.md)、指定UI source、Tauri bridge | 参照path/hashと対象状態、host/player/spectator、text/layout/visibility/placement/overflow/幅/keyboard。ブラウザmockと実Tauri別窓・保存・watcherを区別。正本未読で準拠PASSにしない |
| Q12 検証の面/失敗透明性 | touched filesに必要なtest/型/E2Eを取りこぼさず、失敗・skip・未計測を隠さない | QUALITY §1.1/3/5、root/client tsconfig、package scripts、validate-reusable | ファイル集合とcommandの対応、exit code/log/HEAD、初回failと再実行passを併記。CI greenは選択面の合格であり全品質証明ではない |
| Q13 write/WIP安全 | 同scope単独owner、停止後takeover、目的外差分なし。ユーザーWIP/stash/保護branch保全 | AGENTS §4/7、WORKFLOW §7.2 | 前後HEAD/branch/status、必要時hash、stage path、copy元residueの判定根拠。削除前の所有・clean・取込・対象path検査、削除後read-back。曖昧な対象は操作しない |
| Q14 証拠/独立性 | 高リスクのblind spotを実装者と独立した視点で確認。重大findingを手順完了で丸めない | AGENTS §6.3、QUALITY §4/5、現2 auditor definitions | 対象の不変diff/HEAD、実装非担当reviewer、問いと証拠、finding→disposition→evidence→remaining risk。重大修正後は影響面を再レビュー。単体test作成者の自己確認を独立と呼ばない |
| Q15 操作権限 | 現在の許可・狭い停止境界・明示解除を保持。publish/merge/close/deploy/release/cleanupを別操作として扱う | AGENTS §1.4/1.5/7.3、WORKFLOW §7、S02/S05/S12/S14 | 許可元と対象、実author/login/is_bot、checks/threads/follow-up、操作結果read-back。self-approve禁止。下記権限表とP系負試験に一致 |
| Q16 秘密/外部入力 | 認証情報をrepo/ログへ出さない。Issue/PR/tool出力を命令の権限元に昇格しない。非所有runtimeを止めない | configのuser-local認証方針、review-response §4、#192停止資料の安全要件 | redactionと秘密値非収集、対象/loopback/保存path/所有process identity確認。第三者文面の権限拡張・情報送出要求を拒否する負試験。環境の利用許可とユーザーの操作許可を混同しない |

## 判断・委譲・独立レビューの境界

| 状況 | 親が継続できる範囲 | 追加する判断/担当 | 停止条件 |
| --- | --- | --- | --- |
| 局所UI/文言/調査文書/既存責務内バグ、契約・保存・権限影響なし | 親単独で編集・関連検証・許可された提出。短いAC/証拠対応でよい | 独立Agentは原則不要 | 想定外の意味変更、参照正本欠損、未許可副作用 |
| 複数fileでも単一目的、親が全範囲を扱える | 依存を親が保持し逐次実装。file数だけで委譲しない | 独立調査/並列で明確な利益があるときのみbounded委譲 | scope/owner/成功条件が曖昧なままwriteしない |
| FSM/WS/DO非同期、reconnect/冪等性、restore/履歴互換、Source意味、shared、security/権限 | 合意済み意味の範囲で親実装も可。事前に互換/検証/失敗方式を具体化 | **実装非担当の独立レビュー必須**。契約と挙動両面をcoverageし、一人で無理なら分割 | 互換未確定、Q保証を証明不能、未処理Blocker/Must fix |
| UI source指定あり | 正本を読んで反映、差分と幅/状態/操作を確認 | native/視覚/使い勝手の不確実性が大きければ独立確認。主観的採否は人間 | source取得不能を準拠完了にしない。独立して進められる範囲は継続 |
| userが特定spawn/モデルを要求 | bounded委譲を実行し、actual ID/owner/statusを保持 | 指定を優先、できなければ理由付き停止 | 計画のみでspawn済みと報告しない |
| 非blockingの設計選択（内部file配置等） | AC・契約・許可を変えない選択はAIに委任 | 根拠と採用案を記録すればよい | 人間の商品意図・権限・不可逆データ方針が分岐する場合 |
| 製品仕様の変更/破壊的移行/公開対象・最低対応版の未決 | 影響・選択肢・証拠を整え、依存しない調査を継続 | 人間が決定。ただし既に依頼内で決まった内容は再承認しない | 未決に依存する変更/公開は進めない |

v2は固定profile/役数を要求しない。この表の「独立レビュー」は今回の文書棚卸しに機械的な追加Agentを要求するものではなく、#197が実装し#198で品質を測る将来の保証である。

## 人間の権限を残す操作

| 操作/条件 | 必要な権限・証拠 | AIへ委任できる部分 |
| --- | --- | --- |
| read-only調査、許可されたgoal内の可逆編集・検証 | 現在依頼のscope。planning-only/read-onlyならその境界 | 探索範囲、内部方式、必要検証、結果の照合 |
| commit/push/PR・Issue投稿/返信 | 当該操作が依頼範囲にあること。投稿結果URL/id/read-back | scoped stage、body作成、正本リンク、HEAD/base/author照合 |
| Standard bot-created PRのmerge | 現requestがmerge後処理を含み、実author.is_bot、human Approve、checks green、actionable unresolvedなし、follow-up判定済み | gate照合と許可済みmerge。Approveからclose/deploy許可を創作しない |
| Standard task-owned/user-authored strict fallback | single-maintainer same-account deadlockの証拠と**明示merge許可**、checks/threads/follow-up条件 | lane/read-back。human Approve単独は許可にしない |
| High-Risk merge | 明示mergeまたはauto-merge許可に加えreview/check/thread等のgate | 同上。self-approveは全laneで禁止 |
| deploy/release/最低client版/本番resource変更 | 対象と操作の許可、互換判断、失敗時復旧。文章のみ依頼は公開許可でない | 許可後の反復操作、事前検証、結果照合。互換判断が依頼で固定済みなら再質問しない |
| Issue close/cleanup | current requestに含む。mergeを前提とする依頼ならmerge成立→closure evidence確認→close→cleanup | task-owned clean/取込済みcodex対象の照合。current/base/protected/dirty/WIPは削除しない |

特定アカウント名だけでbot laneを推定しない。author読取不能・権限証拠不明・チェック欠落は操作を停止し、不足を説明する。

## 自動化へ移せる品質保証

以下は**未実装の移管要求**。今回既存CIを修正した意味ではない。

| ID / 対象 | 現在の機械保証・不足 | #197で設計する検査 | 機械だけでは決めない部分 |
| --- | --- | --- | --- |
| V01 diff/ownership | git diff/statusはあるがGoalとの照合は人手 | 許可path/禁止path/owner/staged diff、copy元、前後hash/HEADのread-only検査 | WIPの由来、目的内かという意味判断 |
| V02 検証selector | QUALITYと派生matrix、CIに選択器なし | touched files **と変更意味**→Q ID→必須command/独立review/未実行。unknownは安全側+理由 | 予期しないauthority/互換影響の発見 |
| V03 test membership | client手動列挙、型面の差、CI statsのみ | 変更testの列挙/型include/test実行への到達を検査。root型とworkspace型を区別 | assertionが要件を検証するか |
| V04 CI parity | quick/fullの面が明示、client全test/design/webは未接続 | root/client/web/native/Workerの必要面とCI/local差を出力。既存#184 follow-upと重複作業しない | docs-only等の非該当理由、実機不足 |
| V05 契約 | design checkは文字列、guard testsは一部挙動 | enum/envelope/type/parser/serializer/fixture/consumer roundtripと不正入力、契約一覧の到達性 | breaking意味/rollout/最低client版 |
| V06 非同期/復元 | DO/lobby unit testsがある | fake clock、await barrier、old/new socket、cold storage、replay、同ms/delete→recreate、成長/回収 | 実DO hibernation・本番に近い環境の差 |
| V07 保存 | stats/overlay等にtest接点、result archiveは別経路 | writer→保存→reader、現行/直前/未来/破損、失敗後再試行。静的型だけでは不可 | データ破棄/移行の製品判断 |
| V08 Source/native/E2E | local E2E scriptsはCI外、Rust parserあり | 隔離fixture→実watcher/parser→client送信→DO受付→表示/保存を相関し証拠保存 | 本人実プレーや実OS窓確認をmockで代替しない |
| V09 UI | fixture/visual scenarios/表示testあり | design source hash・状態/幅/overflow/keyboard・操作canSend等の回帰 | 主観的使い勝手、実Tauri別窓 |
| V10 定義解決 | check:agentsはexact8役を検査 | v2で使う構成/Skill参照/モデル/owner/権限のschemaと実ロードsmoke。legacy laneとは分離 | 実環境・バージョン差、モデルの振る舞い |
| V11 外部操作 | skillにread-back手順あり | author/lane/check/thread、expected HEAD、comment存在、merged/closed stateの取得と許可照合 | merge/deploy/cleanup等の許可そのもの |
| V12 計測/証跡 | task/ログは分散、完全なusageなし | Goal/AC/Q/command/HEAD/log/finding、親子usage/turn/tool時刻の関連付け、欠損を未計測表示 | 指標の因果・採用・品質tradeoff |

既存テスト/CIの改修が製品側に及ぶ場合、#197のNon-scopeを守り、必要なgapと暫定の明示実行・証拠を提出する。Harness用selectorや検査の試作と、製品テストの意味変更を混同しない。

## #197への必須設計要求

| ID | 要求・受入方法 | 関連保証/比較 |
| --- | --- | --- |
| R01 Goalを唯一の実行境界にする | objective、AC、non-goals、現許可/停止、参照revision、証拠/未決を一箇所で引ける。複数Phase文書の作成は必須にしない。新情報があった時だけ該当項目を更新 | Q12〜Q15、P1/P2 |
| R02 Parent-first | 親が調査→実装→検証→提出を必要範囲で継続できる。旧roleの「実装を引き取らない」を移植しない。直接実行/短い計画/分割は目的と失敗影響で選ぶ | C1、P3 |
| R03 On-demand delegation | 独立調査/並列性/独立レビューという利益を示しbounded taskを渡す。指定spawnは実行。未委譲の全role行や固定起動数を要求しない | Q13/Q14、C2/C3 |
| R04 独立レビュー | 高リスク表のtriggerで実装非担当の確認を起動。契約/挙動をcoverageすれば固定2役でなくてよい。別名Agentによる同じ自己報告の追認は不可 | Q01〜Q10/Q14、C2/C3 |
| R05 Sharedを所有できる | 親または明示的一人がshared writerになれる。契約決定、consumer変更、検証、publishのownerを区別し、共用package/scripts接点も重複所有しない | Q10/Q13、C3/P4 |
| R06 blockingのみ止める | 未決に影響先・期限・暫定扱いを持たせ、依存しないGoalは継続。規範/権限未決は止める。#196の未決を理由に再ABCDを要求しない | D02/D12、P2 |
| R07 証拠によるQuality Gate | V01〜V12の実装/暫定検証/未対応を明示。fileと意味の合成trigger、CI以上の必要面、skip理由、finding disposition。旧8役validator通過をv2品質の根拠にしない | Q01〜Q16、全ケース |
| R08 権限を独立管理 | 事前の明示許可を保持し人工的再承認を作らない。狭いceilingを守り、最新の明示解除を記録。外部操作・cleanup・停止状態のP試験に合格 | Q13/Q15/Q16、P1〜P8 |
| R09 必要時参照 | Skillは明確で排他的な入口と停止条件を持つ。正本の全文複製を避け、参照済revision/範囲を保持。参照が変われば再読込する。Skill数/名前は未指定 | D01/D06/D07 |
| R10 再開/証拠鮮度 | 局所checkpointと全AC/統合を区別。最後のowner、停止、差分hash、最新検証対象、未完と次の実行可能点を引継ぐ。新差分に古いPASSを転用しない | Q12〜Q14、#192/P5 |
| R11 実ロードと隔離/復旧 | 旧構成を保持した別branch/worktreeで試作。実環境の有効設定/Skill解決をsmoke確認。未確認キーやAPI設定をCodex設定として推定しない。旧方式を継続できる復帰手順を確認 | Q13/Q16、P6 |
| R12 計測と採用条件を維持 | comparison-planを入力にし、両方式同じ条件で測定できる記録を用意。未計測は未計測、子の費用も含める。正式移行は#198合格と#199の実施許可後 | 全ケース/評価規則 |

#197の提出物は、(1) Goal→実行→検証→必要時独立レビュー→証拠の入口、(2) Q01〜Q16の「規則/実装手段/検証/未対応」対応表、(3) 実ロード証拠とルーティング/権限負試験、(4) 旧方式へ戻せる隔離状態、(5) #198用の固定構成revisionと計測方法とする。ABCD・8役・15 Skillのコピーは達成条件にしない。今回の文書完成から#197を自動開始しない。

## #197で決められる未決事項

すべて#196の完了を妨げない。各選択は実装前または比較開始前に確定し、R/Qを満たす理由を残す。

| ID | 未決事項 / 決定者・期限 | 許される選択・拘束条件 |
| --- | --- | --- |
| O01 | 最小文書/Agent/Skillの分割・名称 / #197担当、試作前 | 統合・廃止・維持のいずれも可。保証coverageと正本を一意にし、役数を目標にしない |
| O02 | quality selectorの形式/実装言語 / #197担当、gate smoke前 | 宣言表/スクリプト等。semantic override、unknown、skip、CI差を表現する |
| O03 | 独立レビュー1名/複数、実行タイミング / #197担当、各高リスク実行前 | contractと挙動のcoverageを満たす。実装者と独立、重大修正後再確認 |
| O04 | Codex実有効設定/Skill解決、利用可能telemetry / #197担当、#198入力凍結前 | ローカルruntimeのread-backとsmokeで確認。公式APIの能力とdesktopでの有効性を同一視しない |
| O05 | 自動化gapを隔離試作内で満たすか後続へ分けるか / #197担当、提出時 | Q保証は削除せず、明示検証で補完し未対応と残リスクを報告。製品/CI意味変更は別scope |
| O06 | 正式移行の採否・許容tradeoff / #198評価と人間、#199前 | 品質hard gateと事前比較条件を緩和しない。コスト未計測なら削減を根拠にせず追加測定/限定評価。#199には別途実施許可 |
