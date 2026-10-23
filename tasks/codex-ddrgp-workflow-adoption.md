# DDRGP の Issue 運用スキルを取り入れる

## Objective / Success Criteria

ddrgp_scorelog で使われている Issue 作成・実装・引き継ぎの導線を、既存の Phase 運用へ接続する。

- Issue 作成、確定 Issue の実装、別チャット用指示文に、それぞれ用途の明確なスキルがある。
- 実装の受け入れ条件と証跡が対応し、レビュー修正では近接する同原因の不具合も確認できる。
- 振り返りは観測事実から行い、通常実装へ無許可の governance 変更を混入させない。
- リリース文は利用者が画面・操作・結果で分かる変化を説明する。
- 既存の Phase ceiling、Spawn Gate、監査、検証、merge authority を維持する。

## Current Request Boundary

- Stage: A → B → C → D（運用改善のローカル反映と検証）。追加のユーザー依頼により Phase C の commit / push / PR 作成へ継続する。
- Ceiling: implementation-ready。
- Allowed outputs now / allowed side effects: この task に列挙した文書・スキルの追加更新、非破壊のローカル検証、今回差分の commit / 通常 push / v1 向け PR 作成と反映確認。
- Forbidden outputs now / non-goals: アプリ実装、agent の責務・モデル変更、依存・CI・release script 変更、Issue 投稿、merge、配布・deploy、監視作成。
- Next unlock condition: none（追加依頼「PR作成してください」により公開まで許可済み）。
- Stop condition: PR 作成・author/lane の read-back とローカル clean を確認した時点。契約・権限の変更が必要なら依存する作業を止めて ESCALATION。

## Source / Adoption Decisions

参照元: [tts1374/ddrgp_scorelog](https://github.com/tts1374/ddrgp_scorelog/tree/31657ea27ec1601eefec2c855a7f0e4ac288ecf2/.agents/skills)。GitHub の main と、clean なローカルコピーの HEAD が同じ SHA であることを確認した。

| 元スキル | 今回の扱い |
| --- | --- |
| `ddrgp-issue-authoring` | Issue template と `issue-authoring-flow`。既存の readiness gate へ接続する。 |
| `ddrgp-implement-github-issue` | `issue-implementation-flow`。Phase 判定・委譲・監査は既存 governance の担当を維持する。受け入れ条件の証跡対応を取り入れる。 |
| `ddrgp-issue-start-prompt` | `issue-start-prompt-flow`。具体的 task artifact と phase ceiling を保持して引き継ぐ。 |
| `ddrgp-github-review-fix` | 既存 review skill に、指摘の独立確認・原因クラス確認・互換性の往復検証を追加する。返信→resolve→再レビューの既存手順は維持する。 |
| `ddrgp-pink-elephant-guard` | Issue 作成時に現在の確定内容から書き直す観点を取り入れる。独立スキルの増設はせず、必要な Non-scope と監査記録を保持する。 |
| `ddrgp-publish-release` | 既存 release skill に平易な利用者向け文章基準と文章のみの依頼経路を追加する。配布方式は移植しない。 |
| `ddrgp-adr-authoring` | 今回は保留。既存 design docs を正本とし、独立 ADR 運用を追加する必要性は未確認。 |
| `review-ddrgp-db-save-boundary` | 固有の DB 契約は移植しない。既存の FSM/protocol guard を維持する。 |

Issue 実行の既定公開許可、heartbeat の自動開始、DDRGP 固有の状態語彙・DB・配布方式は取り入れない。

## Target Files / Ownership

- 親 agent が governance の単一 write owner。
- `.codex/skills/issue-authoring-flow/{SKILL.md,agents/openai.yaml}`
- `.codex/skills/issue-implementation-flow/{SKILL.md,agents/openai.yaml}`
- `.codex/skills/issue-start-prompt-flow/{SKILL.md,agents/openai.yaml}`
- `.github/ISSUE_TEMPLATE/implementation-task.md`
- `.codex/skills/phase-c-review-response-flow/{SKILL.md,references/review-response-checklist.md}`
- `.codex/skills/phase-d-release-flow/{SKILL.md,agents/openai.yaml,references/release-writing.md}`
- `WORKFLOW.md`、この task。
- Data / Compatibility / Cloudflare impact: なし。実行プロファイルは Standard、単一 governance task、contract-sensitive ではない。Plan Mode 必須条件には該当しない。
- Spawn Gate: non-spawn。単一レイヤ・単一 bounded task・ローカル検証で完結し、責務境界の変更なし。

## Validation Plan

- `npm run check:agents`、`npm run check:design-contracts`。
- CI quick 相当: lint、typecheck、client stats tests、worker tests。
- 追加・更新スキルの `quick_validate.py`、相対リンク、UTF-8(no BOM)/LF、`git diff --check`。
- 構造レビュー: 通常の Issue 実装、kickoff-only の引き継ぎ、契約変更が必要なレビュー、文章だけの依頼で、許可範囲と停止条件を照合する。
- fresh executor による実行評価は行わない。構造レビューを実行効果の実証とは扱わない。

## Rollback / Commit Split

- rollback: この task の追加ファイルと既存文書への追記を戻せる。アプリ・保存データへの影響なし。
- commit 方針: 「Issue 運用の導線と既存スキルの接続」を一つの論理単位とする。追加依頼で commit / push / PR 作成が許可された。

## Result

- ローカル反映・検証時点の Status: COMPLETE。以降の追加依頼により commit / push / PR 作成へ継続。
- 3 つの入口スキルと UI metadata、実装 Issue template を追加し、WORKFLOW の入口表へ接続した。既存 review / release skill と振り返りを更新した。
- `check:agents`（8 agents）、`check:design-contracts`、lint、typecheck、client stats 17 ケース、worker 98 tests が成功。CI quick と同じ command surface を実行した。
- 追加・更新した 5 スキルの quick validation が成功。変更・追加 14 ファイルの UTF-8(no BOM)/LF、19 相対リンク、UI metadata を確認。`git diff --check` 成功。
- client build、Rust、Wrangler、GUI/E2E は未実施。運用文書のみの変更で対応する実装に差分がなく、今回の検証対象ではない。

### 構造レビュー

| 場面 | 照合結果 |
| --- | --- |
| 通常の確定 Issue 実装 | root/local 規約 → 担当 agent の判定 → 既存 kickoff → 実装・監査・検証 → 受け入れ証跡へ接続。公開許可を追加しない。 |
| kickoff-only の次チャット引き継ぎ | concrete task と狭い ceiling を保持する。task 不在なら placeholder を生成せず BLOCKED。指示文のみの作成依頼で実装しない。 |
| 契約拡張が必要な review | 正本と独立照合して Replan Gate へ戻す。近接原因確認は元の変更責務内。 |
| リリース文章だけの依頼 | writing reference で文章を作って終了。release execution の入力・出力・script 実行は要求しない。 |

- finding → disposition → evidence → remaining risk: 文章のみの経路へ実行専用 Inputs / Output Contract が混ざる曖昧さを構造確認で検出 → 該当見出しに release execution only を明示して修正 → 本文冒頭の writing-only 経路と相互照合 → 未解決 Blocker / Must fix なし。fresh executor による実行効果は未検証。
- 振り返り: `governance patch applied by explicit request`。既存 Phase / 監査の重複を避け、確認できた入口・引き継ぎの不足と元スキルの有用な観点だけを追加した。追加の governance follow-up はなし。
