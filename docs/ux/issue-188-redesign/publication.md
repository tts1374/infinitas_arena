# #188 再設計 — Phase A/B資料の公開記録

2026-10-04 JST。状態: Phase A `COMPLETE` / specification `READY`、Phase B `COMPLETE` / planning `READY`。このPRは合意と実行計画をレビュー・保存する文書PRであり、製品実装を含まない。

## 今回の目的と境界

- objective / success criteria: 合意仕様、視覚参照、既存実装の再利用評価、契約・互換方針、責務別packet、依存順、検証を同じPRで確認できること。
- Stage: B成果物の公開。affected layers: `docs/ux/issue-188-redesign/` と `tasks/issue-188-host-event-redesign.md` のみ。
- execution profile: 今回の文書公開は `Standard`。製品の将来変更は本計画どおり `High-Risk` / contract-sensitive: yes。今回の実行契約・製品データ変更はなし。
- Plan Mode: 公開作業では追加要求なし。製品変更の実装前計画はBで作成済み。Cの必須委譲・監査を省略する許可は含まない。
- current request ceiling / allowed side effects: ユーザーの「OKです。PR作成しましょう。」により、これらの資料のcommit/push、新しい`v1`向けPR作成、元作業場所の対象資料の保全整理まで許可された。
- forbidden scope: C Kickoff、製品実装、既存PR #189の変更・close・merge、Issue更新・close、deploy、旧コードの削除・revert。Implementation authorization: **NO**。
- stop condition: 資料の検証、新PRのread-back、元作業場所の保全整理を完了し停止。C開始にはユーザーの明示指示が必要。
- delegation execution record: `spawned: no`。公開対象は一つの文書成果物群で、B担当の返却は完了済み。公開処理のために実装担当を起動しない。
- ownership: 公開用worktreeの上記資料は親agentのみ。元作業場所や独立試作の原本、製品コードを編集しない。

Phase A/B資料内の「未commit」「B未着手」「commit禁止」等は作成当時の境界・実施記録として保持する。本記録は文書公開のみの追加許可を記録し、過去の実施記録や製品仕様を上書きしない。

## レビューの入口

1. [合意済み仕様原稿](issue-188-draft.md)と[Phase A合意・readiness](phase-a-review.md)。新仕様の正本。GitHub #188・旧task・PR #189の毎曲Readyを再採用しない。
2. [画面対応と操作配置](prototype-review.md)、[Phase A検証](validation.md)、下記の保存済み試作・画像。
3. [Phase B実行計画](../../../tasks/issue-188-host-event-redesign.md)。R0〜R7のowner、依存順、検証、停止条件。
4. [B契約調査](phase-b-contract-review.md)と[B参照・操作・検証証拠](phase-b-evidence.md)。再利用判断はコード・契約・検証を根拠とし、モデル世代を根拠としない。

CR-01〜06は将来Cの必須修正・検証、CR-07は維持回帰へ帰属済み。本PRはその計画を保存するものであり、製品の修正・監査完了を主張しない。Bの未処理Blocker/Must fixはない。

## リポジトリ内で読める視覚参照

元資料の端末内絶対パス・localhost URLは取得時の記録として残す。別環境でのレビュー・後続Cでは、次の同一内容の保存コピーを参照できる。製品のビルド・配信には組み込まない。

- [最終試作原本](prototype/event-host-led-prototype.html)。fragment形式。SHA256: `D6B36B139760A9D21F1AD9CC60C41AD73336B168CD0A37FBE9105E148CC210AF`。
- [独立確認ページ](prototype/event-host-led-preview.html)。ダウンロード後ブラウザで開く。元の生成済みpreviewをそのまま保存し、画面や操作を変更しない。
- 通常対戦の参照: [ロビー](evidence/normal-arena-lobby.png)、[選曲](evidence/normal-arena-picking.png)、[プレー](evidence/normal-arena-playing.png)、[結果](evidence/normal-arena-result.png)。
- 最終方式のPhase A保存画像: [参加者画面](evidence/host-led-player.png)、[狭い画面](evidence/host-led-mobile-full.png)、[未提出](evidence/host-exceptions-unsubmitted.png)、[締切後欠場](evidence/host-exceptions-absence.png)、[休憩中の狭い画面](evidence/host-exceptions-mobile-rest.png)。

由来: `C:/Users/tts13/.codex/visualizations/2026/10/04/01a105aa-dfe2-7d82-a3ae-e34f7aeb6247/` 内の原本・previewと、`evidence-arena/`、`evidence-host-led/`、`evidence-host-exceptions/`。すべてバイト一致のコピー。旧Ready版の試作・中間案・生成ログは公開対象に含めない。

## 公開時の検証と限界

資料のstrict UTF-8/no BOM、新規記録のLF、相対リンク、JSON、コピーのSHA256一致、試作script構文、対象外差分なしを検査する。過去資料の混在改行を一括整形しない。

CI quick相当のagent checker、lint、root typecheck、client stats、Worker testを公開用worktreeで実行し、client buildとdesign checkerも確認する。製品検証は`v1`ベースの回帰確認であり、PR #189の調査時ベースライン、新仕様の実装検証とは区別する。Markdown・独立HTMLは製品の標準typecheck/test対象外のため、資料固有の検査で補う。Cargo・Wrangler dry-run・実端末E2Eは製品変更なしのため今回の対象外。

視覚・クリック確認はPhase A記録とBの実閲覧証拠を参照する。コピー公開で全232状態を再検証したとは主張しない。実通信・実時計・実連携・端末保存はC計画の検証ゲートに残る。公開時の具体的な検証結果・commit・PR author identityはPR本文と作業報告に記録する。

公開前結果: 資料24ファイル、text 15ファイルのstrict UTF-8/no BOM、JSON 2件、inline script 2件の構文、相対リンク18件、元資料12件・視覚参照11件のバイト一致はPASS。`npm run check:agents`、`npm run check:design-contracts`、`npm run lint`、`npm run typecheck`、`npm run test:client-stats`（17項目）、`npm run test:worker`（98/98）、`npm run build:client`はPASS。build時の既存Browserslistデータの古さのnoticeは依存更新を行わず残した。

元作業場所は`v1`のまま保持する。公開済み資料と同一の対象12ファイルだけを確認後、名前付きの対象限定stashで元の未commit資料を保全する。その他のWIP・未追跡ファイル・未mergeの旧ブランチは変更しない。独立試作の原本も保持する。
