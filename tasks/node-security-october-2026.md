# Node.js October 2026 security update

## Entry Protocol / A・B

- Stage: A/B -> C。objective: 開発・CI・公開処理のNode.jsを公式修正版22.23.4へそろえる。
- affected layers: toolchain / CIのみ。contract-sensitive: no。
- execution profile: Standard。CI変更のためPlan Mode必須。
- current request ceiling: implementation-authorized。Implementation authorization: YES。
- BASE_SHA: 64c640fab3a4e03a0a7fe8f71b9bf259be675167
- 適用規約: root AGENTS.md / WORKFLOW.md / QUALITY.md。
- 成功条件: 修正版の選択経路を固定し、既存検証が成功し、目的外差分がないこと。
- stop condition: ローカル修正・検証・独立監査が完了。merge・release・本番操作は対象外。
- この計画は実装ブランチに同梱する。

## 固定判断とスコープ

- 対象: rootとapps/*/packages/*のpackage.jsonのtoolchainメタデータ、Node.jsを選択するworkflow5件。
- workflowのmajor 22指定を22.23.4へ更新し、開発用にも同じVolta指定を追加する。
- 定期Worker曲マスタ処理は既存タグをcheckoutするため、workflow内の指定を保持する。
- 検証でapps/workerからの直接実行がrootのVolta設定を自動継承せず旧Node.jsになることを確認したため、各workspaceのpackage.jsonにVolta extendsを追加する。
- scope再判定: 複数workspaceにある同じtoolchain指定の継承のみ。product実装・契約層は触れないためStandardの単一toolchain層判定を維持する。
- pending decisions: none。
- 非目的: client / worker / sharedの実装、依存・lockfile、FSM / WS契約、Cloudflare構成・データ・公開APIの変更。
- ユーザー操作・保存互換性・本番Workers実行環境への変更はない。
- allowed side effects: 専用worktree内の設定・計画編集、依存導入、ローカルbuild/test。
- 今やってよい出力: reviewableな修正と検証結果。
- 今やってはいけない出力: merge・release・本番deploy・secret/DB更新。
- 次の解除条件: 本番操作を行う場合のみ、その具体的操作に対するユーザー指示。

## Spawn Gate / C Kickoff

- Standard gate: 単一toolchain層、単一bounded task、契約影響なし、ローカル検証で完結。
- 実装を非委譲とする理由: 親が小さな設定変更全体を所有し、独立調査・監査だけを委譲する。
- delegation execution record: role=security-boundary investigator、spawned=yes、agent id=/root/node_security_investigator、ownership scope=3リポジトリのtoolchain設定のread-only調査、status=COMPLETE。
- 実装担当: role=parent implementer、spawned=no、agent id=N/A、ownership scope=N/A、status=N/A。非委譲理由は上記のStandard gate判定による。
- reviewerはfocused checks後に別のfresh read-only agentへ委譲する。
- C Kickoff status: READY。

## 検証とコミット

- Node.js 22.23.4でnpm ci、check:agents、lint、typecheck、client/web build、Worker/web tests、client-stats testsを実行。
- CIのfull profileに含まれるRust check、Wrangler dry-runは再現可能な範囲で実施し、未実施は理由と残るリスクを報告する。
- YAML構文、全setup-node指定、Volta指定、git diff --check、UTF-8(no BOM)/LFを確認する。
- Node.js本体のCVE再現実験は行わず、公式修正版の実行と全選択経路の照合を代替証拠にする。
- 1論理コミット: 計画とNode.js指定のみ。生成物・lockfileは含めない。
- rollback: 本コミットのrevert。ただし旧Node.jsの脆弱性が再導入されるため恒久対処にはしない。

## 参照

- https://nodejs.org/en/blog/vulnerability/october-2026-security-releases

## ローカル検証結果

- Node.js 22.23.4でnpm ci、check:agents、lint、typecheck、client/web build、Worker tests（98件）、web tests（2件）、client-stats（17項目）成功。
- rootと全5workspaceでnode --versionがv22.23.4になることを確認。
- gameplay Workerとupdate-workerのWrangler deploy --dry-run成功。公開操作は実行していない。
- workflow構文・全5selector、Volta継承、依存メタデータ不変、lockfile差分なし、git diff --checkを確認。
- Rust check / Tauriの配布物生成は未実施。Rustコード・依存・Tauri構成は変更しておらず、Node.js toolchainの検証に影響しないため対象外。
- Node.js本体の攻撃到達性・CVEの再現実験は未検証。公式修正版の実行確認を用い、既存機能の互換性はbuild/testで検証した。
- source worktreeは変更せずcleanを維持。reconciliation action: none。
- delegation execution record: role=implementation reviewer、spawned=yes、agent id=/root/node_security_reviewer、ownership scope=3リポジトリのcandidate diffのread-only監査、status=COMPLETE。具体的なbypass・回帰指摘なし。
- Phase D governance feedback: none。未解決Blocker / Must fix: none。
