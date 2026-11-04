# WORKFLOW.md

## 0. Purpose

この文書は、Phase運用と Plan Mode ゲートを定義する。

設計方針:
- **Phase** はライフサイクル管理
- **Plan Mode** は実行前ゲート
- 両者は直交運用する（`PhaseA = Plan Mode` にはしない）

### 0.1 Entry Protocol

新規着手時は、実作業の前に最低限次を固定する:
- `Stage`
- `objective / expected outcome`
- `affected layers`
- `contract-sensitive` 該当有無
- `execution profile` (`Local-Fast / Standard / High-Risk`)
- `Plan Mode` 要否
- `success criteria / stop condition`
- 適用した root/local `AGENTS.md`
- `Spawn Gate` 適用結果
- `No-delegate reason`（非委譲時のみ）

ルール:
- 入口判定を省略したまま実装/再計画へ進まない
- `Issue` / `tasks/*.md` / design docs が正本指定されている場合、Entry Protocol でその正本を明記する
- Entry Protocol の出力は短くてよいが、後続の Phase 判断を再現できる粒度で残す
- user が同一スレッドで再指摘した制約や順序がある場合、sticky constraint として以後の Phase 出力にも反映する
- user-facing な Entry Protocol / Plan / kickoff / close summary / final result は、user が明示的に別言語を求めない限り日本語で返す
- 固定ステータス語彙、コード識別子、ファイル名、コマンド名は英語のまま保持してよい

### 0.2 Execution Boundary From Source Artifact

正本にした `Issue` / `tasks/*.md` / kickoff artifact / accepted plan に phase 境界や停止条件がある場合、着手前に最低限次を抽出する:
- `current request ceiling`
- `allowed outputs now`
- `forbidden outputs now`
- `next unlock condition`

ルール:
- user の広い動詞は、正本 artifact のより狭い phase 境界を自動では上書きしない
- `task作成まで` / `kickoffまで` / `planning-only` が ceiling の場合、artifact 作成や blocker 解消後もその turn では downstream phase を開始しない
- missing artifact が唯一の blocker で、その作成が allowed output に含まれる場合、artifact 作成で止まり、実装は `next unlock condition` を満たすまで開始しない。ただし同一 request が downstream 実装をすでに明示許可し、正本 artifact により狭い ceiling がない場合は除く
- user が同一 request で `Phase C implementation` / `C〜D execution` / 同等の実装開始を明示し、正本 artifact により狭い ceiling がない場合は、`current request ceiling` を `implementation-ready` として扱ってよい
- missing artifact が唯一の blocker でも、同一 request が downstream 実装をすでに明示許可している場合は、artifact 作成と `C Kickoff status: READY` 完了後に same turn の実装へ進んでよい
- broad request と narrow phase ceiling が競合する場合、narrow ceiling を優先する

---

## 1. Phase Model (A/B/C/D)

- **A — Requirement shaping**
  - アイデア/曖昧要求を仕様確定可能な形に整える
- **B — Execution planning**
  - 仕様を bounded 実行計画に落とす
- **C — Implementation and audit**
  - bounded 実装 + 必要監査 + 必要検証
- **D — Closure and release preparation**
  - follow-up 抽出、次サイクル化、リリース準備入力整理

---

## 2. Plan Mode Gate

Plan Mode は「実装前に計画成果物を必須化するゲート」。

### 2.1 Plan Mode 必須条件
次のいずれかに該当する場合は Plan Mode 必須:
- アーキテクチャ変更
- Worker/DO の FSM / timer / aggregation 変更
- WS schema (`type/payload`) 変更
- source I/O 仕様変更
- lobby summary schema/filter 変更
- settings/snapshot 互換影響
- CI/CD / Wrangler / Workers/DO 構成変更
- 依存更新（lockfile 含む）
- client/worker/shared を跨ぐ変更
- docs/design の規範仕様を先に更新すべき変更
- Sub-Agent の責務境界/委譲方式変更
- `.codex/agents/*.toml` の意味差分（role/input/output/prohibited/success）

### 2.2 Plan Mode 省略候補
原則として省略可能:
- 単一ファイル中心の局所修正
- 既存責務内のバグ修正
- 文言/UI 表示のみ修正
- 仕様変更を伴わないテスト追加
- `.toml` の誤字修正など意味差分なし変更

---

## 3. Execution Profiles

### 3.1 Local-Fast (A-lite -> C)
適用:
- 局所・低リスク
- bounded 実装が自明

ルール:
- Phase A は最小確認のみ（A-lite）
- Phase B を省略可
- Plan Mode 不要

### 3.2 Standard (A -> B -> C)
適用:
- 中規模、または影響範囲が複数ファイル

ルール:
- A で仕様境界確定
- B で bounded packet 化
- C で実装/検証

### 3.3 High-Risk (A -> B[Plan必須] -> C[監査必須] -> D)
適用:
- contract-sensitive 変更
- cross-layer 変更
- 互換影響や運用影響が大きい変更

ルール:
- Plan Mode 必須
- 監査（contract/implementation）を必須化
- D で follow-up と release input を分離

---

## 4. Phase Exit Criteria

### 4.1 A -> B
必須:
- `fixed decisions`
- `pending decisions`
- `in-scope / out-of-scope`
- `acceptance criteria`
- `execution readiness`

判定:
- pending decision が残る場合は `NOT_READY`
- 人間判断待ちは `WAITING_FOR_HUMAN_DECISION`

### 4.2 B -> C
必須:
- implementer が再解釈なしで開始できる bounded packet
- 依存順/検証期待が明示されている
- `objective` / `success criteria` / `continue-without-escalation boundary` が明示されている

### 4.3 C -> D
必須:
- 実装結果が reviewable
- required validation 完了
- required audit 完了
- 状態が `COMPLETE/BLOCKED/ESCALATION` で明示

---

## 5. Plan Artifact (Plan Mode 時)

Plan Mode では `tasks/<branch-or-pr-name>.md` を作成する。

最低限の記載:
- 目的
- 非目的
- 現リクエスト境界
- success criteria
- stop condition
- allowed side effects
- 今やってよい出力
- 今やってはいけない出力
- 次の解除条件
- 変更点
- 影響範囲（ユーザー/データ/互換性/Cloudflare）
- 対象レイヤ/対象ファイル
- validation plan
- rollback 方針
- commit 分割方針
- delegation packet（必要時）

---

## 6. Delegation Workflow

- 入口は通常 `strategy-orchestrator`
- 仕様整形が必要なら `spec-designer`
- 実行分割が必要なら `execution-coordinator`
- 実装は `front/server-implementer`
- 監査は `contract/implementation-auditor`
- 閉じ処理は `improvement-analyst`

ルール:
- 委譲は必要時のみ
- 非委譲時は理由を明示
- open-ended 指示は禁止
- delegation packet は outcome-first で記述し、micro-step 手順はその順序自体が必要な場合に限る
- skill/checklist は判断の代替ではなく、必要入力・出力 shape・確認観点の補助として使う

### 6.0 Delegation Execution Terms

- `delegation execution plan`: kickoff / planning 時点の spawn 計画。actual execution evidence ではない
- `delegation execution record`: spawn/no-spawn を実際に確定した後の記録。`spawned: yes` なら agent id / ownership / status を含める

ルール:
- future tense の予定や「後で spawn する」は `delegation execution record` として扱わない
- user が spawn 実行を要求した場合、Phase C は spawn 実行または `BLOCKED/ESCALATION` で止まる
- `delegation execution record` は後続監査や close で追跡可能な粒度で残す

### 6.1 Standard Spawn Gate

適用条件:
- `execution profile = Standard`

次のいずれかに当てはまる場合は `execution-coordinator` を委譲候補として扱う:
- 2レイヤ以上にまたがる
- bounded task が曖昧
- 実装が 2 task 以上へ分割される
- 検証が typecheck/lint 以外へ広がる

次の条件をすべて満たす場合のみ non-spawn で進行可:
- 単一レイヤ
- 単一 bounded task
- contract-sensitive ではない
- ローカル検証で完結する

ルール:
- non-spawn で進行する場合は `No-delegate reason` を必ず残す
- 実行中に cross-layer 化や契約影響が判明したら `High-Risk` に再分類する

### 6.2 High-Risk Spawn Gate

適用条件:
- `execution profile = High-Risk`

必須:
- Phase B を完了し、bounded packet を確定する
- 実装担当を委譲する
  - client 変更あり: `front-implementer`
  - worker 変更あり: `server-implementer`
  - 両方あり: 両方
- 監査担当を委譲する
  - `contract-auditor`
  - `implementation-auditor`

ルール:
- 必須ロール未委譲のまま `COMPLETE` を返してはならない
- 例外的に non-spawn とする場合は `ESCALATION` とし、理由を明示する

### 6.3 C Kickoff Gate

Phase C 開始前に次を必ず出力する:
- 実行プロファイル再判定
- Spawn Gate 適用結果
- `delegation execution record`
  - `role`
  - `spawned: yes/no`
  - `objective`
  - `agent id`（`yes` の場合は実際の agent id、`no` の場合は `N/A`）
  - `ownership scope`（`yes` の場合は担当ファイル/レイヤ、`no` の場合は `N/A`）
  - `status`（`yes` の場合は現在の agent 状態、`no` の場合は `N/A`）
  - `no-delegate reason`（`no` の場合は理由、`yes` の場合は `N/A`）

ルール:
- C Kickoff 出力完了まで Phase C 実装を開始してはならない
- `C Kickoff status: READY` は kickoff 完了を意味し、単独では実装許可を意味しない
- `Implementation authorization` は current request boundary から判断する。user が同一 request で `Phase C implementation` / `C〜D execution` を明示し、source artifact により狭い ceiling がない場合は `YES` にしてよい
- 必須ロール未委譲の場合は `BLOCKED` で停止する
- concrete な `tasks/*.md` を要求していない文脈でのみ、Plan成果物がない場合は C Kickoff 冒頭で `A-lite` 合意サマリを再掲して境界を固定する
- cross-turn handoff や prompt/skill が concrete な `tasks/*.md` を要求する文脈では、A-lite へフォールバックせず `BLOCKED` で停止する
- ひな型が必要な場合は `docs/c_kickoff_comment_template.md` を使用してよい
- 将来の spawn 意図だけがある状態で `delegation execution record` を完了扱いしない
- current request ceiling が kickoff-only / task-authoring-only の場合、`READY` を返してもその turn では実装を開始せず停止する
- current request ceiling が implementation-ready で `Implementation authorization: YES` の場合、C Kickoff 出力後は same turn の Phase C implementation へ進んでよく、追加の explicit user authorization を synthetic に要求しない
- missing task artifact が唯一の blocker で、その作成のみが許可されている場合は、artifact 作成で blocker を解消しても same turn で code implementation へ自動継続しない。ただし同一 request が downstream 実装をすでに明示許可している場合は除く

### 6.4 Validation Parity Gate

ローカル検証面と CI/repo の検証面が異なる場合は、狭い方に合わせず広い方へ寄せる。

最低限の確認:
- `package.json` scripts
- 対象 workspace の `tsconfig` include/exclude
- `.github/workflows/*` の validate job

ルール:
- touched files をカバーするローカル command より CI command の方が広い場合、PR 前 validation は CI と同等以上の command を優先する
- `*.test.ts` / `*.test.tsx` を追加・変更した場合、workspace typecheck が test file を除外していないか確認する
- 新規 test file を追加した場合、標準 test script に含まれるか確認する。含まれない場合は `1) script に追加` または `2) 明示コマンドで実行 + 理由記録` を必須とする
- CI 相当の validation がローカルで再現できない場合、狭いローカル pass を CI pass 相当として扱わない。`skip reason` と residual risk を残す

### 6.4.1 Source Worktree Reconciliation Gate

適用条件:
- commit / PR のために clean worktree または別 branch へ scoped diff を隔離した場合

必須確認:
- `source worktree path`
- `isolated paths`
- `post-isolation source status`
- `reconciliation action`（`restore` / `clean` / `stash` / `none`）
- `final source status`

ルール:
- source worktree に upstream-equivalent な in-scope dirty/untracked residue が残る状態で `COMPLETE` を返さない
- `v1` のような既定 base branch source worktree では clean 終了を既定とする
- temporary stash を作った場合は、用途 / 対象 path / keep or drop を追跡できるように残す
- source worktree に user-owned unrelated diff がある場合は preserve するが、scoped copy / isolate の残骸と混同しない

### 6.4.2 Base Branch Latest Sync Protocol

`v1を最新化` のような default/base branch 同期依頼では、少なくとも次を確認する:
- fetch 済み upstream tip
- local vs upstream divergence
- dirty path 分類
  - `user WIP`
  - `upstream-equivalent residue`
  - `generated/untracked residue`
- 選択した同期戦略（fast-forward / rebase / merge）
- stash 作成時の対象 path と disposition
- final `git status`

ルール:
- upstream-equivalent residue を active dirty と混同したまま終了しない
- user WIP を黙って破棄しない
- final 状態が clean でない場合は、残した理由と保持物を明示する
- destructive reset/checkout で同期しない

### 6.5 Replan Gate

次のいずれかが発生した場合は Phase C/D を停止し、Phase A/B へ戻す:
- 新たな contract-sensitive 変更が必要
- in-scope 外への拡張が必須
- `Blocker` / `Must fix` 解消に仕様判断が必要
- UI 正本として wireframe / screenshot / design doc / visual reference が指定されているが、参照不能または準拠確認不能
- 互換方針 / 依存 / CI 変更が必要

ルール:
- 戻し時の状態は `ESCALATION` または `WAITING_FOR_HUMAN_DECISION` を明示する
- 合意が得られるまで Phase C/D を再開しない

### 6.6 Phase D Follow-up Protocol

Phase D で follow-up を起票または起票準備する場合は、優先度だけで終わらせず `Issue-ready artifact` まで整える。

最低限の記載:
- 背景
- 目的
- 非目的
- acceptance criteria
- target layer/files
- validation
- `execution profile` 推奨
- `Plan Mode` 推奨
- kickoff-ready な `delegation execution record` または `No-delegate reason`

ルール:
- 今サイクル外へ出す項目は、次スレッドでそのまま Phase A/B を再開できる粒度にする
- ひな型が必要な場合は `docs/issue_ready_followup_template.md` を使用してよい

### 6.6.1 Phase D Governance Feedback Loop

Phase D 終了時は、必要に応じて governance / agent / skill / prompt/snippet 側の改善余地を確認する。

最低限の確認:
- user が同じ制約や順序を複数回再指摘したか
- local validation と CI validation の面差で取りこぼしが起きたか
- `delegation execution plan` / `delegation execution record` の語彙や運用が曖昧だったか
- review / close の GitHub write-back で反映確認不足があったか
- clean worktree / branch isolation 後の source worktree に in-scope residue が残らなかったか
- default/base branch 最新化の際に dirty path 分類や stash disposition が曖昧でなかったか
- UI 正本 / wireframe / visual reference の確認証跡不足で実機レビュー差し戻しが起きたか
- audit findings の disposition が曖昧なまま PR / close / completion へ進もうとしたか
- 同種の `P1` / `P2` 指摘や運用ミスが再発したか
- prompt/snippet の文面不足で planning-only / placeholder handoff / close ordering miss が起きたか
- 広い user verb に引っ張られて、正本 artifact のより狭い phase ceiling を踏み越えなかったか

出力:
- `none`
- `governance follow-up needed`
- `governance patch applied by explicit request`

ルール:
- 上記確認は行うが、毎回 docs/skills/agents/snippets を自動変更しない
- governance 変更は、current scope に含まれるか、user が明示的に要求した場合のみ実施する
- 実施しない場合でも、再利用価値があるギャップは follow-up candidate として Phase D 出力へ残す
- governance 改善を follow-up 化する場合は、`phase-d-followup-issue-flow` を使って issue-ready artifact 粒度まで整える
- 会話をまたぐ Phase C/D handoff では、concrete な `tasks/*.md` がない placeholder 指定をそのまま受理しない。必要なら `BLOCKED` で止める

### 6.7 Review Response Protocol

PR review / inline thread への対応は、原則として元の `Issue` / `tasks/*.md` を正本にした `Phase C` 継続として扱う。

最低限の流れ:
1. review URL / thread を特定する
2. 元の正本と in-scope / forbidden scope を再確認する
3. actionable thread を抽出し、bounded fix に落とす
4. required validation を再実行する
5. 対応内容を thread へ返信する
6. 解消済み thread を resolve する
7. 未解決 actionable thread がなければ再レビュー依頼を行う

ルール:
- review comment 自体を新しい正本にしない。正本は元の `Issue` / `tasks/*.md` / design docs のまま維持する
- user が review URL/結果を提示して対応を依頼した場合、明示的に read-only 指示がない限り、fix / validation / thread 返信 / resolve / 再レビュー依頼まで同一依頼に含めてよい
- `High-Risk` 変更の review fix では、current state に対して required audit を再実行する
- review 指摘が in-scope 外の拡張、契約変更、依存変更、CI 変更を要求する場合は `Replan Gate` を適用する
- CI / validate failure が review 起点の場合、review fix 後の validation は元の failure command と同等以上の面で再実行する
- thread 返信なしの resolve はしない
- unresolved actionable thread が残る状態で再レビュー依頼をしない
- review fix の完了報告には、どの thread をどう処理したかを明示する
- actionable unresolved thread が存在しない場合は、その no-op 判定根拠と current validation state を記録し、不要な write-back を行わない
- GitHub write-back を行った場合は、reply / resolve / re-review request の反映結果を URL/id または read-back で確認する
- review / audit findings は、completion 前に `finding -> disposition -> evidence -> remaining risk` で潰し込む

---

## 7. PR / Closure Rules

PR 本文には次を必須で含める:
- 目的
- 変更点
- 非変更点
- 影響範囲
- 検証内容
- 回帰確認

高リスク変更では追加:
- rollback 方針
- 互換影響
- Cloudflare resources 影響
- docs/design 更新有無

Issue クローズ時:
- `docs/issue_close_evidence_template.md` の証跡を必須記載
- Milestone 管理 Issue では同テンプレ内の「Milestone監査ログ（Issue↔PR対応表）」を併記する
- follow-up を別Issue化した場合は、Issue 本文または起票コメントに `Issue-ready artifact` 相当の境界情報を残す

### 7.1 Post-Merge Issue Closure Protocol

Issue をクローズする前に、少なくとも次を確認する:
- 対応種別（`コード` / `非コード`）
- PR URL または commit SHA
- follow-up の有無
- milestone 管理 Issue かどうか

follow-up 検出元:
- Issue 本文
- Issue コメント
- merge 済み PR 本文
- merge 済み PR コメント
- Phase D 出力
- `tasks/issue-*.md`

ルール:
- follow-up は「明示された Issue / PR」のみ列挙する
- 明示された follow-up が見つからない場合は `なし` と記載する
- 推測しかできない場合は `BLOCKED` とし、番号を捏造しない
- closure evidence comment を先に投稿し、その後に Issue を close する
- closure evidence comment は、投稿後に comment URL/id または read-back で存在確認してから close する
- write-back command の empty response / confirmation 不在は成功証跡として扱わない。別 write path へ切り替えるか read-back で補完する
- milestone 管理 Issue では、closure evidence と同一コメント内に Milestone 監査ログを併記する

### 7.2 Post-Merge Local Cleanup Protocol

適用条件:
- user が `close + cleanup` を要求した場合
- current request boundary に local cleanup が含まれる場合

必須確認:
- `cleanup target worktree path`
- `cleanup target branch name`
- target branch が `codex/*` である
- target branch の作業が base branch に取り込まれている
- target worktree が clean である
- target branch が current branch / protected branch ではない
- target branch を参照する別 worktree がない

推奨順序:
1. cleanup target を特定する
2. merged PR / reachability / closure evidence で base branch への取り込みを確認する
3. target worktree が clean であることを確認する
4. `$worktree-branch-cleanup-guard` を適用する
5. target worktree を削除する
6. target local branch を削除する
7. `git worktree list` / `git branch --list` で read-back する
8. current request に merge / Issue close も含まれる場合は、merge 完了 -> closure evidence comment 投稿 -> Issue close の順を守る

ルール:
- dirty worktree は自動削除しない
- base branch 取り込み未確認の branch は削除しない
- current branch / protected branch / base branch を cleanup 対象にしない
- user-owned WIP を黙って stash / delete しない
- cleanup を current request に含めた場合、cleanup 未完了で `COMPLETE` を返さない
- delete 失敗時は `BLOCKED` / `ESCALATION` を返す

### 7.3 Post-Approval Merge Protocol

適用条件:
- user が human review / approval 後の PR merge を Codex に委任した場合
- current request boundary に `merge + close` または `merge + close + cleanup` が含まれる場合

必須確認:
- `target PR`
- 正本 `Issue` / `tasks/*.md` / merge 対象 scope
- `execution profile`
- PR read-back の `author.login` / `author.is_bot`
- merge authority lane（`bot-created PR` / `task-owned / user-authored PR`）
- reviewer approval state
- required checks status
- unresolved actionable review thread の有無
- follow-up 判定状態
- merge strategy または repo default merge method

推奨順序:
1. target PR と正本 scope を特定する
2. PR read-back で `author.login` / `author.is_bot` を確認し、merge authority lane を固定する
3. human reviewer の approval を確認する
4. required checks が green であることを確認する
5. unresolved actionable review thread がないことを確認する
6. follow-up の有無と close prerequisites を確認する
7. `Standard` の場合は lane 別 gate を適用する
   - `bot-created PR`: human `Approve` を merge authorization として扱ってよい
   - `task-owned / user-authored PR`: bot lane へ繰り上げず、single-maintainer same-account deadlock が成立しない限り通常 approval gate を維持する。deadlock が成立する場合でも、required checks green、unresolved actionable review thread なし、follow-up 判定完了、user の明示 `mergeしてOK` または同等の merge authorization を必須とし、approval-only fallback は使わない
8. `High-Risk` の場合は、approve に加えて user の明示 merge 許可または auto-merge 許可を確認する
9. PR を merge する
10. merged state を PR read-back / merge commit SHA / merged flag で確認する
11. current request に Issue close が含まれる場合は `7.1 Post-Merge Issue Closure Protocol` を実行する
12. current request に local cleanup が含まれる場合は `7.2 Post-Merge Local Cleanup Protocol` を実行する

ルール:
- Codex は self-approve で merge gate を満たした扱いにしない
- lane は publish path の想定ではなく、PR read-back の `author.login` / `author.is_bot` で確定する
- author identity read-back がない、または lane evidence が曖昧な PR を `bot-created PR` 扱いしない
- bot-created PR の `Standard` 変更では、human `Approve` を merge authorization として扱ってよいが、checks / review threads / follow-up gate が揃っていることを前提とする
- `task-owned / user-authored PR` の `Standard` strict fallback は single-maintainer same-account deadlock に限定し、explicit user merge authorization なしでは使わない
- `task-owned / user-authored PR` で human `Approve` だけを根拠に merge しない
- `High-Risk` 変更では、human `Approve` のみで merge しない
- required checks が pending / failed の状態では merge しない。例外がある場合は skip reason と authority を明示する
- unresolved actionable review thread が残る状態で merge しない
- merge の write-back 実行後は merged state を read-back で確認する
- merge + close + cleanup を current request に含めた場合、merge / close / cleanup のいずれかが未完了なら `COMPLETE` を返さない

---

## 8. Agent Definition Workflow

- `.codex/agents/*.toml` が正本
- `name` は kebab-case / filename と一致
- `npm run check:agents` をローカル/CIで必須
- 旧 role 名の互換 alias は作らない
