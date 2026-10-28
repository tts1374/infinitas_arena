---
name: issue-start-prompt-flow
description: INFINITAS ARENA の指定 Issue・task を別チャットで進めるための開始指示文を作る。「次の Issue の指示文」「引き継ぎ文」等で使い、その場での実装や Issue 本文作成には使わない。
---

# Issue Start Prompt Flow

## Objective / Boundary

正本・今回固有の注意・実行可能な phase が伝わる、コピー可能な日本語の開始指示文を一つ作る。成功条件は、次の担当が仕様や許可を推測せず開始でき、既存手順の全文を重複させないこと。

allowed side effects は依頼された指示文の作成まで。対象 Issue の実装、branch/commit/PR 作成、投稿、監視開始は行わない。正本の取得や実状態確認は read-only で行う。

## Establish the Handoff

- Issue/task の本文・状態・URL または path、最新の root/local 規約と関連実行スキルを確認する。既に確認済みの同一資料を再読込しない。対象が曖昧・取得不能なら仕様を補わず、確認できた範囲と不足を返す。
- branch・dirty 状態・直前 PR の merge は、引き継ぎに必要な場合だけ実測する。未確認の完了・環境・認証回避策を事実として書かない。
- Issue 実装なら [issue-implementation-flow](../issue-implementation-flow/SKILL.md)、review なら既存の review-response skill など、依頼に合う入口を一つ選ぶ。関連スキルを無差別に列挙しない。
- current request ceiling と sticky constraints を保持する。実装・調査・仕様確定・追跡のみ等、次の担当が作る成果物を明示する。

## Compose

冒頭に正本の URL/path、本文を作業契約にすること、最新 root/local 規約と選んだスキルを参照することを書く。続けて、成果物が変わり得る今回固有の注意とユーザーの明示制限だけを残す。Scope / Acceptance Criteria / 手順は参照元へ任せる。

Phase C/D の cross-turn handoff では、実在する `tasks/*.md` を指定する。具体的 task が必要なのに無い場合は `BLOCKED` を返し、placeholder path を作って引き継がない。指示文作成だけの依頼を task 作成・実装へ広げず、不足する artifact を明記する。Phase A/B の開始文なら、その phase と task 作成が必要になる時点を示してよい。

「この turn は指示文作成のみ」という制限は、未来の実行者への実装禁止と混同しない。ユーザーの「ローカルのみ」「kickoff まで」等の明示制限は引き継ぐ。既に実装依頼があり狭い ceiling がなければ、新しい承認待ちを追加しない。merge/release/監視などの別操作の許可も創作しない。

## Validate / Deliver / Stop

各段落が「参照先」「今回固有の注意」「明示制限」「確認済み状態」のいずれかとして必要か確認し、重複を削る。正本の phase ceiling を越えず、未確認の事実を断定していないことを確認する。

完成した開始指示文を返して止める。不足がある場合は、完成指示文を装わず `BLOCKED` と不足を短く報告する。次の担当が決める問いを、この作成依頼のユーザーへ先回りして投げない。
