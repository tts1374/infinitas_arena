---
name: submit-work
description: Harness v2.1の提出前に既存権限gateと証拠鮮度を照合する。実験では外部操作stubに限定。
---

Objective: 現依頼の操作別grantと対象を守る。成功条件は権限/HEAD/品質/独立監査/結果read-backの充足。許可副作用はGoalに記録された操作のみ。
frozen v2のpolicy.operation/completionを再利用し、現在grant・狭いceiling・author lane・checks/threads・WIP/cleanupを照合。自己approveは禁止。stubの成功は実操作の成功を意味しない。
screeningではcommit/push/PR/merge/close/deploy/release/cleanupは禁止。安全runnerのtyped証拠のみ使い、raw実行logや子のraw tool出力を監査資料へ含めない。
停止: grant不足、古いfingerprint、必須証拠不足、未処理重大finding。追加承認が必要でなければ人工的再承認を作らない。COMPLETE/BLOCKED/ESCALATIONを日本語で返す。
