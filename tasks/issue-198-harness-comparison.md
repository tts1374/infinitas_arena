# Issue #198 比較実行契約

目的: 固定した旧方式とv2でC1〜C3を実行し、品質・安全性を先に評価する。正本はIssue #198、requirements/comparison-plan/prototype/coverage/evidenceと今回のユーザー依頼。

現在のEntry Protocol: Stage=Phase C継続（中間結果保存・報告PR）。affected layers=比較tools/docs/task、製品の合成変更は実験repoのみ。contract-sensitive=本番差分なし、C2/C3実験は該当。execution profile=実験High-Risk／報告差分Standard。Plan Mode=今回の再開turnはDefault、確定済み比較計画の継続であり新方式の設計変更を行わない。重大所見によりC3/反復は保留し、その再設計・新revision実装は開始しない。

current request ceiling: comparison-execution-and-result-PR。古い「起票のみ」は今回明示解除済み。success criteriaは比較計画のhard gateと測定辞書。第1段階のmanifest固定→初回6 run→中間結果保存→重大問題がなければ各3有効run。各run wall120分、環境retryはcase/laneにつき1回まで。stop conditionは安全違反、重大品質問題、利用制限、120分。証跡を保存し未実証を隠さない。

allowed side effects: 新規独立repo/fixture/seed/証跡作成、隔離した合成製品編集と検証、専用branchの結果commit/push/PR。forbidden outputs: 固定v2編集、現行ハーネス置換、#192/#188/WIP/stash操作、合成機能の製品統合、比較runからのGitHub write、merge/close/deploy/release/#199。next unlock condition: none（実行は既に許可済み）。

対象: tools/harness-comparison/**、docs/harness-v2/comparison-*、本task。旧定義/製品/依存/CIは変更しない。比較用依存は各trialへ同じlockfileのnpm ci。結果PRと比較sessionを分離する。

基準: product/legacy `4b600d3445edc71d0599058809c9a89b04591760`、v2 `59b0815dc95738c3e7a14d5505fb58d3df49c460`、runtime SHA256 `648761b91359a54556c1fe1e655aaa5408cf5910a752861340b3eabb77157ef2`。親子model Sol、親high。旧implementer medium/v2親highの責務差を報告し、因果未分離なら採用を保留。

ownership/delegation: 親は比較Python/manifest/reportの唯一writer。front-implementer /root/visual_fixture はbrowser_fixture.mjs/visual-fixture.tsx/cssだけのwriter。execution-coordinator /root/comparison_readiness は読取監査のみ。いずれもbounded packetでspawn済み。実験内Agentと実験外準備Agentは区別。High-Riskは各実装非担当の契約/挙動review必須。shared writerは明示一人。

validation: fixture/seed exact assertions、入力byte/hash/製品tree一致、実config/skills/agent readback、Python明示test、check:agents/design/lint/root types/stats/workerとCI面を照合。各caseは比較計画のUI/DO restart/reader matrix/native-source E2Eまで保持。失敗/skip/部分usageは未実証/null、子usageが欠ければ総量null。独立比較reviewでは自己申告と採点を分離。

rollback: 実験repoを離れれば旧checkoutが維持される。既存WIPはread-only fingerprintで前後比較。試行は上書き/自動削除しない。commitは準備/結果をreviewableに分け、PRは結果資料・比較ツールのみ。必須未実証ならIssue完了や採用を宣言しない。

2026-10-27 checkpoint: C1両方式のblind製品/実行監査はPASS。C2は両方式とも未充足、旧再試行にQ16秘密出力を確認し当該run FAIL。C3と追加反復は保留、Pは固定read-only判断のみ継続。これは必須ACの延期による合格やIssue完了ではない。

delegation execution record（追加監査）: /root/c1_blind_acceptance は spawned: yes、status: C1/C2 COMPLETE（C1 pass、C2 fail）。/root/c2_safety_audit は spawned: yes、ownership: sanitized安全証跡/基準/exporter/Pのread-only監査、status: COMPLETE、当該run fail・C3保留・P両方式38/38、最新exporter18 tests pass。比較runtimeの子とは区別し共有準備/評価コストは未計測。front helper担当は停止後rootへtakeover済みで重複writerなし。

Commit Split Plan: (1)比較toolsと実行task、(2)生成・収録した入力/証跡/監査データ、(3)実行記録と日本語の採用判定。最終追加のhold gateは親の19番目のtestで検証し、元の実行条件や実結果には遡及適用しない。
