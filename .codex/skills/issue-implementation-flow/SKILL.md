---
name: issue-implementation-flow
description: INFINITAS ARENA の確定済み Issue を番号・URL指定で実装するとき、既存の Phase 判定・kickoff・実装・検証スキルへ接続する。Issue 本文作成、開始指示文だけの作成、PR review 修正は別 workflow。
---

# Issue Implementation Flow

## Objective / Boundary

指定 Issue を作業契約とし、許可された phase まで実装・検証を進め、各受け入れ条件へ証跡を対応付ける。成功条件は、依頼範囲・必須検証・監査の結果が追跡可能であること。

root/local `AGENTS.md`、`WORKFLOW.md`、`QUALITY.md` を適用する。Phase・execution profile・Plan Mode・委譲・監査の判断は既存の担当 agent が行う。このスキルは判断や他スキルの手順を置換せず、入口と成果物を接続する。

allowed side effects は現在の依頼で許可された編集・検証・公開操作に限る。このスキルの選択や Issue の存在から、commit/push/PR/merge/close/release/監視の許可を追加しない。既に得た許可の再確認も要求しない。既存の未コミット変更とローカル素材を保護する。

## Resolve the Source

- 指定 Issue の本文・状態・URL、Scope / Non-scope / Acceptance Criteria / Required Tests と、指定された task・design source を確認する。Issue が closed・置換済み・未確定、または一意でない場合は、通常の新規実装として進めない。
- 現在 branch・HEAD・worktree の状態、対象コードと既存 test を確認する。親・依存 Issue は前提に必要な箇所だけ読み、親の要件を子の実装へ暗黙に追加しない。
- root/local 規約と正本 artifact から current request ceiling / allowed outputs / forbidden outputs / next unlock condition を抽出する。より狭い ceiling があればそれを保持する。

## Connect the Existing Phase Flow

- orchestrating agent が `WORKFLOW.md` の Entry Protocol を出力し、仕様が未確定なら Phase A に戻す。readiness 確認は [issue-readiness-check](../issue-readiness-check/SKILL.md) を使う。
- Phase B が必要なら、担当 agent が bounded packet を作る。Plan Mode または cross-turn handoff で具体的 task を要求する文脈では、実装前に `tasks/*.md` を用意する。[plan-mode-gate](../plan-mode-gate/SKILL.md) は判定材料としてだけ使う。
- A/B が揃ったら [phase-c-kickoff-flow](../phase-c-kickoff-flow/SKILL.md) を使う。実際の spawn/no-spawn を記録し、必須の委譲を省略しない。`READY` だけで実装許可とせず、現在の依頼と artifact の ceiling を照合する。
- 実装が既に依頼され、より狭い ceiling がなければ、task と kickoff 完了後は同じ依頼内で進む。追加の架空の承認工程を挟まない。`planning-only` / `kickoff-only` なら許可 artifact の完成で止める。
- 実装担当は最小差分を作り、[quality-check-matrix](../quality-check-matrix/SKILL.md) と `QUALITY.md` の検証・必要監査を満たす。FSM/protocol 変更では既存の [fsm-protocol-guard](../fsm-protocol-guard/SKILL.md) を参照する。

新たな契約判断、目的外の必須拡張、依存・CI 変更、UI 正本の参照不能などは既存 Replan Gate に戻す。Issue と現在の依頼で確定済みの範囲内にある局所的な方式選択は停止理由にしない。独立した許可済み作業は完了させ、未解決部分を `BLOCKED` / `ESCALATION` として残す。

## Acceptance / Delivery

各 Acceptance Criterion に「実装箇所または成果物 / 検証結果 / 未確認と残存リスク」を対応付ける。必須検証・監査の失敗や未処理の Blocker / Must fix を完了へ丸めない。CI より狭いローカル pass を十分な証明とせず、無関係な既存 failure は修正へ混ぜず記録する。

公開が依頼範囲に含まれる場合だけ [commit-pr-flow](../commit-pr-flow/SKILL.md) へ進む。レビュー修正は [phase-c-review-response-flow](../phase-c-review-response-flow/SKILL.md)、merge/close は各既存 gate へ接続し、レビュー待ちを merge 可能と扱わない。PR の追跡依頼がなければ監視を追加しない。

報告直前に `WORKFLOW.md` の Governance Feedback Loop に従い、観測事実・更新候補・変更不要の理由を短く振り返る。通常の実装依頼から skill/governance 編集へ広げない。

日本語で実装概要、受け入れ条件の証跡、検証と未実施理由、仕様との差異、後続候補、振り返り、commit/push/PR の実施状態、`COMPLETE/BLOCKED/ESCALATION` を返す。完了報告だけを理由に Issue を close・編集・comment しない。
