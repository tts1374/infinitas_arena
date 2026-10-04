# #188 再設計 Phase B — 参照・操作・検証証拠

2026-10-04 JST。今回の新しいPhase B計画に対する証拠。Phase Aの資料・旧B/C記録は上書きしない。

## 入口判定と実行境界

- Stage: Phase B / execution planning。
- objective / expected outcome: 合意済みのHost主導進行を、再利用判断・契約移行・責務別packet・依存順・検証へ落とし、新規 `tasks/issue-188-host-event-redesign.md` を作成する。
- 正本: `issue-188-draft.md`、`phase-a-review.md`、最終 `event-host-led-prototype.html`。`handoff.md` / `prototype-review.md` / `validation.md` を参照した。維持する詳細は原稿が指定した旧#188 Fixed decisions §1–9と照合する。
- affected layers: 計画対象はclient UI/state/source bridge/history、worker FSM/controller/routes/persistence、shared contract、design docs、検証script/fixture。今回のwriteは新規計画と補助資料だけ。
- contract-sensitive: yes。開始条件・WS payload・live snapshot・DO record・履歴DTOに影響する。
- execution profile: High-Risk。Plan Mode: required（リポジトリの実装前Plan成果物ゲート。アプリの対話モードはDefault）。
- 適用規約: root `AGENTS.md` / `WORKFLOW.md` / `QUALITY.md`、`apps/client/AGENTS.md` / `apps/worker/AGENTS.md` / `packages/shared/AGENTS.md`。
- Spawn Gate: Bの実行分割と契約調査を別担当に委譲した。Cのfront/server実装とcontract/implementation監査の必須spawnは、後続C開始時に実行する条件として計画へ残す。今回のB委譲をC Kickoff・C監査完了と扱わない。
- success criteria: 旧Readyを新規範に混ぜず、実装担当が仕様を再解釈せず着手できるpacket、互換性と検証のゲート、UI sourceとの対応が具体化される。
- current request ceiling / terminal phase: Phase B / planning-only。
- allowed outputs now / allowed side effects: 新規task、契約調査と本証拠資料、read-only GitHub参照、独立試作の閲覧・操作、現コードのベースライン検証。buildは既存のignored出力のみ。
- forbidden outputs now: C Kickoff、製品実装・既存規範/旧taskの更新、commit、GitHub更新、PR更新/close/merge、deploy、旧コードの削除/revert。
- stop condition: B資料の整合・参照・差分・保全を確認して停止。
- next unlock condition: ユーザーによるC開始の明示指示。今回のREADYやBlocker解消は開始許可を代替しない。
- sticky constraint: ユーザーの追指示により委譲先は `gpt-6.1-sol`。モデル世代を再利用判断の根拠にしない。

## Phase Bのdelegation execution record

親は参照確認・現コード検証と本資料を所有し、委譲中のtask/契約資料は書き換えない。

| role / agent id | spawned | ownership scope | objective / status |
| --- | --- | --- | --- |
| execution-coordinator `/root/phase_b_plan_61` | yes | `tasks/issue-188-host-event-redesign.md` のみ | bounded計画・依存順・検証・将来packet作成。`gpt-6.1-sol`、`COMPLETE` / B readiness `READY` |
| contract-auditor `/root/contract_review_61` | yes | `phase-b-contract-review.md` のみ | 旧コード/契約/互換・再利用のB調査。`gpt-6.1-sol`、`COMPLETE`。C実装監査ではない |

最初のdefault起動はrepoの `gpt-5.6` が実行環境で未対応だったため失敗。`gpt-5.6-sol` で起動した旧担当 `/root/phase_b_plan` と `/root/contract_review` は、ユーザーのモデル指定後に停止し、write ownershipを上表へ再割当した。config/agent定義の変更なし。旧担当の完了を新Bの証拠に使用しない。

## GitHub / Gitのread-back

GitHub connectorでIssueとPRをread-only取得。既存Phase Aのreference JSONは上書きしない。

| 参照 | 今回の確認 |
| --- | --- |
| [Issue #188](https://github.com/tts1374/infinitas_arena/issues/188) | Host進行型の合同プレー／大会モード。旧Readyを含む仕様・過去B/C記録が残る。合意済み原稿を再設計正本として優先 |
| [PR #189](https://github.com/tts1374/infinitas_arena/pull/189) | OPEN / merged=false、base=`v1`、base SHA `0a44dfc399591003e0bd6481f6d67cc3c2930806`、head SHA `90856a42d9e199b49d97966e1dd620e6b626b5dd`。87ファイル、+8425/-112、updated_at `2026-09-14T08:21:00Z` |
| ローカル | branch=`codex/issue-188-host-event-mode`、HEADは上記PR headと一致。着手時のtracked差分なし。未追跡 `docs/ux/` と `target-e2e/` が存在 |

既存PR全体を新仕様準拠として採用しない。PR本文の過去PASSと今回のベースラインPASSも区別する。PRは背景参照なのでchatへのPR attachmentやPR更新は行わない。後続作業のベースは `v1`。現在のブランチ切替・fetch・checkout・cherry-pickは行っていない。

## 独立試作の実閲覧・操作

- 原本: `C:/Users/tts13/.codex/visualizations/2026/10/04/01a105aa-dfe2-7d82-a3ae-e34f7aeb6247/event-host-led-prototype.html`。
- preview: 同ディレクトリ `event-host-led-preview.html`、`http://127.0.0.1:18988/event-host-led-preview.html`。稼働を再確認しCodex in-app browserで閲覧。原本/previewファイルは編集しない。
- 視覚source: `prototype-review.md` の通常対戦との対応表と上記最終試作。旧 `event-flow` / `event-arena` のReady版は採用しない。
- screenshotとアクセシビリティ状態を読み、下表の製品画面内のボタンとレビュー用条件を実操作した。レビュー条件や提出再現ボタンは製品機能として実装する対象ではない。

| 実操作・観測 | 計画への反映 |
| --- | --- |
| 兼任Host・合同20人/次曲待ち2人。自分先頭、対象18人、Readyなしの下部Host開始→プレー0/18未提出 | 対象人数と在室人数を別に表示。準備条件/確認ダイアログを持ち込まず、参加資格から開始 |
| 大会15人/開始前参加者切断。枠を保持してHost開始→接続中提出の再現で14/15、未提出1人、まだ欠場でなくスコア未公開 | DISCONNECTEDを対象から除かない。未提出のまま待てる。接続と提出状態を別に表現 |
| 右側の開催管理→「進行中の第1曲を締め切る」→「未提出の1人」「締切後受付不可」の確認→実行 | 締切は補助操作。人数確認とround contextの再検証をpacketへ。個人指定の欠場操作は追加しない |
| 締切後のPLAYER03は欠場/EX SCORE=0/0pt。固定N=15、公開結果、上位3人＋自分カード、下部「次の曲を選ぶ」 | 欠場値を実測と区別。N・席・次曲対象を維持。結果と未確定画面を分ける |
| 次曲選曲→右ROUND1 AA→前曲結果→この曲の管理→無効化確認→キャンセル | 次曲開始前の前曲閲覧/無効化経路を保持。確認には対象曲名/全員の集計除外/履歴保持を示す |
| 通常Top→サイドバー合同・大会→作成/参加2入口→参加の専用フォーム | Top通常対戦を保持。ID＋参加コード入力の2項目。画面遷移と退出・同時参加禁止を別責務で検証 |
| desktop 1280pxで14/15人提出画面を目視 | 中央の曲ヘッダー、4列カードの独立スクロール、一覧外の下部案内、右の履歴/条件/補助管理を反映 |
| 390px・参加者開始待ちを目視、下までスクロール | 自分先頭、2列カード、一覧外の待機、開催情報が下段へ積まれる。製品画面内のReady/Host操作なし。上部の再現操作はレビュー専用 |

操作中、例外状態で提出再現ボタン名が変わるため旧名の照会が一度失敗した。新しい状態を読み、「接続中・プレーした人の提出を再現」で継続確認済み。モデル指定の追指示で初期タブがsessionから外れたため同じブラウザで新しい確認タブを開いて継続した。これらを製品不具合として扱わない。確認後の一時viewportを解除し、確認用タブを閉じた。

今回のスクリーンショットはツールの観測記録。画像ファイルとして新規保存した証拠とは扱わない。既存の保存画像は同会話ディレクトリ `evidence-host-led/host-led-player.png`、`host-led-mobile-full.png`、`evidence-host-exceptions/host-exceptions-unsubmitted.png`、`host-exceptions-absence.png`、`host-exceptions-mobile-rest.png`。これらはPhase A取得分と明示して参照する。

限界: 今回は計画の参照確認であり、Phase Aの全232状態を再検証したとは主張しない。実通信、実連携ファイル、実時計の5分期限、多端末保存、実Tauriフルスクリーン、全OS/DPI/読み上げはこの独立試作で証明できない。後続Cの必須検証へ送る。

## 現コードのベースライン再検証

変更前HEADに対して2026-10-04 JSTに親が実行。旧仕様の再利用候補を支える限定的証拠であり、新仕様準拠・hosted CI green・本番安全性を保証しない。

| 実行 | 結果 / 面 |
| --- | --- |
| `npm --workspace @infinitas/client run test` | PASS 121/121。現行標準entrypoint。旧Readyの表示assertionも含む |
| `npm run test:worker` | PASS 156/156。FSM/controller/normal Room/lobby/routes等 |
| `npx tsx --test scripts/host-event-e2e.test.mjs` | PASS 4/4。CASUAL/TOURNAMENT各2曲、capacity、capability。メモリharnessで旧SET_READY helperを使う。実端末E2Eではない |
| `npm run typecheck` | PASS。root tsconfigはclient/shared/workerの全tsとclient tsxを含む |
| `npm run lint` | PASS（max-warnings 0） |
| `npm run build:client` | PASS。既存ignored dist出力のみ。Browserslistデータの古さのnoticeあり、依存/lockfileは更新しない |

validation parityの参照: root `package.json`、client/worker `package.json`、root/client `tsconfig.json`、`.github/workflows/ci.yml` と `validate-reusable.yml`。client workspace型検査は `*.test.ts` を除外するため、後続もroot型検査が必要。client testは列挙式のため新規testを追加するとentrypoint登録が必要。

未実行: client stats、agent/design checker、Cargo、Wrangler dry-run、実Tauri E2E、hosted CI。今回これらの対象を変更していない、または実環境検証を必要とするため、新B資料の検証と分ける。Cでは計画のV群・CI quick/full同等以上の面を必須とし、未実行の残リスクを解消する。狭い今回のPASSをCI full PASSとして扱わない。

## B成果物の検証・保全

製品tracked差分なし、HEAD/branch不変、stageなし、commit/GitHub write/deployなしを終了時にread-backする。既存資料と未追跡 `target-e2e/` は保持し、新規3資料だけを成果物とする。独立試作も保存原本を保持する。
新規MarkdownはUTF-8 no BOM / LF、replacement文字なし、リンク・packet・scope/stop boundaryの整合を検査する。旧資料に混在する改行は今回整形しない。

## Phase B完了記録

- B planning status: `READY`。Task status: `COMPLETE`（Phase Bのみ）。両担当の返却を受領し、親が正本・契約調査・計画の整合をレビューした。
- 作成資料: `tasks/issue-188-host-event-redesign.md`、`phase-b-contract-review.md`、本資料。契約から規範→shared→server/client→UI→統合→独立監査のownershipと依存を具体化した。
- 再利用判断は分離構造・受付/配点/期限・同期のコードとベースライン検証に基づく。開始資格・Ready表示・専用ページと確認操作は新仕様へ修正する。全面書き直しや旧コードのrevertは計画しない。
- 技術計画はprotocol2 / snapshot2 / DO2 / history2、history1の読取と原本保持。DO1の自動移行は採らず、旧runtimeで終了・回収・既存1800秒retention満了/cleanupと復元可能旧record/接続の不存在を確認してから公開する。rollbackも新recordの保持期間を守る。稼働状態の未調査は公開前の停止ゲートとして明示し、Cのコード作成と分けた。
- 親レビューの指摘はすべて計画へ反映: active旧開催ゼロだけではterminal結果回収を失うため公開/rollbackゲートを強化。shared単独のroot typecheckを強制するとconsumer未改修と依存が循環するため、限定shape検証と統合後の全consumer型検査を分けた。baseline build/integration記録を同期し、通常回帰の全必須経路とsource4名称を具体化した。
- CR-01〜06はCの必須修正/検証へ明示帰属、CR-07は既存sourceの維持回帰へ帰属。新仕様の実装済み/検証済みとは宣言しない。Bの未処理Blocker/Must fix、仕様変更の人間相談事項はなし。
- 最終書式検査: 新規3資料はstrict UTF-8、no BOM、LF、replacement文字と行末空白なし。新旧資料の参照とceiling/停止条件を確認した。独立試作原本SHA256: `D6B36B139760A9D21F1AD9CC60C41AD73336B168CD0A37FBE9105E148CC210AF`。
- 最終Git read-back: tracked/staged差分なし、`git diff --check`成功、HEAD=`90856a42d9e199b49d97966e1dd620e6b626b5dd`、branch=`codex/issue-188-host-event-mode`で着手時と同じ。未追跡 `docs/ux/` / `target-e2e/` は保持し、新規taskが未追跡で追加された。GitHubは取得のみ。
- C Kickoff: 未実施。Implementation authorization: `NO`。製品実装、commit、GitHub/PR更新・close・merge、deploy、削除/revertを開始せず、Bで停止する。
