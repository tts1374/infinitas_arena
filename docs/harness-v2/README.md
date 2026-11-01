# Harness v2 調査・設計入力（Issue #196）

調査日: 2026-10-26 JST。対象: [#196](https://github.com/tts1374/infinitas_arena/issues/196)、親Epic [#195](https://github.com/tts1374/infinitas_arena/issues/195)。

## 目的・成功条件・境界

現行構成の名前や数ではなく、製品品質・作業安全・操作権限からHarness v2の設計入力を定める。本資料は**調査結果**であり、現行Governanceを上書きする実行規約ではない。分類の採用・実装は[#197](https://github.com/tts1374/infinitas_arena/issues/197)、比較判定は[#198](https://github.com/tts1374/infinitas_arena/issues/198)、正式移行は[#199](https://github.com/tts1374/infinitas_arena/issues/199)で扱う。

成功条件は、規則の出典・分類・リスク、維持する保証と検証法、比較の入力・合格条件が追跡可能で、#197が旧ABCDの再解釈なしに設計を始められること。ABCD、固定8役、15 Skill、特定のAgent起動数は継承要件にしない。

今回の許可副作用は専用worktree/branch、調査文書、検証、commit/push/ドキュメントPRまで。今回の依頼がIssue本文の過去の「起票のみ」を明示解除している。PR作成とread-backで停止し、#197実装、現行定義変更、製品・テスト変更、merge/close/deploy/releaseを行わない。#192は停止状態を保持する。

## 読み順と結論

#197の隔離試作は [prototype.md](prototype.md)、保証との対応は [prototype-coverage.md](prototype-coverage.md)、実行証跡は [prototype-evidence.md](prototype-evidence.md) を参照する。以下の#196調査入力と#198事前比較条件は維持する。

| 文書 | 内容 |
| --- | --- |
| [inventory.md](inventory.md) | root/local Governance、8 Agent、15 Skill、ゲート・補助資料の分類、重複・衝突マップ |
| [requirements.md](requirements.md) | 弱めない保証、検証への移管、人間/親/独立レビューの境界、#197の要求と未決事項 |
| [comparison-plan.md](comparison-plan.md) | #198の事前固定ケース、測定、品質合格・停止・採用条件 |
| [evidence.md](evidence.md) | 調査基点・出典、#192事例、測定限界、今回の検証結果 |

設計入力の中心は、Goal・AC・許可副作用・証拠を一つの作業契約として保持し、親Agentが範囲内の実行を継続すること。独立性や並列性が必要なときにbounded委譲し、変更の意味とファイルから必要な検証を選ぶ。高リスクの独立レビューは維持するが、「必ず実装担当を外へ出す」「必ず監査2役」という編成自体は評価対象とする。

静的に確認できたのは、複数の判断入口、非blocking decisionとREADYの記述差、shared実装ownershipの未指定、CIとローカル検証の面差である。これらから読み直しや引き継ぎ負担の仮説は立つが、消費量への因果・削減率は未計測。#192には独立監査の有効な不具合検出もあるため、一律撤去の根拠にしない。

## Acceptance Criteria 対応

#196本文の「#2」はEpicの順序および実在する子Issueから#197を指すものとして扱う。

| #196 AC（本文順） | 成果物・確認方法 |
| --- | --- |
| 1. 構成一覧・重複衝突・分類・根拠・リスク | inventoryのG/A/S/T分類表とD01〜D12。実ファイル、task履歴、CIとの照合 |
| 2. 絶対に弱めない保証を検証可能に列挙 | requirementsのQ01〜Q16。規範・既存接点・必要証拠を対応付け |
| 3. 親単独・独立監査・人間許可の条件 | requirementsの判断/権限表とR03/R04/R08 |
| 4. 代表3領域以上、測定、品質、コストを事前定義 | comparison-planのC1〜C3、P1〜P8、測定辞書と判定規則。比較実験は未実施 |
| 5. 未観測指標を未計測とする | evidenceの計測表。#192の一部turn時間と全体消費を区別 |
| 6. 旧方式を無条件移植せず#197へ渡せる | requirementsのR01〜R12、未決事項O01〜O06、#197提出物の完了条件 |

## 今回の実行記録

- Stage: 調査・設計入力の確定から、文書作成/検証/PR作成までのPhase C。製品実装ではない。
- 正本: #196/#195と今回のユーザー指示。適用: root `AGENTS.md` / `WORKFLOW.md` / `QUALITY.md`。local規約は棚卸し対象として参照し、そのサブツリーは変更しない。
- affected layers: docsのみ。contract-sensitive: NO（契約を調査するが変更しない）。execution profile: Standard。Plan Mode: NO（現行アーキテクチャ/定義の意味変更なし）。
- 一つのbounded作業: `docs/harness-v2/*.md`の作成・照合・PR。所有者は親Agent。独立した調査枝の利益が小さいため委譲しない。
- C Kickoff status: READY、Implementation authorization: YES（文書作成・公開まで）。next unlock condition: none。この許可は#197へ拡張しない。
- delegation execution record: role=親Agent、spawned=no、objective=#196成果物、agent id/ownership scope/status=N/A、no-delegate reason=単一調査・執筆責務で製品実装の分割なし。
- continue boundary: 資料の必要範囲の読取、調査文書編集、照合、許可済み公開。製品・現行規約変更が必要ならその部分を#197へ引き継ぎ、権限不明の操作は停止する。
- 停止条件: 必須照合を終え、文書PRの差分と公開状態を確認。禁止領域への変更、WIP破損、未処理Blocker/Must fix、根拠不足を発見した場合は該当作業を停止/修正する。

調査・文書作成は親Agentで実施し、独立監査を実施したとは扱わない。#198では同じ評価基準による独立レビューを必要条件にする。
