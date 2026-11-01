---
name: issue-authoring-flow
description: INFINITAS ARENA の観測済み課題・確定した仕様を、実装可能な Issue 本文へ整える。未確定のアイデア相談、Issue 実装、Phase D の follow-up 抽出は対象外。
---

# Issue Authoring Flow

## Objective / Boundary

実装者が仕様を再解釈せず進められる、範囲・受け入れ条件・検証の対応した Issue 本文を作る。成功条件は、必要な判断と証拠が揃い、既存の Phase A exit gate へ渡せること。

root/local `AGENTS.md`、`WORKFLOW.md`、`QUALITY.md` を適用する。仕様判断は担当 agent が行い、このスキルは本文作成を補助する。既に確認済みの同一資料を再読込しない。

allowed side effects は依頼された本文・task artifact の作成更新まで。GitHub への起票・更新は依頼の許可範囲でだけ行い、結果を URL/id または read-back で確認する。本文作成だけの依頼では、実装・公開へ進めない。

## Establish the Contract

- 観測した不具合、利用者価値、確定済みの判断と、その根拠となる対象コード・docs を確認する。資料一覧だけを理由に全件を読まない。
- 親 Issue は背景・依存・全体境界を確認するために使う。子 Issue へ取り込む要件を明示し、親の全項目を暗黙に追加しない。
- 受け入れ条件が同じなら、内部構造や実装方式の選択は実装担当へ残す。未観測の将来要件や抽象化を追加しない。
- 主要な判断が未確定なら、その依存部分を確定仕様として書かない。担当 agent が `NOT_READY` / `WAITING_FOR_HUMAN_DECISION` を判断できるよう、未確定点と影響を残す。

## Author

[実装 Issue テンプレート](../../../.github/ISSUE_TEMPLATE/implementation-task.md)を使い、不要な節・空欄・重複を取り除く。

- Objective は観測した問題または達成する価値を書く。
- Scope / Non-scope は成果物と現実的な誤実装を防ぐ境界にする。
- Acceptance Criteria は外部挙動や必要な不変条件から判定できる形にする。
- Required Tests は主要正常系・現実的な失敗・今回の回帰へ対応付ける。repo 既定 CI は暗黙の対象であり、独自の追加検証・比較条件・必要な実機確認を具体化する。省略には理由を付ける。
- phase ceiling が指定されている場合は Current Request Boundary を残し、許可出力・禁止出力・次の解除条件を固定する。
- 既存 docs が期待動作を定義していれば、それを参照する。仕様の変更または実態との不一致が確認できたときだけ docs 更新を成果物へ含める。

修正会話に却下・訂正された案がある場合は、現在の確定内容と必要な記録から本文を組み直す。旧案を否定文・将来候補・不要な節として復活させない。契約上必要な Non-scope、比較、検証、監査記録は保持する。

## Validate / Deliver / Stop

Scope → Acceptance Criteria → Required Tests が対応し、別機能や無関係な refactor が混入していないことを確認する。本文完成後は [issue-readiness-check](../issue-readiness-check/SKILL.md) の観点を使い、担当 agent が `READY` / `NOT_READY` / `WAITING_FOR_HUMAN_DECISION` を判定する。

日本語の本文と、残る判断・正本資料・readiness 結果を返す。必要な判断が残る場合はそこを停止境界にし、起票したことだけで実装可能としない。Phase D での候補抽出・優先付けは [phase-d-followup-issue-flow](../phase-d-followup-issue-flow/SKILL.md) へ任せる。
