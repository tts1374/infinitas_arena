# #203 是正結果 — BLOCKED / さらなる改善

2026-10-28。是正と静的検証・独立監査を実施したが、実local DO probeの初回runtime起動が失敗したため、追加実験を停止した。Codex限定実セッションは **0回**。#203全体の完了、v2.1稼働可能性、効率改善、正式採用を認定しない。成果物は停止中プロトタイプのdraft PRとして提出する。

正本: [#203](https://github.com/tts1374/infinitas_arena/issues/203)、親[#195](https://github.com/tts1374/infinitas_arena/issues/195)、[Q01〜Q16](../harness-v2/requirements.md)。旧C2双方FAIL・旧秘密出力・C3未実施・欠測は[旧比較結果](../harness-v2/comparison-results.md)のまま保持した。

## AC対応

| #203 AC | 実装 / 証拠 | 判定と残るもの |
| --- | --- | --- |
| 独立revision/manifest、旧資産保持 | [最終manifest](evidence/manifest-final.json)、新tools/harness-v21のみ。[保護照合](evidence/protection.json) | PASS。旧governance/製品/固定v2/比較tool/全旧docsはGit objectとdiffで不変 |
| C2破損stateの実行再現・保存不変・独立監査 | fixture 81試験、専用型検査、[独立監査](evidence/audits.json) | PARTIAL。合成enum/boolean/array/数値/形状の拒否・put0・保存不変と旧scalar/map/raceはPASS。実local DO復元は未実証、評価Blockerを保持 |
| 実行前秘密予防と負試験 | safety.capture/audit_record、stdout/stderr/例外/child/監査資料のtyped射影負試験 | PARTIAL。固定runnerは原文を保存・表示前に破棄。任意shellのOS強制仲介ではない。Wrangler private log sink未認定でbundleをBLOCKED、実session経路も停止 |
| 低リスク過剰E2E除外と高リスク取りこぼし防止 | policy正負試験、複合pathのタグ和集合、Client settings/storage/source/bridge、unknown/cross-layer | 静的PASS。親の意味判断は必要。実運用のコスト削減は未測定 |
| Q01〜Q16/権限/WIP/停止/復帰 | [coverage](README.md)、frozen operation/completion/P1〜P8、snapshot一致、hard hold | PARTIAL。権限・WIPの静的/stub検証PASS、実外部操作の安全保証へ拡張しない。実runtime/profile/native/sourceは未実証 |
| 限定評価の全試行・欠測 | [execution](evidence/execution.json)、事前task上限2回/no retry/各20分 | BLOCKED。runtime starts1/checks0、Codex sessions0。2件ともnot_started、wall/tokens/reworkはnull |
| 採用判断と#199未充足条件 | 本書「判断と再開条件」 | 報告PASS。推奨「さらなる改善」、採用判定は保留 |
| 必要独立reviewと導入可能性評価 | 契約・挙動の別実agent、最終source filemap照合 | PARTIAL。停止中draft提出はpass-with-followups。稼働/採用/Issue完了はBLOCKED |

## 検証と失敗

[最終receipt](evidence/validation-final-2.json)はsource前後一致、31ファイルのfilemapと一致する。12 checkがexit0。v2.1 **26**、旧v2 **36**、比較tool **19**、合成fixture **81**、既存Worker **98**試験。check:agents、check:design-contracts、lint、typecheck、stats、Client build、専用fixture型検査を含む。Python/合成TSは標準npm検証面外なので明示実行した。製品/Rust/source/nativeを変更していないため製品E2E/Rustは実行していない。[JS構文検査](evidence/syntax.json)もPASS。

30ファイルの[前receipt](evidence/validation-final.json)の後、生成Python cacheをstage候補から除外し、新tools用`.gitignore`だけを追加した。既存30 sourceは不変。31ファイルで再検証し、独立監査の追補を受けた。生成cache自体は提出しない。

初回[静的receipt](evidence/validation-initial-superseded.json)はその時点の中間版検証であり、最終版の証明へ流用しない。検証中source変更を防止するbefore/after gateと負試験を追加し、最終版で再実行した。

合成fixtureの最初の2 test fileはES module指定不足でロードFAIL、設定修正後81 PASS。local probeのsink preflightは2回FAIL（runtime starts0）。Volta shim/空profileとNODE_OPTIONS表記を修正後、実runtime初回は **RUNTIME_START_FAILED / starts1 / checks0 / 約2.332秒 / 所有process停止済み**。raw stdout/stderrは破棄し、専用directory内log file数0。原因、初回exit code、実行時source hashは欠測。後から追加したexit/hold/loopback guardの版をその失敗時点の実行証明にしない。

失敗後はlocal probe CLI/main、screen.launch、未認定Wrangler bundleを固定BLOCKEDとした。偽PASS receiptや新directoryでもこれらの入口から追加runtime/modelを起動できない負試験を追加した。実DO保存復元、process restart後の保存不変、hibernationは未実証である。

## 監査findingと処理

| finding | disposition / evidence | remaining risk |
| --- | --- | --- |
| C203-01 / B203-01,02: 自己申告とtest exitだけで実reviewなしのscreen合格が可能 | モデル起動pathを除去、全入力hard hold。Popen未呼出負試験 | 将来のAC/Q/manual/command遵守/実review identity・fingerprint gateは未実装 |
| C203-02: Worker複合pathの危険タグ欠落 | elif排他から和集合へ修正、source-storage/timer-storage負試験 | pathから意味完全性は証明不能 |
| C203-03: Client保存/Source境界見落とし | settings/storage/archive/history/bridge等のfloor＋負試験 | 親の意味レビュー継続 |
| C203-04 / B203-03: 検証中変更を新hashのPASSへ誤帰属 | before==after必須化、負試験、最終receipt一致 | 環境/dependency実体はhash対象外で別固定が必要 |
| B203-04: screen Goalのedit grantなし | source/evidence path・owner・現依頼grantを整合 | 実ロードは未実証 |
| B203-05: 新UUIDでlocal probe再起動可能 | CLI/main hard hold、未起動負試験 | 参照実装を直接呼ぶ迂回は許可しない。OS強制機構ではない |
| R203-01 Blocker: local runtime起動失敗 | 失敗/欠測を保持し全実験停止 | 実DO復元・安全な失敗診断未実証。評価・採用Blockerは未解決 |
| R203-02 Must fix（再開前）: Wrangler private log sink未認定 | Worker bundle停止。出力のregex伏せ字で合格化しない | 実runtime/bundle検証未完了 |

独立reviewerは `/root/contract_review` と `/root/behavior_review`。実装者 `/root/c2_fixture`、計画助言 `/root/planning` と別identity。全て実際のcollaboration toolが返したcanonical task handleで、opaque UUIDは取得していない。最終契約監査はsource aggregate、挙動監査はreceipt SHA256と30 filemapの全件一致を確認した。停止中draft提出を妨げる新たな重大コード所見はないが、評価Blockerを解決済みとは扱わない。

## 効率と運用の評価

確認できた改善は、低リスクWorker/Clientへ不要なsource E2Eを要求しないselectorの静的動作と、同fingerprintの証拠再利用・必要時参照をruntime規約へ整理したこと。独立監査は高リスク面へ集中し、実装は親と合成DO writer一人で所有した。

実session0回のため親子tokens/wall/手戻りはnull、実session子起動0。外側の開発作業では4 agentを起動したが、その親子総費用/通し時間は未測定。Agent数・文書量・静的検証秒数からtoken削減や開発効率改善を推定しない。旧#198とは非同条件であり、改善率/因果/統計的優越を主張しない。

runtime指示のfresh executor評価（empirical-prompt-tuning）は、品質gate失敗後の停止を優先して未実施。行ったのは独立した構造/コード監査と合成負試験。参考として[OpenAI公式の実traceに基づく評価方針](https://developers.openai.com/blog/eval-skills)を確認したが、公式説明や静的試験を実sessionの代替証拠にしない。

## 判断と再開条件

推奨は **さらなる改善**。是正済みの静的面は有用だが、採用に向けた実セッション評価へ進む必須条件が揃っていない。v2不採用を確定する実測もない。

1. raw logを出さず、起動phase/固定error code/所有process・exitを診断できる構造化runnerを別revisionで作り、log sink/空profile/固定toolchainを負試験する。
2. 独立監査後に、実local DOの旧scalar/map復元・破損全endpoint拒否・保存hash不変を、上限を固定した一回のfixtureで確認する。今回の失敗や旧#198 retryを消さない。
3. 実profile/モデルeffort/Skill/MCP無効のread-back、環境hash、command遵守、AC/Q/manual、実review identity/fingerprintを完了gateへ接続し、偽/欠落/古い証拠の負試験を満たす。
4. その後でのみClient/Worker各1回という最小screening条件を新revisionへ固定し、未実証C3/cross-layer/native/source/hibernationの必要範囲を別判断する。今回のhard holdを既存code内のswitchで解除しない。

#199には未解決重大所見ゼロ、必要な品質証拠、正式採用判断、ユーザーの別途正式移行依頼が必要。今回のPRやIssue完了はその許可ではない。

製品readerに同型fallback/skip経路があることは静的確認・合成入力呼出しによる観測。本番破損・被害とは区別し、製品修正が必要なら既存writer互換と失敗時データ保全を確認する別Issueとする。

## 保護・復帰・振り返り

元cwdと#188/#192のHEAD/branch/status/index/WIP byte/stash snapshotは前後一致（[protection](evidence/protection.json)）。元にscope内residueを作っていない。旧worktree/stash/branchの整理はしていない。復帰は現行checkoutの新規sessionへ戻るだけ。新tools/docs/taskのみrevert可能。

今回、重複する説明よりも否定系と独立レビューがselectorの漏れを具体的に検出した。一方、生出力を完全破棄する方式では起動診断が欠測になり、実評価へ進めなかった。改善候補は上記の安全な構造化診断。現行governanceをこの結果だけで変更・撤去する根拠はなく、旧構成は維持する。
