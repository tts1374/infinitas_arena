# 開発フロー（Issue #205 隔離試作）

人間が目的と受入条件を示す → 親Codexが調査・短い計画・実装・検証 → 必要時の独立レビュー → PR → 人間の最終判断。

通常の入口は root AGENTS.md。固定の段階、役割、project Skillは要求しない。
仕様/UX/互換性の重要判断とmergeは人間が行い、決定内の局所実装はCodexが進める。
試作の採否は docs/dev/issue-205-trial.md に記録する。正式移行や#199の実行は含まない。
旧方式は docs/archive/issue-205-legacy/ の比較用履歴。製品仕様・既存テストは引き続き有効。
