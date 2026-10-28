# Issue #203 Harness v2.1

## Objective / success criteria

正本は Issue #203、親 #195、docs/harness-v2/requirements.md Q01〜Q16。
旧 #196〜#198 / PR #200〜#202 の固定資産・失敗・欠測を保持し、新しい隔離 v2.1 に保存破損fixture、モデル提示前の実行出力集約、意味に基づく検証選択、限定評価を追加する。全ACへ実装・検証・残リスクを対応付け、独立監査の重大所見を処理してPR提出する。

## Entry / boundary

- Stage: A/B → C実装・監査 → D評価・PR提出。
- execution profile: High-Risk（秘密保護・検証判定の運用影響）。Plan artifact必須。本ファイルが実装前計画。対話のPlan mode切替は要求しない。
- affected layers: 隔離tools/harness-v21、docs/harness-v21、当taskのみ。製品のcontract-sensitive変更なし。合成DOの保存境界は試験対象。
- 適用規約: root AGENTS / WORKFLOW / QUALITY。既存apps配下は編集しない。
- current request ceiling: 実装・test・独立review・commit・push・PR作成まで（今回のuser依頼により起票時の未許可を解除）。
- allowed side effects: task所有worktree/new trial内の編集・ローカル検証、許可されたGit公開。
- forbidden: #199正式移行、旧ハーネス撤去、merge、Issue close、deploy、release、製品契約変更、#188/#192 WIP/worktree/stash変更、旧実験の再起動・retry枠リセット。
- next unlock condition: none。実セッションのみ以下の品質gateを前提とする。
- stop condition: 秘密のモデル提示、未許可操作、データ損失兆候、保存破損AC不成立、必須証拠不足、未処理Blocker/Must fixで追加実セッション停止。

## Bounded work / owners

1. 親: 新v2.1 entrypoint/policy/runtime、安全runner、selector正負試験、manifest/計測/評価docs。既存v2の純粋な権限・snapshot・完了gateは再利用し、固定資産は編集しない。
2. server-implementer c2_fixture: tools/harness-v21/fixtures/**のみ。合成C2の破損enum/boolean/array/数値/形状拒否・storage不変・旧保存・race/reorderを実行試験。製品の同様な静的経路は別課題候補として記録。
3. contract-auditor / implementation-auditor: read-only、v2.1のQ/権限と品質・安全の独立監査。実装者と別identity。重大修正後は再確認。
4. execution-coordinator planning: read-onlyの既存構造確認とbounded計画助言。親が統合責任を持つ。

委譲packetにはobjective/success/scope/non-goals/forbidden/allowed effects/output/validation/continue/escalationを含める。各実spawn IDと返却statusは評価証跡へ記録。parent toolingは既存front/server製品実装責務外で親所有とし、合成Worker実装と両監査は委譲する。

## Validation plan

- v2.1 Python policy/secret/launcher負試験、旧v2全試験、比較tool全試験。Pythonは標準TS検査外なので明示実行。
- 合成C2 TS testを明示実行・型検査。実hibernation/native/source未実施を成功にしない。
- check:agents / check:design-contracts / lint / typecheck / stats / Worker test（CI quick floor）、client build（常時build確認）。依存変更なし。
- ログは固定ID/exit/集計値だけ提示し、stdout/stderr/例外/child出力の原文を保存・表示しない。合成秘密を含む負試験と監査資料生成を点検。
- before/after WIP snapshot / hash / stash、既存固定資産hash、git diff --check、scope/UTF-8/LF確認。

## 限定実セッションの事前条件

静的・policy/probe・fixture負試験・両独立監査がPASS後だけ開始。新revision/manifest/入力/fixture/モデルeffort/hash/計測・評価者を実行前に固定する。

- 合計最大2回: 局所Client代表1、Worker/DO代表1。各1回、retryなし。環境不成立・利用上限・中断も枠消費。
- 各20分、全体40分上限。並列実行なし。最初の品質不合格・秘密出力・必須証拠欠落で後続停止。
- 旧18回比較を再現せず、新v2.1 screening。旧retry ledgerは継承資料として保持し、旧runを再開しない。
- fresh独立repo、gpt-6.1-sol / high、必要時reviewer同モデル。外部操作はstubのみ、local検証だけ。ユーザー秘密を実験入力へ取り込まない。
- 成否/Blocker/手戻り/検証面/wall/実子/parent+children tokensを記録。未計測null。旧結果と非同条件のため改善率・因果・統計的優越を主張しない。
- runtimeの実行は安全runnerの固定コマンドだけ。raw logs/環境dump/任意server起動禁止。OS強制隔離とinstruction遵守を区別。

## Rollback / impact / commits

製品/利用者データ/Cloudflareへ変更なし。trialを離れて旧checkoutの新規sessionへ戻る。現行ハーネス・v2・旧証跡は保持。新tools/docs/taskだけrevert可能。
commitは是正実装・test/固定manifest、限定評価・監査結果を論理単位として分ける。最終PR baseはv1。#203完了と正式採用は別判断。
