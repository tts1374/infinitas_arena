# 調査根拠・計測限界・検証記録

調査日: 2026-10-26 JST。観測事実、文面からの設計上の指摘、実行コストの仮説を分離する。PR作成以外のGitHub write-backやCloudflare操作は調査に含めない。

## 基点・調査範囲

- repository基点: [`4b600d3445edc71d0599058809c9a89b04591760`](https://github.com/tts1374/infinitas_arena/tree/4b600d3445edc71d0599058809c9a89b04591760)（fetchした`origin/v1`）。#194をmerge済みで、旧構成の15 repository Skillが実在する。
- 作業branch: `codex/issue-196-harness-inventory`。専用worktree: `C:/Users/tts13/.codex/worktrees/issue-196-harness-inventory/infinitas_arena`。この場所へ既存dirtyをcopyせず、cleanな上記基点から作成。
- 開始cwdは別branch `codex/ddrgp-workflow-adoption` / `b8547805d8b9c3181baf0d6881263737c0c54075`。未追跡`.playwright-mcp/`を保持。基点との差でroot規約/`.codex`の意味差分はなかった。
- 調査モデル指定とrepository defaultは`gpt-6.1-sol`。repository設定は親/子同モデル、role effortはhigh 5/medium 3。実際の全過去sessionのモデル/effort/usageはrepository設定から推定しない。
- 全8 `.toml`、全15 `SKILL.md`、root/local Governance、plan/kickoff/quality/FSM/commit等の参照表、package/tsconfig、CIと検査scriptsを照合した。
- 製品規範はdesign 01/02/03/06/07/10を中心に、実装/test接点と照合。04/05/08/09は責務/画面/構造/実装計画という位置付けと必要箇所を確認。全製品実装の網羅監査や全UI画像の準拠確認は目的ではない。
- #192資料とチャット履歴はread-only。実装再開、担当へのmessage/起動/停止、製品・task編集、source/runtime起動、本人入力の操作は行わない。

## 出典索引

repository内リンクは上記基点で読む。後日v1が更新された場合は基点commitのtreeから同pathを参照する。分類表の出典節と本索引を組み合わせて判定を追跡できる。

| ID | 一次資料 | 確認した内容 / 対応 |
| --- | --- | --- |
| E01 | [AGENTS](../../AGENTS.md)、[WORKFLOW](../../WORKFLOW.md)、[QUALITY](../../QUALITY.md) | G01〜G33、Phase/Plan/Spawn/許可/検証/完了 |
| E02 | [client local](../../apps/client/AGENTS.md)、[worker local](../../apps/worker/AGENTS.md)、[shared local](../../packages/shared/AGENTS.md) | G34〜G36、authority/typed fixture/freshness/consumer |
| E03 | [config](../../.codex/config.toml)、[agents](../../.codex/agents)、[skills](../../.codex/skills) | A01〜A08、S01〜S15、T01。一覧は実ディレクトリから取得 |
| E04 | [design 01](../design/01_fsm.md)、[02](../design/02_ws_protocol.md)、[03](../design/03_data_model.md)、[06](../design/06_source_io_spec.md)、[07](../design/07_constants.md)、[10](../design/10_regression_guard_addendum.md) | Q01〜Q10、Source/CloseReason/RESULT/保存互換/観戦 |
| E05 | [CI](../../.github/workflows/ci.yml)、[reusable](../../.github/workflows/validate-reusable.yml)、[root package](../../package.json)、[client package](../../apps/client/package.json)、[worker package](../../apps/worker/package.json) | PR quickとfull、testの実際の列挙。D08/D09、V03/V04 |
| E06 | [root型](../../tsconfig.json)、[client型](../../apps/client/tsconfig.json)、[agent check](../../scripts/check-agent-definitions.mjs)、[design check](../../scripts/check-design-contracts.mjs) | test型面、exact8役/モデル/見出し/文字列checkの限界 |
| E07 | [lobby DO tests](../../apps/worker/src/durable/lobby-directory-object.test.mjs)、[lobby route tests](../../apps/worker/src/routes/lobby.test.mjs)、[room object tests](../../apps/worker/src/durable/room-object.test.mjs)、[room state tests](../../apps/worker/src/durable/room-state.test.mjs)、[contract guards](../../apps/worker/src/durable/contract-guards.test.mjs) | 同ms/recreate/legacy map/成長、read path、reconnect/stale close、generation、rated、RESULT形状 |
| E08 | [snapshot型](../../packages/shared/src/models/room-state-snapshot.ts)、[room object](../../apps/worker/src/durable/room-object.ts)、[room state](../../apps/worker/src/durable/room-state.ts)、[result archive](../../apps/client/src/services/result-archive.ts)、[stats test](../../apps/client/src/features/stats/stats.test.ts) | consumer、attachment/persist、snapshot/履歴の実接点。型の存在を互換実証としない |
| E09 | [local E2E](../testing/local-e2e.md)、[launcher](../../scripts/start-local-two-clients.ps1)、[runner](../../scripts/run-local-e2e.ps1)、[picking display test](../../apps/client/src/features/room/picking-countdown-display.test.tsx) | 実client/sourceと表示testの異なる検証面。C1〜C3の候補資産 |
| E10 | [#135 task](../../tasks/issue-135-agent-delegation-enforcement.md)、[output/evidence task](../../tasks/codex-governance-output-and-audit-evidence.md)、[same-turn task](../../tasks/codex-phase-c-implementation-ready-default.md) | actual spawn、UI/disposition/日本語、不要な再承認を防ぐ規則の記録された目的。過去MD/TOML正本の扱いは歴史であり現正本と混同しない |
| E11 | [#168](https://github.com/tts1374/infinitas_arena/issues/168)、[lane task](../../tasks/issue-168-author-identity-lane-readback.md)、[fallback task](../../tasks/issue-168-task-owned-pr-strict-fallback.md) | #167 author/approval deadlockの記録、実author lane/明示許可の導入背景 |
| E12 | [#155](https://github.com/tts1374/infinitas_arena/issues/155)、[task](../../tasks/issue-155-stale-lobby-read-cleanup.md) | 誤登録ロビーのread cleanup、eligible false/404はstale、5xxはfail-open、公開schema不変。C2はこれとrace要件を組み合わせる |
| E13 | [#184 follow-up task](../../tasks/followup-issue-184-client-test-ci-parity.md) | client標準testがCI外という記録。現在のCIでも確認。新Issueを作ったとは扱わない |
| E14 | [#190由来task](../../tasks/codex-gpt61-sol-governance.md)、git履歴`e557ff2`/`4b600d3` | モデル移行で8役/effortを維持した範囲、派生資料同期。#196はその維持前提を引き継がない |
| E15 | [#195](https://github.com/tts1374/infinitas_arena/issues/195)、[#196](https://github.com/tts1374/infinitas_arena/issues/196)、[#197](https://github.com/tts1374/infinitas_arena/issues/197)、[#198](https://github.com/tts1374/infinitas_arena/issues/198)、[#192](https://github.com/tts1374/infinitas_arena/issues/192) | APIで本文/状態を取得。現在依頼と起票時ceilingを区別。#197の製品/CI非scope、#198の測定要件 |

### Codex機能の外部照合

2026-10-26に実ページを取得した[公式設定reference](https://learn.chatgpt.com/docs/config-file/config-reference)では`agents.default_subagent_model`、`agents.max_concurrent_threads_per_session`（親を除く子の同時枠）、roleの`config_file`が記載される。[GPT-6.1 Sol公式モデル資料](https://developers.openai.com/api/docs/models/gpt-6.1-sol)でモデル名を確認した。これらはこのdesktop環境で全設定が有効ロードされた実証ではなく、#197でruntime read-back/smokeが必要。

[公式Multi-agent資料](https://developers.openai.com/api/docs/guides/agents-api/multi-agent)は独立した調査・レビューへの委譲と、短い/依存する作業を親で扱う考え方を示す。APIの設定キーをこのrepoのCodex設定へ転記する根拠にはしない。Parent-firstの採用と品質判断は本Issueの要求およびQ/Rに基づく設計要求であり、公式一般論から本repoでの削減効果を推定しない。

## #192の参考事例

#192はv1のmerge済製品とは異なる未完作業。起票本文だけでは現在地を示せないため、以下のローカル資料とチャットの一部を確認した。ローカル資料は今回PRへcopyしない。第三者がGitHubだけで未公開WIPを再検証できるとは主張せず、所在/hashと読取時点の要約を残す。

- 参照worktree: `C:/Users/tts13/.codex/worktrees/issue-188-phase-c-host-led/infinitas_arena`
- branch/HEAD: `codex/issue-192-dev-control` / `0dac1b02d3b23d9449d1e63d7ca3f822f98f9e50`
- チャット「#192 開発用コントロール窓を実装」ID `01a16898-60a2-78d2-832e-0a96f8c3afc4`。`read_thread`で履歴取得し、後述のturnを確認。全履歴/全子sessionの集計はしていない。

| 資料（上記worktree相対） | SHA256（読取時） |
| --- | --- |
| `tasks/issue-192-pause-handoff-2026-10-26.md` | `0176798EACB94C43133F0DF5ACEA0ADB9F8B74A518D5F4FCB9ECAE8241A06C65` |
| `tasks/issue-192-pause-snapshot-2026-10-26.json` | `BDCB68476DB04372868B34EF32DEBDF552A3EA2C663E81348F22612C4B5AC87D` |
| `tasks/issue-192-phase-c-execution.md` | `89AFE8C3FF5FEBC216BB122145A92AF186C82BB60A7767BDB94B2E3911F231BA` |
| `tasks/issue-192-dev-control-tasks.md` | `CF8BC69E20796459E9BDAC5F7102FD869778DD04137D7310284C2C878CCC7272` |

| 観測・保存記録 | 判断と限界 | #197への入力 |
| --- | --- | --- |
| 停止引継はT0/T1/T2/T4等の局所checkpointと、T3実9経路BLOCKED、T5基盤/最終責務、T6/T7未完を区別 | 長期化だけを手続き起因とできない。native/source/本人入力に実証が必要 | R10: 部分と統合を別状態にし、独立作業を継続 |
| 実行記録に複数回のowner再割当、High-Risk/Entry/Spawn再掲、正本4件と実行台帳がある | 引継ぎ/再構築の負担候補。ただし各回の読取tokenとtimeは未計測、不要だったとは断定不可 | R01/R09/R10: 最新境界と証拠を集約、変更時のみ再判定 |
| T3の実source要求と後続T6の統合確認を区別する補正が明記 | 局所完了へ後続条件を戻す循環依存に注意。実証条件を削除してよいという意味ではない | R06: blockは依存部分に局所化、全体未完は維持 |
| I192-T4-01（空欄後入力フォーム消失）、C192-T4-01（delay設定だけで予約）、C192-T4-02（必須delayMs欠落）の独立検出と解消証拠を記録 | 独立監査には効用の観測がある。親単独なら同じ問題を検出不能だったという反実仮想は未検証 | R04/V06/V09: 独立した問いと再現testは残し、定型再判定は別に評価 |
| T5でspool保存失敗が停止を止める、reopen二重spawn等を局所試験で検出/修正した記録 | fault injectionを自動化できる。実Windows/native/source全体は未実証 | V08/Q16: 保存失敗/partial/retry/process identityの試験と実機面を区別 |
| 親turnのfailed errorにusage limitが保存されている | 中断理由の一つは観測できるが、どの手続き/Agentが枠消費を生んだか不明 | V12: 親子usage/中断/再開の関連付けが必要 |

### 実測値と未計測

| 対象 | 取得できた事実 | 未計測・使わない推定 |
| --- | --- | --- |
| #192トークン | 参照した要約APIにはusage内訳なし | **総量/親子別/再読込分/削減可能量は未計測**。利用上限到達からtoken量を逆算しない |
| #192実行時間 | turn `01a17319-5ddc-75f0-b720-504a9e55122b`: durationMs=796494、turn `01a1721f-d490-7603-8ced-a71a5168375d`: durationMs=1106652。いずれもfailed/usage limit | **Issue全体の所要時間・active/tool/待機内訳は未計測**。この2turnを総時間や浪費時間にしない。durationには待機等も含み得る |
| #192 Subagent起動 | 部分履歴にfoundation/UI/contract/quality等のstarted/interacted/completedあり | **全期間総起動数・子再起動・最大同時数は未計測**。台帳行数/部分イベントから総量を断定しない |
| #196今回 | 親のみで調査・執筆、actual Subagent spawn=0（本チャットのtool記録） | 全token/active時間は未計測。旧方式/v2の比較runではないため効率ベースラインにしない |
| 削減率/因果 | 比較実験未実施 | token/時間/起動数の削減率、ABCDや監査が停滞の主因という因果は未計測 |

## 今回の検証

製品・定義は変更しないが、CI quickの面を実行して資料に挙げた現行チェックの実行可能性を確認した。加えて設計契約check、client build、client標準test、標準外compose testを確認した。これらを#198の新旧比較や#192の最新WIP実証と呼ばない。

| 確認 | 結果 | 範囲/限界 |
| --- | --- | --- |
| `npm ci --no-audit --no-fund` | PASS、324 packages | 専用worktreeの依存だけ。lockfile更新なし |
| `npm run check:agents` | PASS、8 agents | 現行構造の静的整合。v2の合格条件にしない |
| `npm run check:design-contracts` | PASS | 既存文字列guard。全契約実証ではない |
| `npm run lint` / `npm run typecheck` | PASS / PASS | rootのCI quick面。テスト型をworkspaceより広く確認 |
| `npm run test:client-stats` | PASS、17 checks | 現行統計回帰 |
| `npm run test:worker` | PASS、98 tests、fail/skip 0 | 基点v1のWorker。#192作業branchの187 tests等とは別 |
| `npm run build:client` | PASS | build時にBrowserslistデータ古さの警告あり。依存/lockfile更新は本scope外 |
| `npm --workspace @infinitas/client run test` | PASS、66 tests、fail/skip 0 | CI外の標準test面を確認 |
| `npx --no-install tsx --test apps/client/src/features/room/room-page-compose.test.ts` | PASS、2 tests | 手動列挙外testの存在と明示実行の必要性を確認 |
| 文書内容のread-only self-review | 実施 | G/A/S/Tの実在、D出典、Q/R/比較条件、全6 AC、欠測表示を照合。独立監査ではない |
| 文書link・UTF-8 no BOM/LF | PASS、5文書・local link 69件 | dangling link、BOM/CR/置換文字/trailing whitespaceなし。8 Agent/15 Skill、G36/A8/S15/T10/D12/Q16/R12/O6/V12のID集合を照合 |
| diff scope・WIP保全 | PASS | 5文書のみ。保護対象102 filesのSHA256、3領域のHEAD/branch/status、stash一覧が一致 |

Rust build/Worker dry-run/実client source/native E2Eは今回未実施。製品/native/Worker設定/通信/テストの変更がなく、docs-onlyの今回差分を対象とするCI quickを満たすため。実機や全DO復元を証明したとの主張はせず、必要な保証は#197の設計と#198の対応ケースへ残す。web build/testもweb差分がないため対象外。

## 保護対象と最終照合

文書執筆前に、元cwd、#192作業領域、#188計画領域のHEAD/branch/status/dirty・untracked各fileのSHA256とstash一覧を専用worktreeのignored作業記録へ保存した。取得は`git --no-optional-locks`とfile readのみ。

| 対象 | 前状態 | 照合対象 |
| --- | --- | --- |
| 元cwd `C:/work/infinitas_arena/infinitas_arena` | `codex/ddrgp-workflow-adoption` / `b8547805d8b9c3181baf0d6881263737c0c54075` | 未追跡21 files、HEAD/branch/status |
| #192作業worktree（上記） | `codex/issue-192-dev-control` / `0dac1b02d3b23d9449d1e63d7ca3f822f98f9e50` | dirty/untracked 81 files（停止引継/JSONを含む）、HEAD/branch/status |
| #188計画 `C:/Users/tts13/.codex/worktrees/issue-188-design-plan/infinitas_arena` | `codex/issue-188-design-plan` / `0c0e47e21c2cf549ada87d02dab87659523ed5c2`、clean | HEAD/branch/status |

コピー元のin-scope residueは発生していない。元cwdの未追跡素材をこのtaskの残骸とみなして削除しない。stash適用/追加/削除、既存branch checkout/commit、cleanupは行わない。今回の専用worktreeはPRレビュー用に保持する。

### 文書レビューのdisposition

| finding | disposition | evidence | remaining risk |
| --- | --- | --- | --- |
| SR01 / Must fix: C2の「probe失敗」がstale応答と5xxを区別せず、誤った削除試験になり得る | fixed | C2をeligible=false/404の遅延応答と、5xx/通信失敗のfail-open試験へ分離。#155本文と照合 | fixture実装と実行は#197/#198、今回未実施 |
| SR02 / Note: #192の全usage/時間/起動数を取得できない | 明示的制限として記録 | 計測表に全体を未計測、一部turnのdurationのみ原値で記録 | コスト原因・削減効果は不明。#198で同条件測定 |
| SR03 / Note: 新方式の機能/有効設定をまだ実証していない | #197へ引継 | R11/O04、Q/R対応表と実ロードsmokeを#197提出条件に指定 | 設計要求を実装済みと扱わない。正式切替は#198/#199後 |

今回の文書差分に未処理Blocker/Must fixなし。公開時は同じ5文書を一つのlogical commitにし、`v1`向けPRでbase/head/changed files/authorをread-backする。URL・commit・author laneはPRとチャットの最終報告から追跡する。merge/close/公開後監視は行わない。

振り返り: governance follow-up needed。D02/D03/D08等の観測をR05/R06/R07へ対応付け、既存#197へ引継ぐ。今回禁止された現行規約の修正や、同じ目的の追加Issue作成は行わない。
