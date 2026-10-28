# AGENTS.md

## 0. Governance

本リポジトリの統治文書は次の3つ。

- `AGENTS.md` (責務境界 / 委譲契約 / 完了判定)
- `WORKFLOW.md` (Phase運用 / Plan Modeゲート / PR運用)
- `QUALITY.md` (検証マトリクス / 受け入れ基準)

競合時の優先順位:
1. `AGENTS.md`
2. `WORKFLOW.md`
3. `QUALITY.md`

ブランチ規約:
- 既定のベースブランチは `v1`
- 明示指示がない限り、作業/PR のベースは `v1`

基本原則:
- 目的達成に必要な最小差分を優先
- 目的外変更を混ぜない
- 実装・監査・要約は reviewable な粒度で返す
- user-facing な Plan / kickoff / audit summary / final result は、user が明示的に別言語を求めない限り日本語で返す

---

## 1. Responsibility Boundary

### 1.1 文書責務
- `AGENTS.md`: 役割境界、委譲契約、完了判定
- `WORKFLOW.md`: Phase A/B/C/D と Plan Mode の運用
- `QUALITY.md`: 検証の必須項目とリスク連動要件

### 1.2 ディレクトリローカル規約
- `apps/client/AGENTS.md`
- `apps/worker/AGENTS.md`
- `packages/shared/AGENTS.md`

ルール:
- 対象サブツリーではローカル規約を追加適用
- ローカル規約は root を弱めてはならない

### 1.3 Agent / Skill 分離
- Agent: ルーティング、判断、委譲、監査判定
- Skill: 再利用可能な定型ワークフロー

ルール:
- 判断ロジックを Skill に移譲しない
- 定型処理を Agent 個別プロンプトへ重複実装しない

### 1.3.1 Outcome-first Instruction Design

ルール:
- agent / skill / governance 文面は、細かい手順列挙より先に `objective` / `success criteria` / `stop condition` / `allowed side effects` を明示する
- step-by-step 指示は、その順序自体が品質・安全・互換性に必要な場合だけ明示する
- 共通ガバナンスは root/local 文書へ寄せ、agent 定義では role 固有の判断・停止条件を優先して書く
- implementer / auditor には、「どこまで自走継続してよいか」と「どこで `BLOCKED` / `ESCALATION` へ切り替えるか」を明示する
- tool 固有の使い分けや入出力注意は、可能な限り tool description / delegation packet / task artifact 側へ寄せる
- user 由来の可変テキストを agent の developer instructions や skill 本文へ埋め込まない。必要情報は user message / task artifact / delegation packet として渡す

### 1.4 Scope / Norm Anchoring

ルール:
- user が `Issue` / `PR` / `tasks/*.md` / design docs を正本指定した場合、その文書をスコープ境界の起点として扱う
- 正本指定がある場合、派生論点や関連改善で勝手に scope を広げない
- design docs が期待動作を既に定義している場合、意図変更でない限り docs 追加より実装整合を優先する
- docs 更新が必要なのは、仕様自体を変えるとき、または現行 docs が実態と食い違っていると確認できたときに限る

### 1.4.1 Phase Boundary Anchoring

ルール:
- 正本にした `tasks/*.md` / kickoff artifact / accepted plan / Phase summary が `terminal phase` / `stop condition` / `current request ceiling` を含む場合、それらも execution boundary の一部として扱う
- user の広い動詞（例: 「この plan を実施する」）は、正本 artifact にあるより狭い phase 境界や停止条件を自動では上書きしない
- 正本 artifact が `task作成まで` / `kickoffまで` / `planning-only` を示している場合、その turn で blocker を解消しても downstream の実装/commit/PR を自動開始しない
- 広い要求と狭い phase 指示が競合する場合、より狭い phase 指示を優先する
- 正本 artifact に `kickoff-only` / `task-authoring-only` / `planning-only` などのより狭い ceiling が明示されていない場合、user が同一 request で `Phase C implementation` / `C〜D execution` / 同等の実装開始を明示したときは、その request を implementation authorization として扱ってよい
- concrete な task artifact の不足だけが blocker で、同一 request が downstream 実装をすでに明示許可している場合、artifact 作成と C Kickoff 完了後は same turn で downstream phase へ進んでよい
- downstream phase へ進むには、user の明示解除または正本 artifact 側の明示許可が必要

### 1.5 Sticky User Constraints

ルール:
- 同一スレッドで user が明示した制約、順序、必須 skill、spawn 要求、禁止事項、修正指摘は、明示的に解除されるまで sticky hard constraint として扱う
- user が同じ制約を再度指摘した場合、その制約は「見逃してはいけない運用ルール」に格上げし、以後の Phase / delegation / validation / close に持ち越す
- sticky constraint は、後続の Entry Protocol / delegation packet / validation plan / close plan に影響する場合、出力へ再掲または織り込む
- ローカル判断や慣例で sticky constraint を黙って上書きしない。成立不能なら `BLOCKED` / `ESCALATION` を返す
- `A〜C Kickoffまで` / `task作成まで` / `実装は開始しない` のような terminal phase 指示は sticky hard constraint として扱い、明示解除まで downstream phase を開始しない

### 1.6 Output Language

ルール:
- user-facing な最終出力、Plan、kickoff、review response、closure evidence summary は日本語を既定とする
- `READY` / `BLOCKED` / `COMPLETE`、ファイル名、コマンド名、API名、PR本文テンプレの固定ラベルなど、運用上の識別子は英語のまま保持してよい
- sub-agent / skill から英語テンプレートが返った場合でも、親 agent は user-facing summary を日本語へ正規化する
- user が英語出力、原文維持、または外部提出用テンプレートを明示した場合はその指示を優先する

---

## 2. Sub-Agent Model (固定8役)

公開 Sub-Agent セット:
- `strategy-orchestrator`
- `spec-designer`
- `execution-coordinator`
- `front-implementer`
- `server-implementer`
- `contract-auditor`
- `implementation-auditor`
- `improvement-analyst`

役割境界:
- `strategy-orchestrator`: 入口判定、Phase分類、チーム形状決定
- `spec-designer`: 要件整形、仕様正規化、実行準備判定
- `execution-coordinator`: 実行分割、依存順、bounded packet 化
- `front/server-implementer`: 各担当レイヤの bounded 実装
- `contract/implementation-auditor`: 契約整合 / 振る舞い品質監査
- `improvement-analyst`: Phase D の優先度整理と次サイクル化

禁止:
- implementer が仕様再定義を行うこと
- auditor が実装主担当へすり替わること
- coordinator が product scope を再定義すること

---

## 3. Delegation Contract

委譲は常に bounded task で行う。

用語:
- `delegation execution plan`: spawn 前の実行意図。対象 role、ownership、spawn 条件、検証予定を示す計画情報
- `delegation execution record`: spawn/no-spawn を実際に確定した後の実行記録。`spawned: yes` の場合は agent id / ownership / status を含める

ルール:
- 将来の spawn 意図や future tense の作業予定を `delegation execution record` と呼ばない
- `delegation execution record` は実際に確定した yes/no と、その時点の根拠を持つ
- user が spawn を要求した場合、plan の提示だけで代替しない。実際に spawn するか、できない理由で `BLOCKED/ESCALATION` を返す

Delegation packet 必須項目:
- `task label`
- `objective`
- `success criteria`
- `in-scope files/layer`
- `non-goals`
- `forbidden scope`
- `allowed side effects`
- `expected output`
- `validation`
- `continue-without-escalation boundary`
- `escalation`

運用ルール:
- 「必要時に委譲、非委譲理由を明示」を原則とする
- vague な issue title のみで委譲しない
- 委譲結果は `COMPLETE/BLOCKED/ESCALATION` を必須で返す

---

## 4. Write Ownership

- `1 write scope = 1 owner` を強制
- delegated 実装中、親は同一スコープを書き換えない
- 親は read-only の進行管理/監査調整に限定
- takeover が必要な場合は、停止宣言と再割当を先に明示

---

## 5. Contract-sensitive Boundary

以下は contract-sensitive として扱う:
- `RoomState`
- `CloseReason`
- `SourceType`
- WS message `type/payload`
- shared enums/constants/models
- snapshot/settings compatibility
- lobby summary schema/filtering

規範参照:
- `docs/design/01_fsm.md`
- `docs/design/02_ws_protocol.md`
- `docs/design/03_data_model.md`
- `docs/design/06_source_io_spec.md`
- `docs/design/07_constants.md`
- `docs/design/10_regression_guard_addendum.md`

ルール:
- 必要なら design docs を先に更新
- client/worker/shared を跨ぐ場合は互換方針を明示
- one-sided 変更は明示的互換戦略なしでは不可

---

## 6. Completion Judgment

### 6.1 状態語彙 (統一)
- `READY`
- `NOT_READY`
- `WAITING_FOR_HUMAN_DECISION`
- `COMPLETE`
- `BLOCKED`
- `ESCALATION`

### 6.2 監査 severity (統一)
- `Blocker`
- `Must fix`
- `Should fix`
- `Note`

### 6.3 完了条件
タスク完了は次を満たすときのみ:
- 依頼スコープを満たす
- 差分が最小かつ意図的
- `QUALITY.md` 必須検証が完了
- 目的外差分がない
- delegated 必須出力が返却済み
- 未解決 `Blocker` がない
- 未解決 `Must fix` は明示的な再スコープ/延期がある
- audit findings がある場合、`finding -> disposition -> evidence -> remaining risk` が追跡され、未処理の `Blocker` / `Must fix` が残っていない

### 6.4 UI / Design Source Evidence

ルール:
- 正本 artifact が wireframe / screenshot / design doc / visual reference を指定する UI 実装では、その参照は implementation boundary の一部として扱う
- 実装担当は参照した design source、反映した差分、確認方法を output に残す
- 監査担当は visual source と実装の差異を validation gap または finding として扱う
- design source を確認できない場合、見た目準拠を完了扱いせず `BLOCKED` / `ESCALATION` または明示的な residual risk として返す

---

## 7. Diff Discipline

- 無関係な整形、リネーム、並び替えは禁止
- lockfile は依存更新意図がある場合のみ変更可
- 生成物の直接編集はしない
- 追加スコープが必要なら最小拡張 + 理由明示

### 7.1 Source Worktree Reconciliation

ルール:
- clean worktree / 一時 branch / cherry-pick / file copy で scoped diff を別 worktree へ隔離した場合、元 worktree を in-scope residue のまま残して task 完了 / PR 完了を返してはならない
- 元 worktree に残る in-scope dirty/untracked path が commit 済み branch または upstream と内容一致する場合、それは user WIP ではなく reconciliation 対象の residue として扱う
- `v1` のような既定 base branch worktree を source にした場合、user の明示指示がない限り最終状態は clean を既定とする
- user-owned unrelated diff は preserve するが、copy / isolate した in-scope path は targeted restore / clean / labeled stash で解消する
- reconcile 不能、または source worktree に何を残すべきか判定不能なら `BLOCKED` / `ESCALATION` を返す

### 7.2 Local Cleanup Boundary

ルール:
- `worktree削除` / `local branch削除` は destructive local operation として扱う
- user が `close + cleanup` を明示した場合、または current request に local cleanup が含まれる場合、その cleanup は完了条件に含める
- cleanup 対象は、その task に紐づく local worktree と対応する `codex/*` branch に限定する
- `v1` のような既定 base branch、current branch、protected branch は cleanup 対象にしない
- target branch の取り込み確認不能、target worktree が dirty、task-owned target と証明不能、または削除影響が曖昧な場合は `BLOCKED` / `ESCALATION` を返す
- user-owned WIP を黙って stash / delete しない
- cleanup 実行後は read-back で削除結果を確認する

### 7.3 Approval / Merge Authority Boundary

ルール:
- Codex は自分が作成または更新した PR を self-approve しない
- PR の merge authority lane は、publish path の想定ではなく PR read-back で確認した `author.login` / `author.is_bot` を正本として判定する
- `author.is_bot` の read-back がない、または author identity が曖昧な PR を暗黙に `bot-created PR` 扱いしない。lane を確定できない場合は `BLOCKED` / `ESCALATION` を返す
- bot-created PR では、human reviewer の `Approve` を `Standard` 変更の merge authorization として扱ってよい。ただし required checks が green で、unresolved actionable review thread がなく、follow-up 判定が完了し、current request に merge 後処理が含まれる場合に限る
- `task-owned / user-authored PR` では、`Standard` 変更かつ single-maintainer same-account deadlock に限り strict fallback を使ってよい。ただし lane evidence read-back、required checks green、unresolved actionable review thread なし、follow-up 判定完了、user の明示的な `mergeしてOK` または同等の merge authorization を必須とし、human `Approve` 単独では merge authorization とみなさない
- `High-Risk` 変更では、human reviewer の `Approve` だけで merge authorization とみなさない。user の明示的な `mergeしてOK`、同等の merge 指示、または auto-merge 許可が必要
- merge / Issue close / local cleanup を一連で任された場合、前段の merge gate が未充足なまま close / cleanup へ進まない
- reviewer approval の意味や merge authority をローカル慣例で拡張しない。判断不能なら `BLOCKED` / `ESCALATION` を返す

---

## 8. Agent Definition Source of Truth

- 正本は `.codex/agents/*.toml`
- repository default model と spawned-agent default model の正本は `.codex/config.toml` とする
- `.codex/agents/*.toml` は role 固有の reasoning effort を保持し、model override は実測で必要性が確認された role に限る
- Agent 定義更新時は `npm run check:agents` を必須実行
- `.toml` の意味差分がある場合、必要に応じて `AGENTS.md` / `WORKFLOW.md` / `QUALITY.md` も同時更新
