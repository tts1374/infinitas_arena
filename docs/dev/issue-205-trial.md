# #205 最小開発フローの隔離試作

2026-10-28 JST。正本は [#205](https://github.com/tts1374/infinitas_arena/issues/205) と「実装・検証・PR作成・レビュー対応、merge禁止」の今回依頼。
目的は開発管理の完成ではなく、#192の小さな製品単位を進めること。#199の正式移行、Issue close、本番deploy/releaseは行わない。

## 最小案と境界

人間がGoal・受入条件を示し、親Codexが調査・短い計画・実装・検証・PRまで進める。重要な仕様/UX/互換性/権限の判断とmergeは人間に残す。局所方式は追加承認なしで進める。
Custom Agent/project Skillは0から開始する。固定8役、ABCD、Spawn Gate、Kickoff、定型計画書、比較専用エンジンは使わない。
独立レビューが必要な契約変更や並列化に利益がある場合に、標準Codexの別コンテキストを使う。レビュー担当は実装を兼ねない。

- 初期案は `gpt-6.1-sol / high` の標準agent `/root/zero_design` が履歴を引き継がず作成。製品設計・local guidance・CIだけを参照するよう指定し、旧統治文書・旧harnessは読んでいないとの返却を受領。
- 親の入口ではIssue取得前に旧governance/skillを読んだため、この親会話自体を旧方式の影響がないblind sessionとは主張しない。Issueの明示例外を確認した時点で旧方式の移植を中止した。
- 新しいrootは AGENTS.md の約40行。WORKFLOW.mdは1つの運用説明、QUALITY.mdは製品検証の参照面。local guidanceの製品不変条件は保持する。
- `docs/design/`、UX source、製品コード、package/lockfile、CI workflow、契約検査はこのprototypeで変更していない。

## 隔離と復帰

prototypeは `codex/issue-205-zero-flow`、基点 `origin/v1 = e89ea1fde22d830d61cf48dacb1ff3f154550e82`。
別のmanaged worktreeに作成し、元環境の旧設定は削除していない。
8 Agent/15 project Skillの53ファイルは `docs/archive/issue-205-legacy/{agents,skills}/` へ同byteで移動した。Git blob比較53/53一致。旧root3文書とconfigも保存した。archiveは比較用であり実行時に読ませない。
`.codex/config.toml` はSol Highだけを指定し、旧role/MCP登録を持たない。利用者のglobal/plugin設定は変更していない。
`check:agents` はこのbranchの有効定義0を検査する。意図的に定義を置いた負試験は拒否、空の対照は成功した。製品CIの他の検査を弱めていない。

復帰は元worktreeを使えばよく、stash適用・元branch変更は不要。試作branch上で戻す場合は試作commitをrevertし、archiveとGit履歴から旧設定を復元できる。実行中の会話に入った指示はファイル変更だけでは消えないので、新しい会話で再開する。
このprototypeのPRはDraftとし、#199の再スコープ・承認なしで正式移行しない。

## #192のread-only調査と選んだ単位

元の作業場所は `C:/Users/tts13/.codex/worktrees/issue-188-phase-c-host-led/infinitas_arena`。
実branchは `codex/issue-192-dev-control`、HEADは指定#188基点 `0dac1b02d3b23d9449d1e63d7ca3f822f98f9e50`。
2026-10-28T05:56:53Zにdirty81ファイル（tracked12/untracked69）とstash2件をread-only記録した。10/26の停止handoff、凍結UX README、操作/責務計画の必要部分、brokerと受付照合moduleを読んだ。
UXは10/18合意のv3を保持。今回UIには手を入れず、wireframe準拠の新たな完了判定も行わない。

最小単位は **送信前・別世代のsnapshotによる操作成功の誤表示を防ぐ受付照合**。
停止handoffに残るT5の未確認事項に対応する。UI/storeを書き換えて受付成功を捏造せず、実送信・raw受信・snapshotの相関だけを修正する。
旧#192全体のtask再開は行わず、明示許可された#205の試行として独立moduleを切り出す。

- 試行worktree/branch: `issue-205-receipts/infinitas_arena` / `codex/issue-205-receipts`。
- #188固定基点に同じ最小設定を適用したtask-ownedのreview基点は `codex/issue-205-receipts-base`。元#188/#192 branchへのpushではない。
- 元WIPから `scripts/dev-control/{protocol,receipts,receipts.test}.mjs` の3件だけをcopy。既存5testを出発点とし、receiptsと回帰testだけを変更する。protocolは同byteの依存として保持する。
- AC: 実送信なし、送信前sequence、異room/generation/session/target、非authoritativeな証拠ではconfirmedにしない。送信後のnormal確認通知/開催ACKとsnapshotは順不同でも確認できる。transport観測と製品ACKを混同しない。
- 製品のFSM/WS/保存形式/UX/Worker/shared、依存/CI/lockfileは変更しない。broker統合、native実窓、3source×3mode、本人プレー、停止/再起動の実機確認は後続#192に残す。

## 実行・検証記録

prototype: `check:agents`、`check:design-contracts`、lint、root typecheck、stats17、Worker98は成功。archive byte比較とzero定義の負試験も成功。
trial: #188から継承したquick全8面（agents/contracts/lint/root typecheck/stats17/client153/Worker187/host-event6）は成功。新mjsは標準npm test列挙外なので、専用の構文検査・明示testを別に実行する。
製品runtimeを変更しない独立mjs単位のためRust/full/実UI/source E2Eは今回の受入条件に含めない。既存fullのworkflowとテストは残っており、#192全体の実機未検証を免除しない。

最初のfresh CLI実行はread-only/policy拒否として停止、変更0、製品test未実施。取得したfinal/JSONLをローカル `.tmp/issue-205/` に保持し、成功扱いしない。CLI制約を解除して再試行せず、アプリ標準の別コンテキスト `/root/receipt_trial` に同じbounded taskを渡した。
trialは新rootを参照し、旧archiveや旧project Skillを読まないよう指定した。project定義0はファイルと検査で確認する。global/bundled toolsの説明まで0であることや、読み込み済み親コンテキストの消去は主張しない。

受付のred→green、独立レビュー、最終保護照合と公開URLは確定後に追記する。

## 計測と暫定判断

- 取得できたCLI失敗session: input100573（うちcached75264）、output816、reasoning output156。CLIが返したusageであり、この作業全体のtoken数ではない。
- 親/アプリsubagentのtoken数、請求額、方式差に起因する削減率は欠測。
- 利用枠の共有account表示は開始時weekly79%/5h4%、途中weekly80%/5h14%。丸めと他sessionの利用が含まれ、このtaskだけの消費や強制quotaではない。
- 初期設計は1案、CLI環境失敗1回、代替試行1回。大規模比較や18回反復は行わない。実子数・所要時間は完了時に確定する。
- 暫定採否: 独立moduleの実装・検証に使える場合のみ、隔離した次の小単位へ継続候補とする。全面移行や#188/#192完成は認定しない。

設計後に旧結果を必要部分だけ照合した。#198はC2両方式FAIL/C3未実施、#203はruntime起動失敗でBLOCKEDのまま保持する。今回の成功でそれらを合格に変更しない。
今回の短い振り返りで修正すべき点は、利用不能なCLI起動経路に試行を重ねないこと。新しいCustom Agent/Skillや比較基盤の必要性は現時点で実証されていない。
