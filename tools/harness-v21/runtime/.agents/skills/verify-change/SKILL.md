---
name: verify-change
description: Harness v2.1隔離trialの検証下限と安全な実行結果をACへ対応付ける。実装許可や外部公開を追加しない。
---

Objective: 最新差分に必要な品質証拠と欠測を対応付ける。成功条件はAC/該当Qの実証、失敗・未実施の透明性。許可副作用はGoal内のローカル検証だけ。

`python -B tools/harness-v21/harness.py select --goal .tmp/goal.json` でcommands/manual/Q/test membershipを得る。意味判断は親が行いselectorへ追加する。
固定実行: `python -B tools/harness-v21/safety.py <ID>`。IDはagents/design/lint/types/client-build/client-test/stats/worker-test/worker-bundle/v2-test/comparison-test/v21-test/fixture-test/fixture-types/client-screen。raw stdout/stderr/log/例外を取得・保存・モデル提示しない。子reviewerも同じ。必要なcheckがなければBLOCKEDとし、任意commandを代用しない。

全試行の固定status/exit/hashとfingerprintを保存。同fingerprint/同範囲の検証は再利用し、変更後に必要な面だけ再確認する。manualの実機/旧新reader/実runtimeとmockを区別。親の意味判断・独立reviewは自動gateで代替しない。

停止: 必須検証失敗・証拠不足・重大finding。rawを読んでの診断や品質緩和で通さず、BLOCKED/ESCALATIONと残リスクを返す。
