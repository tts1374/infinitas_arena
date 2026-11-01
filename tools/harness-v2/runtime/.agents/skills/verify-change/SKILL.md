---
name: verify-change
description: Harness v2 trialで変更を検証し、AC・品質保証・実行証拠を対応付ける。実装開始判断や外部公開操作には使わない。
---

Objective: 変更のパスと意味に対して必要な検証を実行し、未実証を残さず親が完了を判断できる証拠を返す。成功はAC/該当Qの実証と最新差分への対応。許可副作用はGoal内のローカル検証と証跡保存のみ。

`python tools/harness-v2/harness.py select --goal goal.json` を実行し、commands/manual/qualityとtest_membershipを得る。意味タグの選択は親の判断であり、selectorが発見しない意味変更も追加する。規範の詳細は `docs/harness-v2/requirements.md` の該当Qとそのリンク先で読む。

固定コマンドは `harness.py run --goal goal.json --check <ID> --log <repo外の新規log>` で実行できる。失敗logを保持し、再試行は別logにする。Root型・workspace型・実test列挙・CIの面を照合する。標準外testは明示実行し、runtime/type対象へ到達した証拠を残す。command成功だけでmanual gateを埋めない。

UIは指定sourceのpath/hash、状態/幅/keyboard/overflowの実確認、native/sourceは実watcher/parserと別窓、DO復元はmockと実runtimeを区別する。sharedはconsumer/producer/保存・旧新matrixとrolloutを照合する。E2Eは `docs/testing/local-e2e.md` を該当時に参照する。既存testの名前だけをその実証にしない。

Goal checkpointへAC/Q/manualのstatus・証拠、commandsの全試行exit/log/fingerprint、独立reviewの実ID・対象fingerprint・contract/behavior coverage、finding台帳を記録する。`harness.py complete --goal goal.json --evidence <JSON>` は必要証拠の欠落・古さを拒否するが、証拠の真偽と十分性は親/独立reviewerが判断する。

停止: 必須検証のfail/skip/環境不足・未処理重大findingは該当ACをBLOCKEDにし、未実証と理由を報告する。未完を後続へ隠してCOMPLETEにしない。製品test/CIの意味変更がscope外なら変更せずgapを返す。
