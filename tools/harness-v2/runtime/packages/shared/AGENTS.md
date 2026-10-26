# Shared boundary — Harness v2

Cross-layer契約だけを置く。親または明示一人がwriterを所有し、client/workerの便宜ロジックを持ち込まない。additive/breaking、producer/consumer/保存の互換matrixを明示し、片側移行しない。rolloutには対応版・期間・撤去条件を持たせる。

詳細は `docs/harness-v2/requirements.md` Q03/Q07/Q08/Q10とdesign正本。必要時にdocsを先に更新し、exhaustive switch / parse / serialize / 旧新reader / 不正値を確認する。契約決定・consumer変更・検証・公開の責任を区別し、意味未決は依存部分を停止する。
