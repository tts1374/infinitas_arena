# 現行構成の棚卸し・分類

基点と出典一覧は[evidence](evidence.md)。以下はv2への処置案であり、今回の削除・変更指示ではない。

## 分類の定義

| 分類 | 意味 |
| --- | --- |
| Keep | 保証や境界を維持。現行の文量・配置まで固定する意味ではない |
| Automate | 機械検証/操作のread-backへ移す。実装・負試験の証拠が揃うまで文章の保証を撤去しない |
| Simplify | 意味を維持し、重複・必須出力・起動条件を絞る |
| Replace | 同じ目的を別の判断/実行方式で満たす。代替保証の実証が必要 |
| Retire | 当該形式を必須とする理由がない。失う機能は別の保証IDで保持する |

## Governance・実行規則

同一の目的と処置を持つ規則は一行に束ねる。参照節がその規則群の範囲であり、例外や異なる処置は別行に示す。導入背景は記録で確認できたものだけを採用し、事故の推定はしない。

| ID / 出典 | 現行責務・規則群 | 分類 | 根拠・導入背景 | 変更時のリスク/必要な代替 |
| --- | --- | --- | --- | --- |
| G01 AGENTS §0/1.1/1.2 | 3文書の優先順位、local追加規約、v1既定、最小差分 | Keep | 正本競合・目的外編集を抑える境界 | 統合時の優先順消失。保証の唯一の定義元を示す |
| G02 AGENTS §1.3 | 判断はAgent、定型処理はSkill | Simplify | 役割と参照手順の二重実装防止。ただしreadiness Skillは判定を返す | 名前による厳密分離より、権限の所有者と機械的根拠を定義 |
| G03 AGENTS §1.3.1 | outcome-first、継続/停止境界、可変入力を定義へ埋め込まない | Keep | #190関連taskでモデル更新と責務を整理。手順で成功条件を代替しない | 短文化で許可副作用・停止条件を落とさない |
| G04 AGENTS §1.4/1.4.1、WORKFLOW §0.2 | 正本・狭いceiling・明示解除・same-turn許可 | Simplify | `codex-phase-c-implementation-ready-default`に再承認停滞の修正目的が明記 | 古い起票ceilingの誤適用/無断拡張。現在の許可履歴と成果物境界を一元保持 |
| G05 AGENTS §1.5 | sticky制約、再指摘の持越し | Keep | ユーザー制約の喪失を防ぐ | 最新の明示解除を含めて更新し、旧制約を永久禁止にしない |
| G06 AGENTS §1.6、QUALITY §3.5 | 日本語出力、識別子維持 | Keep | `codex-governance-output-and-audit-evidence`に目的記録 | 外部提出用原文の明示指示も保持 |
| G07 AGENTS §2 | 固定8役・Phase別責務 | Replace | 品質責務は必要だが役数は品質の証拠ではない | 親実装時の自己検証偏り。Q14の独立レビューを残す |
| G08 AGENTS §3、WORKFLOW §6/6.0 | bounded packet、planとactual recordの区別、実spawn証拠 | Simplify | #135のtaskは「紙上委譲」を防ぐ目的を記録 | 委譲したと装う/無期限作業。実ID・範囲・結果は残し未委譲N/A列を毎回作らない |
| G09 AGENTS §4 | 1 write scope = 1 owner、停止後takeover、親の同時編集禁止 | Keep | 同時writeの競合防止。親単独実装の禁止ではない | shared/common接点の二重所有。実ファイル単位のownerを確定 |
| G10 AGENTS §5 | contract-sensitive列挙、consumer整合、互換方針 | Keep | design 01/02/03/06/07/10の製品契約 | 片側移行・規範漏れ。Q01〜Q10を適用 |
| G11 AGENTS §6.1/6.2、QUALITY §4 | 状態6語・severity4段階 | Simplify | 運用識別は有益だが役ごとの同一表の再掲は不要 | verdict/進捗/許可を混同しない。状態と許可は別フィールド |
| G12 AGENTS §6.3、QUALITY §5 | AC・必須検証・監査・finding dispositionによる完了判定 | Keep | #190以前のevidence taskで追跡性を追加 | 手順完了のみのCOMPLETE。未処理重大findingを止める |
| G13 AGENTS §6.4、QUALITY §3.7 | UI正本・反映差分・実確認 | Keep | `codex-governance-output-and-audit-evidence`の明示目的 | mock/画像未読を見た目準拠と誤認しない |
| G14 AGENTS §7、QUALITY §2 | scope、整形/生成物/lockfile制限、UTF-8/LF | Automate | diffと変更許可pathは比較可能 | パスのみで意味変更を見逃す。意味レビューは併用 |
| G15 AGENTS §7.1、WORKFLOW §7.2 | source residue分類、WIP保全、隔離後reconciliation | Automate | branch sync Skill・improvement roleに再発課題として記載 | 同内容だからWIP破棄可と決めない。由来/許可/内容照合が前提 |
| G16 AGENTS §7.2、WORKFLOW §7.2 | task-ownedでclean/取込済みの対象だけcleanup、read-back | Automate | destructive操作の対象制限 | squash時の単純ancestor誤判定。PR/内容証拠も必要、判断不能なら停止 |
| G17 AGENTS §7.3、WORKFLOW §7.3 | self-approve禁止、実author lane、approval/explicit merge権限 | Keep | #168 taskは#167 incidentを出典にlane混同を防ぐ | authorityを機械既定で拡張しない。Q15の判定表を保持 |
| G18 AGENTS §8、WORKFLOW §8 | TOML正本、設定モデル、命名・定義検査 | Replace | 現validatorは8役・定型見出しを固定検証 | v2を旧8役へ強制整形しない。新構成の実ロード/参照検査へ置換 |
| G19 WORKFLOW §0.1 | Entry Protocolの10項目 | Simplify | goal/risk/権限の入口は必要 | 同一内容をtask/kickoffへ転記してドリフト。作業契約を一度保存 |
| G20 WORKFLOW §1/3 | ABCD、Local-Fast/Standard/High-Riskの順路 | Replace | 問題発見/実行/証明は必要、固定Phase遷移は不要 | 小変更でも全順路を再現する/逆に高リスク証明を省く。保証triggerで選択 |
| G21 WORKFLOW §2/5 | Plan Mode trigger、tasks必須、計画16項目 | Simplify | 互換/非同期変更は事前の方式・検証説明が必要 | 計画書存在を安全と取り違える。不可逆判断・依存がある時に具体化 |
| G22 WORKFLOW §4.1、readiness Skill | pendingが残ればNOT_READY対blockingのみ判定 | Replace | 文字どおりでは両立しない（D02） | 影響のない未決で停止/危険な未決を無視。依存Goalごとにblocking判定 |
| G23 WORKFLOW §4.2/4.3 | bounded開始、検証/監査を終えて次へ | Keep | 実装・完了に必要な入力と証明 | 一タスクの局所完了と統合完了の区別を残す |
| G24 WORKFLOW §6.1 | Standard non-spawnは4条件すべて必須 | Replace | 単一レイヤでも複数task/検証で委譲へ寄る | 親単独の能力に関係なく調整役が増える。利益と独立性で選ぶ |
| G25 WORKFLOW §6.2 | High-Riskは実装委譲＋契約/品質2監査必須 | Replace | 監査の独立性は有益、実装の外部委譲自体は品質保証でない | 監査1名に広すぎるscopeを与えるリスク。範囲/独立性/証拠で数を決める |
| G26 WORKFLOW §6.3、kickoff template | 再判定・出力9節とREADY/許可の分離 | Retire | 毎回の固定Kickoff文形式を廃止候補とする | 許可と停止条件はG04/G19に残す。実spawnはG08で記録 |
| G27 WORKFLOW §6.4、QUALITY §1.1 | CI parity、test include/excludeと列挙の照合 | Automate | client workspaceはtest.ts除外、標準testは手動列挙 | greenでも対象未実行。ファイル集合と実行結果を照合 |
| G28 WORKFLOW §6.5 | scope拡大/契約/依存/CI等のReplan Gate | Simplify | 安全な継続と相談境界が必要 | 内部実装選択まで再承認しない。未許可の意味/副作用変更で停止 |
| G29 WORKFLOW §6.6 | 毎回のGovernance Feedback、Phase D artifact | Simplify | 再利用可能なギャップだけを後続化する意図は妥当 | 各小修正から大量のIssue-ready文書を作らない。反復/重大性を条件化 |
| G30 WORKFLOW §6.7 | reviewの検証→返信→resolve→再依頼、read-back | Simplify | scope逸脱・未解決thread・偽成功を防ぐ | 返答未投稿のresolveや権限拡張を防ぐ保証は保持 |
| G31 WORKFLOW §7/7.1 | PR必須6節、close evidence・milestone対応表 | Simplify | 第三者への証拠は必要、固定節や同文再掲は目的でない | AC/検証/残リスク/関連リンクを省かない。closeは別許可の操作 |
| G32 QUALITY §1/3.1〜3.4 | 常時技術検証、契約/lobby/source/E2E追加 | Automate | 変更分類から検証集合を選べる | docs-onlyにも製品全検証を要求/semantic triggerをパス判定だけに縮退。人による拡張可能性を残す |
| G33 QUALITY §3.5/3.6 | 定義整合・workflow証跡の多数チェック | Replace | 8役/ABCDの正しさと品質/権限が混在 | 旧構成を満たすためのvalidatorをv2へ持ち込まず、Q/R保証の負試験に変更 |
| G34 client local §1〜3 | server authority、source/fallback表示、typed fixture、test parity | Keep | UI都合で契約を再実装しない | 型だけでnative/実sourceを実証済みにしない |
| G35 worker local §1〜3 | DO authority、freshness、bounded state、restore/reconnect | Keep | #155等のtestで同ms/recreate/restoreを確認可能 | mock unitと実hibernationを区別する |
| G36 shared local §1〜3 | cross-layer専用、additive/breaking、consumer、rollout撤去条件 | Keep | 契約変更の正本責務 | 固定roleにshared writerがない（D03）。毎回明示ownerを置く |

## 8 Agentの責務

正本は[.codex/agents](../../.codex/agents)。現設定は全役モデル継承、high 5役/medium 3役。単なるAgent数削減を成功指標にしない。

| ID / Agent（effort） | 現責務 | 分類・v2で必要な能力 | 根拠/リスク |
| --- | --- | --- | --- |
| A01 strategy-orchestrator（high） | 入口/Phase/Plan/編成、17項目出力。実装を既定で引き取らない | Replace: 親のGoal解決と権限保持へ | Parent-firstと現prohibitedが競合。ルーティング専任の維持は不要 |
| A02 spec-designer（high） | 曖昧要求、fixed/pending、READY | Simplify: 親の不足判断、独立調査時のみ補助 | specと実行を分ける価値は重大未決時。毎回別contextは不要 |
| A03 execution-coordinator（high） | bounded分割、ownership、依存、CI面 | Simplify: 親が通常所有、複雑な独立分割時だけ委譲 | 調整役自身は製品を書かずshared欠落を埋めない |
| A04 front-implementer（medium） | client UI/state/source/native、停止境界、visual evidence | Replace: 必要時のbounded実装能力 | 親実装を許容し、委譲する場合のclient境界と証拠を維持 |
| A05 server-implementer（medium） | Worker/DO/timer/冪等性 | Replace: 必要時のbounded実装能力 | 同上。shared/clientを暗黙に所有しない |
| A06 contract-auditor（high） | docs/shared/consumer整合、互換、missing updates | Keep: 独立契約レビュー能力 | #192に独立検出記録。role名・常時別Agentは固定しない |
| A07 implementation-auditor（high） | 振る舞い、CI parity、visual、finding ledger | Keep: 独立品質レビュー能力 | A06との検証gap/dispositionが重複。異なる問いがあれば分割 |
| A08 improvement-analyst（medium） | D優先度/Issue-ready/残リスク/release入力 | Retire: 専任roleを必須とする方式 | 親の結果整理で可能。重大未解決をbacklogへ逃がすのは禁止 |

## 15 repository Skill

対象は[.codex/skills](../../.codex/skills)に実在する15件。ユーザー共通/外部plugin Skillはこの15件に含めず、実行環境の追加入力として扱う。存在理由は各SKILLのObjective/Boundary、リスクは以下の処置時のもの。

| ID / Skill | 現責務・起動条件 | 分類 | 根拠と代替/リスク |
| --- | --- | --- | --- | --- |
| S01 branch-latest-sync-flow | base最新化、dirty分類/reconcile | Automate | Git状態照合を再利用。WIP所有判断は自動破棄へ変換しない |
| S02 commit-pr-flow | Phase C限定、scope/検証/commit/PR/lane | Simplify | 許可済みpublishに限定し、Phaseラベル依存を除く。stage/read-back保証は残す |
| S03 fsm-protocol-guard | 高リスクtrigger/INV01〜09参照 | Automate | Q保証と検証selectorへ。docsの単語存在checkだけでは代替不可 |
| S04 issue-authoring-flow | 観測/確定仕様からIssue本文、readinessへ | Simplify | goal記述/AC/権限を一度作る。起票依頼から実装しない |
| S05 issue-close-evidence-flow | code/non-code、follow-up、close証拠 | Automate | comment存在とclose順序を検査。推測follow-upの番号を捏造しない |
| S06 issue-implementation-flow | Issue取得→A/B→kickoff→検証→publish | Replace | 親のGoal→差分→証拠へ。現flowの全呼出を新方式の前提にしない |
| S07 issue-readiness-check | blocking/non-blocking判定、8節出力 | Simplify | blockingだけ停止する機能を保持。次役/Phase出力を必須にしない |
| S08 issue-start-prompt-flow | 開始文のみ、cross-turn concrete tasks必須 | Simplify | 正本/権限/未完証拠のhandoffへ。実在Goal記録でも引継可能にする |
| S09 phase-c-kickoff-flow | A/B後の再判定・9節actual record | Retire | 固定セレモニーを廃止候補。G04/G08/G19で失う保証を補う |
| S10 phase-c-review-response-flow | finding再現、同根調査、互換roundtrip、返信/resolve | Simplify | 具体的レビュー処理は有用。再Kickoffではなく証拠差分を更新 |
| S11 phase-d-followup-issue-flow | D結果から優先度・Issue-ready | Simplify | 実行可能な後続のみ起票候補。旧profile/role指示の必須化を除く |
| S12 phase-d-release-flow | script実release、文章のみの別入口 | Keep | 権限の異なる2入口を保持。Phase D COMPLETEという形式より公開前保証へ |
| S13 plan-mode-gate | trigger/modeの参考判定、matrix/task template | Replace | リスクと必要証拠選択の一部へ。判断は親、出力再判定を減らす |
| S14 post-approval-merge-flow | lane/check/thread/authority→merge/close/cleanup | Automate | 状態read-back/不変head/checkは機械化可能。人の許可は自動生成しない |
| S15 quality-check-matrix | QUALITYの検証群を再掲・推奨 | Replace | 一つの検証定義と機械selectorへ。正本文と派生matrixのdriftを防ぐ |

## 設定・CI・template・履歴資産

| ID / 対象 | 分類 | 根拠・責務・リスク |
| --- | --- | --- |
| T01 `.codex/config.toml` | Keep | `model/default_subagent_model=gpt-6.1-sol`、子同時枠6。モデル同一は比較の制御変数、枠数は将来要件でない。MCP認証をuser-localへ置く方針を保持 |
| T02 `check-agent-definitions.mjs` | Replace | 固定8役、見出し、承認モデル、旧名、絶対pathを検査。v2の起動実証や意味検証にはならない |
| T03 `check-design-contracts.mjs` | Simplify | 文字列・見出しの存在を検査。製品契約testの補助として有用だが意味の証明ではない |
| T04 `ci.yml` / `validate-reusable.yml` | Automate | quick/full共通にcheck:agents/lint/root型/stats/worker、fullにclient build/cargo check/Worker dry-run。変更意味との対応表がない |
| T05 `docs/*template.md` / Skill references / `openai.yaml` | Simplify | kickoff/spawn/close/follow-upのshapeやSkill発見性。唯一正本から導出し、同文修正の多重箇所を減らす |
| T06 `tasks/*.md` | Keep | 過去時点の許可・背景・AC・判断の証拠。旧role名や旧ceilingは現在規約ではない。履歴を新規約へ全書換えしない |
| T07 `docs/design/01〜10` | Keep | 01/02/03/06/07/10が主な製品契約、04/08が責務と構造、05がUI、09が歴史的実装計画。読む範囲は変更意味で選ぶ |
| T08 release/deploy workflows、release scripts/checklist | Keep | 公開と互換の実行接点。調査で起動しない。文書作成依頼から公開を推論しない |
| T09 `docs/testing/local-e2e.md`、local scripts/testdata | Automate | 実client/source/native証明の資産。CIに未接続。ユーザーデータや本番を使う自動試験へ変えない |
| T10 `.github/CODEOWNERS` / PR template | Keep | repository reviewと提出の接点。CODEOWNERSからbranch protectionや承認済みを推定しない |

## 重複・過剰・矛盾マップ

「観測」は静的文面/設定/保存記録で確認した事実。「仮説」は実行コストへの影響であり#198で検証する。

| ID / 種別 | 接点・観測事実 | 影響仮説と処置 | 維持する保証 |
| --- | --- | --- | --- |
| D01 重複 | Entry→orchestrator→coordinator→plan template→kickoffでprofile/ceiling/spawnを再出力 | 同一判断・転記が増える可能性。変更があった項目だけ再判定 | 許可・成功条件・停止境界 |
| D02 衝突 | WORKFLOW §4.1「pending残存はNOT_READY」、S07はblockingなしならREADY | 非blocking設計選択が調査完了を止め得る。依存先/期限/影響を付けて引継 | 危険な未決の停止 |
| D03 空白 | shared localは契約writeを想定、front/server Scopeは各appsのみ、他6役に製品shared writerなし | contract-sensitive→必須委譲してもshared担当が決まらない。親または一人に明示割当 | 単独owner、consumer coverage |
| D04 方針とgateの緊張 | 「必要時のみ委譲」に対しStandard non-spawnは単一task等全条件、高リスクは実装+2監査 | riskと人数の結合。独立性/並列利益で判定。現行が常時8起動だとは主張しない | 高リスク独立レビュー |
| D05 文面/責務差 | G02はSkillへの判断移譲禁止、S07のdescription/Responsibilitiesはreadiness/次役を判定 | Agent/Skillのどちらが最終判断者か揺れる。親が証拠を統合して決定 | 責任主体の明確化 |
| D06 再読込候補 | root/local→Skill Inputs→reference matrix→Agent Inputが同じ正本を列挙 | 重複参照を誘発し得る。実際の読取回数は未計測。hash/変更時点つき参照索引へ | 正本の鮮度・必要箇所参照 |
| D07 artifact増殖候補 | plan、kickoff、spawn、validation、D Issue-ready、PR/closeで境界を転記 | 長い調整資料が差分に追従しなくなる可能性。一つのGoal記録と証拠リンクへ | cross-turn再開性、AC追跡 |
| D08 CI面差（観測） | PR quickにclient標準test、check:design-contracts、web tests/buildなし。fullもこれらを追加しない | CI greenを品質完了と誤認し得る。必要検証一覧と未実行を機械表示 | QUALITY以上の面。#184 follow-upも同gapを記録 |
| D09 test面差（観測） | client `exclude=src/**/*.test.ts`、root型には含む。client testは手動列挙し`room-page-compose.test.ts`は未登録 | 単一workspace passで取りこぼし。ファイル集合監査と明示実行 | typed fixtureと実test実行 |
| D10 validatorの固定化 | check:agentsはexact8役、design checkは文字列存在中心 | 旧構成維持を品質と誤認。v2用checkerは別に作り旧checkerは旧laneで維持 | 実ロード・意味・契約test |
| D11 古いceiling | #196/#195起票本文は「起票のみ」、現在依頼は調査PR明示許可。#192も起票ceilingが本文に残存 | 現在の明示解除を読まず停止する/広い動詞で解除と誤認する両リスク。許可の履歴を保持 | 狭い境界と明示解除 |
| D12 部分/全体完了 | #192 taskは後続統合を局所checkpointと分離。停止資料にT3実証BLOCKED、T5/T6/T7未完 | 後続必須を前taskへ戻すと循環、部分PASSを全ACへ拡大すると偽完了 | 局所証拠と統合受入を別状態で保持 |

追加の衝突例: `tasks/followup-issue-184-client-test-ci-parity.md`はworkflow変更をLocal-Fast/Plan NOとするが、現WORKFLOW §2はCI/CD変更をPlan必須とする。これは履歴taskの推奨と現規約の差で、今回CIを変更する根拠にはしない。v2は分類のコピーより検証と権限を正本化する。
