# codex-gpt61-sol-governance

## 目的 / 成功条件
- repository default / spawned-agent default を `gpt-6.1-sol` にそろえる。
- `check:agents` が対象モデルを許可し、未知モデルを拒否する。
- 検証マトリクス、Kickoff記録、状態語彙、Phase表記を現行root規約に合わせる。
- 8役の責務、個別 reasoning effort、製品契約を維持し、検証後に `v1` 向けPRを作成する。

## 非目的 / 禁止範囲
- 製品コード、依存、lockfile、CI、design規範、個人設定の変更。
- 過去の移行task・実行記録、既存の `docs/ux/` と `tasks/issue-188-host-event-redesign.md` の変更。
- 役割追加、prompt全面改訂、reasoning effort調整、release/deploy/merge/Issue close/local cleanup。

## 現リクエスト境界 / 停止条件 / 許可副作用
- current request ceiling: implementation-ready（検証・commit・PR作成まで）。
- allowed outputs now: 本task、下記scoped edits、必要検証、作業branch、commit、push、PR作成とread-back。
- forbidden outputs now: 非目的に挙げた変更・操作。
- next unlock condition: none。ユーザーが修正とPR作成を明示許可済み。
- stop condition: scoped diffの検証とPR read-backが完了した時点。必須検証失敗や新たな仕様判断が必要ならBLOCKED/ESCALATION。

## Entry Protocol / 実行計画
- Stage: A/B合意を固定し、C実装・検証・PR作成へ進む。
- Source of truth: このチャットの洗い出し結果とユーザーの実行依頼、本task、root `AGENTS.md` / `WORKFLOW.md` / `QUALITY.md`。
- affected layers: governance/config/scripts/docs（単一責務レイヤ）。
- contract-sensitive: NO（製品契約を変更しない）。
- execution profile: Standard。
- Plan Mode: NO（責務・委譲方式・agent意味差分なし。root規約へ既存派生資料を同期）。
- Spawn Gate: non-spawn acceptable。単一bounded task、契約影響なし、ローカル検証で完結。
- No-delegate reason: 設定と派生資料同期を同一ownerが担当し、独立した実装レイヤの分割がない。
- owner: 親agent。continue-without-escalation boundary: 下記ファイルへの最小修正と必要検証・PR作成。
- escalation: 新しい役割/承認/互換方針の判断、目的外修正、必須検証失敗、PR author情報の確認不能。

## 対象ファイル / 変更
- `.codex/config.toml`: 親と子の既定モデルを更新。
- `scripts/check-agent-definitions.mjs`: `gpt-6.1-sol` を許可モデルへ追加。既存の承認済みモデルはこのtaskで廃止しない。
- `.codex/skills/quality-check-matrix/references/quality-verification-matrix.md`: rootの§3.1〜3.7との対応、現行source、E2E・governance検証、release参照を同期。
- `.codex/skills/plan-mode-gate/references/plan-mode-decision-matrix.md`: 検証参照を現行章へ同期。
- `.codex/skills/phase-c-kickoff-flow/SKILL.md`、`references/kickoff-checklist.md`、`docs/c_kickoff_comment_template.md`: agent id / ownership / statusをspawned=yesでは実記録、spawned=noではN/Aとして同期。
- `WORKFLOW.md` §6.3（レビュー追補）: 既存§6.0・AGENTS.md §3のstatus要求を必須一覧へ反映し、上記3項目の非委譲時N/A表記を同期。root/派生資料整合という目的内の最小追加範囲。
- `.codex/skills/commit-pr-flow/SKILL.md`、`references/phase-c-gate-checklist.md`、`.codex/skills/phase-d-release-flow/SKILL.md`: 状態識別子をroot語彙に統一。
- `.codex/skills/issue-readiness-check/SKILL.md`: Phase 1をPhase Aへ同期。
- `tasks/codex-gpt61-sol-governance.md`: 本計画と完了証跡。

## 影響 / 互換性 / rollback
- ユーザー: 今後のCodex親・子のrepository defaultが6.1 Solになる。アプリ・CLIの明示overrideは別途適用される。
- データ/製品/Cloudflare: 変更なし。
- 8役は共通モデルを継承し、high 5役 / medium 3役を維持する。
- rollback: 本taskの設定・validator・派生資料のcommitをまとめてrevert。ユーザーWIPへ触れない。

## 検証計画 / commit方針
- 必須: `npm run check:agents`、`npm run check:design-contracts`、`node --check scripts/check-agent-definitions.mjs`。
- validator probe: 一時fixtureで6.1 Sol受理、未知の親/子モデル拒否を確認。実repositoryの設定は改変しない。
- CI quick相当: lint、root typecheck、client stats tests、worker tests。技術的build確認はclient buildを追加する。
- product/Rust/DO変更なしのためcargo check / Wrangler dry-run / runtime E2Eは対象外。静的チェックをモデル起動や新モデルの振る舞い証拠とは扱わない。
- scoped diff / UTF-8 no BOM・LF、資料の参照章・語彙・必須record項目、agent定義の不変性を確認。
- 1 logical commit: `chore(codex): migrate defaults to GPT-6.1 Sol and align workflow references`。
- PR本文は目的/変更/非変更/影響/検証/回帰確認を含み、author.login / author.is_botとhead/baseをread-backする。
- source worktree: `v1`に製品/本task差分を作らず、既存未追跡WIPを保全。scoped residueなしを終了時に確認。

## C Kickoff / 実行記録
- C Kickoff status: READY。
- Implementation authorization: YES。
- Replan triggers: 上記escalation条件。
- delegation execution record:
  - role: 親（実装・検証・PR担当）
  - spawned: no
  - objective: 本taskのscoped実行
  - agent id: N/A
  - ownership scope: N/A
  - status: N/A
  - no-delegate reason: 単一governance bounded task

## 完了証跡
- 実装修正・ローカル検証・PR公開: COMPLETE。
- PR公開read-back: https://github.com/tts1374/infinitas_arena/pull/190 。author.login=`tts1374`、author.is_bot=`false`（REST user.type=`User`）。lane=`task-owned / user-authored PR`。head=`codex/gpt61-sol-governance`、base=`v1`、公開時head SHA=`5ce13dee4d443b519d1c3e93069bcd8ea601fc65`。
- PASS: check:agents、check:design-contracts、node syntax check、lint、root typecheck、client build。
- PASS: client stats 17ケース、worker 98テスト（fail/skipなし）。
- PASS: 一時fixtureで6.1 Sol親/子を受理し、未知の親モデル・子モデルをそれぞれ拒否。
- PASS: QUALITY章参照、record必須項目、状態/Phase語彙、UTF-8 no BOM/LF、agent/製品/依存の差分なしを確認。
- validation surface: repo CI quickと同じ全commandにclient buildとgovernance/probe検証を追加。Rust/DOはtouched surface外。
- Note: client buildで既存Browserslistデータの古さを示す警告。build成功。依存更新はscope外のため実施しない。
- 未実施: 新モデルの実起動・代表タスクによる振る舞い比較。静的検証をその代替証拠として扱わず、残余リスクとしてPRへ明記する。

| finding | disposition | evidence | remaining risk |
| --- | --- | --- | --- |
| 親/子の旧既定モデル | fixed | 両方6.1 Sol、check:agents成功 | アプリoverride・実起動は別途確認 |
| validatorが6.1を拒否 | fixed | 許可追加、正例/未知モデル負例3ケース成功 | 既存許可モデルの廃止判断はscope外 |
| 品質/Plan参照の古さ・source不足 | fixed | §3.1〜3.7照合、現行source/E2E観点とrelease参照同期 | 実運用の選択精度は未比較 |
| Kickoff記録項目不足 | fixed | skill/template/checklistに実id・ownership・status | 実spawnでの記録確認は未実施 |
| 状態語彙・Phase表記の不一致 | fixed | root語彙との照合、旧表記残存なし | prompt振る舞いは未比較 |
- 未処理Blocker/Must fix: なし。
- source reconciliation: 変更を専用worktreeで作成したため、sourceへ本task差分のcopy/residueを残していない。既存の未追跡WIPを保全。

## PR #190 レビュー対応
- Source of truth: 本taskとPR #190。Phase C継続、Standard、Plan Mode不要、contract-sensitive=NO。
- current request ceiling: 指摘修正・検証・commit/push・返信・resolve・再レビュー依頼まで。merge/close/cleanupは含めない。
- No-delegate reason: task記録とPR本文のみの局所資料修正。親が担当する。
- 検証: check:agents / check:design-contracts、taskのspawned=no記録3項目、lane evidenceとPR read-backの一致、UTF-8 no BOM/LF、scoped diff。前回製品検証とCI成功は既存証跡として保持し、製品変更のない今回で再実施扱いにしない。

| finding | disposition | evidence | remaining risk |
| --- | --- | --- | --- |
| Must fix: 本taskの非委譲記録3項目が欠落し、自己適用のPASS証跡と矛盾 | fixed | C Kickoff記録にagent id / ownership scope / statusを各N/Aで追加し、本task自体を検証対象に含める | なし |
| Should fix: PR公開lane evidence未記載 | fixed | 上記完了証跡へREST read-backのauthor.login / author.is_bot、lane、head/baseを記録。PR本文にも同じ証跡を反映する | merge authorityは別requestで再判定 |

## PR #190 追加レビュー対応
- Source of truth: 本taskと[追加レビュー](https://github.com/tts1374/infinitas_arena/pull/190#pullrequestreview-5405836381)。Phase C継続、Standard、Plan Mode不要、contract-sensitive=NO。
- current request ceiling: §6.3の記録shape整合・検証・commit/push・返信・再レビュー依頼まで。
- 許可範囲の補足: root §6.0とAGENTS.md §3に既存のstatus要求を、漏れていた§6.3へ明示する。spawnの判定・役割・承認境界は変更しない。
- No-delegate reason: WORKFLOWの当該一覧と本taskのみの単一governance局所修正。親が担当し、ローカル検証で完結。
- PASS: check:agents / check:design-contracts、AGENTS §3・WORKFLOW §6.0/6.3・skill/checklist/template・本task間のyes/no記録shape整合、UTF-8 no BOM/LF、2ファイル限定diff。WORKFLOW §6.3外の不変性も照合済み。
- delegation execution record:
  - role: 親
  - spawned: no
  - objective: 追加レビュー指摘の記録shape整合
  - agent id: N/A
  - ownership scope: N/A
  - status: N/A
  - no-delegate reason: 単一governance局所修正

| finding | disposition | evidence | remaining risk |
| --- | --- | --- | --- |
| Must fix: WORKFLOW §6.3にstatusと非委譲時N/Aが欠落 | fixed | §6.3のagent id / ownership scope / statusをyes=実記録、no=N/Aで明示し、root/skill/template/taskを再照合 | 実spawnでの振る舞い比較は既存の未実施項目として保持 |
