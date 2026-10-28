# #192 Phase A 補正後・独立契約再レビュー

2026-10-18 JST。task label: `CR192-rereview`。契約監査 verdict: **pass-with-followups**。監査状態: **COMPLETE**。

旧 CR192-01 / CR192-02 は、設計資料・独立試作に求めた補正として解消を確認した。新たな Blocker / Must fix / Should fix は検出していない。製品実装・実入力検証の完了や、Phase A 全体の合意を認定するものではない。

## 1. 監査スコープと境界

- 対象: `issue-192-operation-matrix.md`、`issue-192-phase-a-draft.md`、`issue-192-control-window-v3.html`、`issue-192-v3-behavior.js`、`issue-192-v3-presentation.js`。旧 `issue-192-review-contract.md` / `issue-192-review-summary.md` を finding の入力として参照した。
- 製品正本: `C:/Users/tts13/.codex/worktrees/issue-188-phase-c-host-led/infinitas_arena`、branch `codex/issue-188-phase-c-host-led`、HEAD `0dac1b02d3b23d9449d1e63d7ca3f822f98f9e50`。worktree の `.git` と参照先の HEAD / branch ref をファイル読取りで確認し、指定値との一致を確認した。v1 へ置換していない。
- Stage / ceiling: Phase A の補正後再監査のみ。現在の資料変更は Standard の設計資料範囲。将来の source / 接続 / cross-layer 実装は High-Risk 候補であり、B の Plan Mode 判定・契約監査対象となる。
- write ownership / allowed side effects: 本報告書の新規作成のみ。他担当と並行作業中であり、親・UX 担当の成果物は編集していない。
- 製品・試作の変更、Git/GitHub コマンド、実通信、共有ブラウザー操作、Phase B/C、全 FSM の試作実装は実施していない。追加委譲なし。親からの独立契約監査 packet を自身で完結した。

## 2. 触れた契約面と規範

root `AGENTS.md` / `WORKFLOW.md` / `QUALITY.md` と、指定製品 worktree の client / worker / shared ローカル `AGENTS.md` を参照した。`fsm-protocol-guard` の risk matrix / invariants を適用した。INV-02/03/04/05/06/08/09 は将来実装での維持対象であり、今回の補正で製品契約を変更したとは扱わない。

以下の製品パスは、指定 #188 worktree を基準とする。

| 契約面 | 規範・実装根拠 | 再レビュー結果 |
| --- | --- | --- |
| 固定名簿・当該曲対象・欠場 | `docs/design/01_fsm.md:281–287`、`docs/design/03_data_model.md:464–468`、`apps/worker/src/durable/event-room-state.ts:784–805` / `:868–883`、`apps/client/src/pages/EventRoomPage.tsx:44` / `:69` | 固定 N、playing 集合、在室数を分離し、提出と欠場を混同しない補正を確認 |
| Host・切断・復帰・Ready | `docs/design/01_fsm.md:278–287` / `:298–303`、`docs/design/02_ws_protocol.md:285–299`、`event-room-state.ts:815–845` / `:1188–1195`、`apps/client/src/services/event-action-policy.ts` | 開催 Ready を追加せず、Host 切断中も有効 SUBMIT を許可し、進行・結果公開は保留する方針を維持 |
| source 入力 | `docs/design/06_source_io_spec.md` §0 / §1 / §2 / §3.7 / §3.8 / §4 / §8、`docs/design/07_constants.md:135–139`、`docs/design/10_regression_guard_addendum.md:24–25` | 主要 3 source の file / local WS を分離。既存 parser / expected key / dedupe / ACK を迂回する仕様を追加していない |
| 通常対戦と表示フェーズ | 操作表 §2/3、`docs/design/01_fsm.md` の通常状態・開始・曲別結果規範、`apps/worker/src/durable/room-state.ts` の `submitResult` / `forceAdvance` | N2 のツール送信待機を server の +55 秒受付拒否と解釈せず、N4 を独立 FSM にしない記述を維持 |

## 3. Findings

### CR192-R01 — Note: source 対応は初版案として明確化されたが、既存資産での実現性は未検証

操作表 `:169–170` は `inf-notebook` / `reflux` を隔離ファイル、`daken_counter_v3` を隔離 local WS として区別し、対応不能構成は起動拒否、B で実現性確認、対応範囲変更時は A へ戻すと明記した。設計原稿 `:75` / AC-04、behavior `:69`、HTML `:139` の説明もこの区別に揃っている。

これは旧 CR192-02 の不足を補う Phase A の範囲定義であり、fixture 作成器や local WS 配信元が実装済みという意味ではない。実現性未確認だけを理由に、現在の補正を製品 Must fix としない。

legacy は「既存 legacy 有効条件に従う」とされ、明示的な有効化提案はない。規範 `10_regression_guard_addendum.md:24–25` に加え、現行の通常 client は `apps/client/src/stores/room-store.ts:1052–1058`、worker は `apps/worker/src/durable/room-object.ts:1773` 以降で `SOURCE_DEPRECATED` を拒否する。enum、parser、script の選択肢が存在するだけで、その経路を有効扱いしてはならない。現案はこの既存拒否を迂回するものとは読まない。将来の起動可否・検証記録へ拒否経路を引き継ぐ。

### CR192-R02 — Note: 固定集合の表示サンプルは製品 FSM の代替ではない

behavior `:13–14` / `:99–102` と presentation `:10–11` は、当該曲 ID 集合と大会名簿を用い、「提出・欠場確定」の分子・分母を求める。開始済み開催での退出は集合から除外せず、未提出だけ欠場化する（behavior `:110`）。受理済み提出のある退出者は submitted を維持する。大会の次曲待ち/不在を固定集合から除かない補正も確認した（`:121`）。HTML の埋込み側にも同じ補正がある（`:83–84` / `:180` / `:191` / `:205–206`）。

操作表 `:166–167` は製品では snapshot の `current_playing_player_ids` と round status が正本であること、試作配列を移植しないこと、NOT_PRESENT / LEFT 等の詳細理由・再入室・期限の全経路は未再現であることを明記している。残る試作の簡略化はこの限界として扱い、全経路を同試作へ追加実装する要求はしない。

## 4. Findings disposition ledger

| finding | disposition | evidence | remaining risk |
| --- | --- | --- | --- |
| CR192-01 — Should fix: 欠場を提出済みと呼び、当該曲集合を縮める | **resolved（Phase A 補正）**。人数ラベル・算出元・試作限界を明記し、埋込み/分離実装へ反映 | 操作表 `:166–167`、behavior `:13–14` / `:110` / `:121`、presentation `:10–11`、HTML `:83–84` / `:205–206`。製品 `event-room-state.ts:797–804` / `:877–879` と `EventRoomPage.tsx:44` / `:69` に整合 | 将来の製品接続後に authoritative snapshot と集計の一致を実証する必要がある。固定 N と画面の在室人数は引き続き別物 |
| CR192-02 — Should fix: 画面ありをファイル入力へ一律化 | **resolved（Phase A 補正）**。主要 3 source、file/local WS、対応不能起動拒否、B での実現性確認を明記 | 操作表 `:18` / `:169–170`、原稿 `:75` / AC-04、behavior `:69`、HTML `:139`。`06_source_io_spec.md` §0/§2/§3.7/§3.8/§8 と整合 | 入力方式の実現性・隔離・source ごとの自動提出/表示の実証は未完。非対応時に直接 WS へ黙って代替しない |
| CR192-03 — Note: 保守的な UI 制限と試作の限界 | **accepted as limitation / maintained** | 操作表 N-C/N-F/E5/E6、§9、原稿 `:10` / `:15–17` | server 全 API の再現、実通信、保存、ACK、期限・復元の保証にはならない |
| CR192-R01 — Note: source 実現性・legacy 条件 | **follow-up at B/C（現資料の明示境界）** | 操作表 `:169–170`、原稿 `:131`、現行通常 client/worker の legacy 拒否 | B/C は今回未許可。既存拒否を維持した対応可否検証が必要 |
| CR192-R02 — Note: 固定集合サンプルの限界 | **accepted as limitation** | 操作表 `:167`、原稿 AC-06/AC-11 | 再入室・期限・欠場理由・状態の全組合せを未検証 |

UX-01〜05 の disposition は別の独立 UX 再レビューが所有する。本報告でそれらの解消を代理認定しない。

## 5. Compatibility classification

- **additive**: 意図した開発用操作窓の追加。既存の通常/開催 FSM、Host 権限、Ready、source 経路を維持する提案である。
- **breaking**: 今回確認できた製品変更はない。製品ファイル、shared enum、WS type/payload、snapshot/settings、固定 N に変更はない。
- **unclear**: 将来の実 bridge、隔離入力供給方式、既存資産による全 source 対応の実現性。これは明記された未確定事項であり、既存製品に対する破壊的変更を容認する分類ではない。
- one-sided migration は検出していない。将来、開発窓の都合で製品 parser / FSM / source semantics / legacy 方針を変える必要が生じた場合は、現案の境界を超えるため A/B へ戻す。

## 6. Missing updates

- 旧 CR192-01/02 に対応する操作表・原稿・分離 JS・v3 HTML の必要補正は確認できた。製品 docs/shared/client/worker の更新漏れは検出していない。製品契約を変更しない今回の補正のために規範仕様を書き換える必要はない。
- `issue-192-review-contract.md` と `issue-192-review-summary.md` は補正前の正式な履歴として残っており、まだ旧 finding を未処理と記す。親の統合時は、本再レビューと UX 再レビューの disposition を引用して current verdict / readiness を示す必要がある。過去の失敗証拠を修正済みという理由で消す必要はない。

## 7. Validation と gaps

実施: 指定ファイルの静的読取り、旧 finding と補正箇所の追跡、指定製品の規範/worker/client/shared の照合、主要 3 source と legacy 条件の照合、固定 N / playing 集合 / 提出・欠場人数、Host / 切断 / 復帰 / Ready 条件の照合。追加した報告書は UTF-8、LF で作成した。

Host 切断時の試作は進行操作を止め、有効提出だけを続け、全提出でも結果表示へ進まない（behavior `:31–42` / `:78–80`）。再接続時に結果確定する表示（`:109`）は製品 `maybeFinalizeCurrentRound` と整合する。開催 Ready を追加しない（`:47`）、切断者を対象から除かない（`:14`）、一時切断と退出を分ける（`:108–110`）方針も維持している。

未実施: ブラウザー操作・画像比較、実 WS、Tauri bridge、source 実入出力、server ACK/ERROR、保存・停止・実時計・期限・世代/round 切替・再入室。親/別担当の実操作を本監査の独立検証証拠として扱っていない。試作の accepted 表示は実受理証拠ではない。

製品差分がなく、今回の自分の write は監査 Markdown のみのため、製品 build/typecheck/lint/tests は実施していない。将来 C で該当領域を触る場合、QUALITY の FSM/Protocol・Source I/O・シナリオ検証を省略できない。主要 3 source の正規経路、legacy 拒否、有効な初回観測/expected key/dedupe、提出済み/欠場/退出/次曲待ちと Host 切断の組合せ、通常/開催の期限・復帰、保存/証拠保全をその実装範囲に応じて確認する。

## 8. Verdict / 状態

- verdict: **pass-with-followups**。旧 Should fix 2 件は Phase A 補正として resolved。新規 Blocker / Must fix / Should fix は 0 件。Note 2 件は明示された限界・将来検証として追跡する。
- 状態: **COMPLETE**。独立契約再レビューと本報告書の作成を完了した。
- Phase A 全体の readiness は親が UX 再レビューとユーザーの全体合意を含めて統合する。本監査は B/C 開始・実装許可を出さない。
