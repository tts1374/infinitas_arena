# #192 Phase A 補正後の独立UX再レビュー

2026-10-18 JST。task label: `UX192-rereview`。

**verdict: pass-with-followups / 状態: COMPLETE（Phase A補正の再レビューのみ）**。

旧UX-01〜05は、本稿で示す静的証拠と親担当のブラウザー実操作証拠の範囲で解消。未処理のBlocker / Must fixは検出していない。製品実装の完了、Phase A全体の合意、Phase B/Cへの移行を承認する判定ではない。

## 1. 監査スコープ

- 対象: `issue-192-control-window-v3.html`、`issue-192-v3-surface.html`、`issue-192-v3-behavior.js`、`issue-192-v3-presentation.js`、`issue-192-operation-matrix.md`、`issue-192-phase-a-draft.md`、旧`issue-192-review-ux.md`。
- 視覚正本候補: `issue-192-v3-wait-concept.png` / `issue-192-v3-submit-concept.png`。比較用旧描画: `issue-192-v3-wait-render.png` / `issue-192-v3-submit-render.png`。補正後描画: `issue-192-corrected-preparation.png` / `issue-192-corrected-confirmation.png` / `issue-192-corrected-status.png` / `issue-192-corrected-input-route.png` / `issue-192-corrected-mobile.png` / `issue-192-corrected-mobile-footer.png` / `issue-192-corrected-default.png`。本担当が全11画像を`view_image`で目視した。
- 製品参照の境界: 指定worktree `C:/Users/tts13/.codex/worktrees/issue-188-phase-c-host-led/infinitas_arena`、指定HEAD `0dac1b02d3b23d9449d1e63d7ca3f822f98f9e50`。製品の再監査や変更は行わず、現行操作表と旧監査の根拠を起点とする。`apps/client/AGENTS.md`を追加適用。
- root `AGENTS.md` / `WORKFLOW.md` / `QUALITY.md`、`quality-check-matrix`および`windows-utf8-safe-write`を適用。
- 本担当の実施: 静的操作監査、画像目視、組立結果一致検査、JavaScript構文検査。この報告書だけを新規作成。製品・試作・他報告書・Git/GitHub・共有ブラウザーは操作していない。sub-agentの追加spawnなし。
- ブラウザー実行者は親担当。本稿の実操作結果は親から受領した検証報告として区別し、本担当の独立再実行とは扱わない。

以下、相対パスは本稿と同じディレクトリを指す。

## 2. 触れた振る舞い面

開始前・auto/hold・提出後・欠場・次曲待ちの値編集、編集値と確定済み現在曲の分離、現在曲へauto適用する際の予告・確認・取消、A/Bの入力元説明、本人Aの一覧状態、終了と切断が重なった際の誘導を確認した。

加えて、主催者進行と選択対象の分離、Aのテスト入力禁止、曲の対象集合と提出/欠場の表示、設定編集時の予約取消が補正で失われていないかを確認した。主契約監査は別担当の責務とする。

## 3. Findings

新規Blocker / Must fix / Should fixは検出していない。以下は完了阻害ではないNote。

### UX-RN-01 — Note: 旧render画像は補正後UIの証拠として使えない

旧`v3-*render.png`はA行が「普段の連携ソフト」で、入力元入口や提出・欠場確定表現も補正前。現行ソースと最新`corrected-*`画像では補正されている。旧画像は配置を比較する履歴とし、補正の採否判断には最新画像と操作証拠を使う。親担当も旧renderを履歴として保持すると明示している。

### UX-RN-02 — Note: 補正の合格は実入力・実受付の合格を意味しない

`behavior.js:80`の受付は表示例で、`surface.html:50`にも通信・ファイルへの書込みを行わないと明示される。入力元説明とAC-04は検証経路の区別を改善しているが、実sourceの起動可否・parser・watcher・実受付は未接続。後工程で実現性と製品検証を別途実施する。

### UX-RN-03 — Note: 手動提出待ちで設定を開くと同じ値入力が2組になる

`surface.html:43/:44`は即時提出フォームと設定内にEX/MISSを配置する。手動のN3/E3で設定を開くと両方が見え、`behavior.js:118`の共通state更新と`:66`、`presentation.js:51`の再描画により同期する。異なる結果が送られる証拠はなく、次の提出で使う値・編集と送信が別である説明もあるため、Should fixには格上げしない。ただし縦方向の密度と、現在用/未来用の別値という誤読の余地は残る。今後のユーザーレビューでは手動提出時だけ入力を一箇所へまとめる案を比較する。auto/hold・提出後・次曲待ちの入力到達性を再び失う修正は避ける。

## 4. 旧findings disposition ledger

| finding / severity | disposition | evidence | remaining risk |
| --- | --- | --- | --- |
| UX-01 / Must fix: 任意値を事前設定できない | 解消。送信設定内に値編集を追加し、auto/hold・提出済み・次曲待ちでも到達可能。確定済み値は別オブジェクトで保持 | `surface.html:44`、`presentation.js:49`〜`:54`、`behavior.js:80/:102/:112/:118`。操作表:126/148、AC-07。親実操作: E2でB1900/10とC1900/10を事前設定、Bauto・Dholdで開始、B1900/10受付。B提出後2100/7へ編集しても現在曲1900/10保持。次曲でB2100/7受付。`corrected-preparation.png`で入力到達を目視 | 次曲待ち/欠場時の編集は静的条件で確認。実sourceへ値を渡す処理は未実装 |
| UX-02 / Must fix: 入力経路説明へ到達できない | 解消。常設の開閉入口を復帰し、A・画面あり・画面なしの説明を分岐 | `surface.html:47`、`behavior.js:69`。操作表:16/18/169、AC-04。親実操作: 画面なしで「アプリの表示・連携ソフトの監視は別」、画面ありでファイル方式/local WebSocket方式の説明を確認。70表示で入力元入口常時あり。`corrected-confirmation.png` / `corrected-status.png` / `corrected-input-route.png`で開いた説明を目視 | source別の実起動・対応拒否は将来検証 |
| UX-03 / Must fix: auto適用で現在曲を予告なく送信 | 解消。現在曲に送る条件でボタンを変更し、対象/曲/EX/MISS/即時送信/取消効果を確認。取消はpolicyと提出状態を変えない | `presentation.js:55`、`behavior.js:85`〜`:90/:103`。操作表:129、AC-07。親実操作: E3曲2のCでauto選択→確認→取消後も手動・未提出、選択案auto保持→再確認・実行でCのみ提出済み・毎曲自動。`corrected-confirmation.png`を目視 | 実送信の受付待ち・拒否・重複・競合は未接続。将来、確認内容と送信payloadを同じ確定値へ結び付ける必要あり |
| UX-04 / Should fix: Aの一覧状態が入力元説明へ置換される | 解消。Aにも共通shortStatusと主催者表示を適用。入力元は詳細へ分離 | `presentation.js:14`〜`:17`、操作表:152。親実操作: A主催者/切断、B選択中もA行「主催者 · 切断中」。`corrected-preparation.png`でA「接続中」を目視 | 切断と提出済み等が重なると一覧は優先状態1個を表示する。全情報の同時表示を証明するものではない |
| UX-05 / Should fix: 終了後に再接続へ誤誘導 | 解消。終了案内を切断より優先。保存・新規検証へ誘導 | `presentation.js:38`〜`:41`、`behavior.js:20/:29`、操作表:168。親実操作: E5切断Bに「終了しました。記録を保存するか、最初からやり直せます」、再接続無効 | N5の存続部屋への接続操作は操作表どおり別扱い。保存・新規起動の実処理は未接続 |

## 5. Regression risks

- 編集用`score/miss`と`acceptedResult`を再び同じ参照へ統合すると、次曲値の編集が現在曲の確定表示へ漏れる。現行では`acceptedResult={score,miss,round}`の値コピーと送信ガードで防いでいる。
- autoの設定反映と当該曲送信を分離せず実装する場合、確認取消・対象変更・曲変更・接続変更を跨いだ誤送信に注意が必要。試作の`epoch/target`確認と入力変更時の確認取消だけで実通信の競合耐性が完成したとは扱わない。
- 値編集・予約取消・次曲値の保存は同じ導線に存在する。遅延送信が古い値や別曲へ届かないことを製品側で検証する必要がある。
- 今回の補正で詳細を開いた画面は縦に延びる。2窓を実際に並べた高さ、20人表示、キーボードでの移動に使いやすさの残リスクがある。

## 6. Validation gaps

- 本担当は共有ブラウザーを操作していない。親実操作の内容と画像を受領して静的根拠と照合した。
- 親の70表示は5モード×7場面×A/Bを対象とし、Aテスト入力非表示・入力元入口・B設定のN0〜4/E0〜4表示・有効primary最大1を確認したもの。全参加者状態・全値・全操作遷移の直積検証ではない。
- UX-01の操作証拠は合同プレーでの事前値→auto受付→次曲値の連続フローが中心。通常モード・大会・次曲待ち/欠場の値編集の全組合せは、共通コードの静的確認を補助としている。
- 親の追加実操作で画面あり入力元、遅延予約中の値変更による予約取消、1024/736/320pxでの横はみ出し0、1024×700で20人目の選択・設定到達・追加上限ガードを確認。負数・空欄の即時auto適用は拒否し、policy/未提出を維持。
- `corrected-mobile.png`はMISS欄より下の操作が写っていないため、親は320pxで送り方適用→入力元開示→記録保存までの実操作到達を追加確認。`corrected-mobile-footer.png`で保存操作後の記録を本担当が目視した。キーボードのみの移動、実際の2窓配置の使いやすさは未確認。
- 空欄をNaNのままnumber inputへ再描画した際のwarningは、親が`behavior.js:66`と`presentation.js:48/:51`で有限値/空文字（previewは「未入力」）へ限定して補正。本担当が最終ソースを確認。親の再実操作ではscore/miss空欄の即時auto適用を拒否し、手動/未提出・空欄を維持。1900へ修正後は確認へ進む。補正後操作中の新設console listenerでwarning/errorは0件。過去の累積warning2件が消えたとは主張しない。
- 保存、起動・停止の所有プロセス制御、通信返答待ち/拒否/復旧、ファイル安全性、実source検証はPhase Aの独立試作では未接続。

## 7. Validation surface parity

- `node --check issue-192-v3-behavior.js`、`node --check issue-192-v3-presentation.js`は本担当が実行し、両方exit 0。
- 分離ソースから組み立てる規則と同じ文字列を読み取りだけで構成し、`issue-192-control-window-v3.html`と完全一致を確認。挿入markerは1箇所。静的監査対象と親ブラウザー用HTMLの内容ずれはない。
- 空欄再描画の最終補正後にも、組立結果完全一致と両JavaScriptの`node --check`を再確認し、exit 0。新規報告書はUTF-8 BOMなし / LFをread-backで確認。
- 独立HTML/JSは製品repoのCI検証面に含まれない。製品CIのgreenを今回のUI操作合格の根拠にせず、今回の構文検査・画像・ブラウザー表示例を製品build/typecheck/lint/test/E2Eの代替にもしていない。
- 製品差分を持たないPhase A補正レビューのため、製品build/typecheck/lint、Worker、Rust監視ソース、FSM/Protocol、実E2Eはnot run。skip reasonは製品実装と接続が範囲外であること。将来の実装完了時は`QUALITY.md`の影響領域別検証を別途満たす必要がある。

## 8. Boundary violations

本担当のPhase境界・write ownership違反なし。製品実装、Phase B/C、Git/GitHub操作は行っていない。試作の状態ジャンプ・受付例を製品の正規FSMやauthoritative受付と取り違えていない。契約整合の主判定は別担当に委ねる。

## 9. UI design source parity

- concept2枚と旧render2枚で、上部進行・左一覧・右対象・下部記録という配置と段階的開示の主方針を確認。
- 補正後preparationでは送信設定内の値欄、値の適用範囲、入力元入口、Aの短い状態を追加。確認画像では即時送信の効果をモーダルへ表示。status画像では「提出・欠場確定」を採用。これらは旧指摘と操作表に対応する意図的な差分で、視覚参照への機械的な不一致とは判定しない。
- 詳細を開いた補正後の高さは旧conceptより大きい。画像内で文字・入力・確認操作の欠けは見られないが、低高さ/20人/キーボードの使いやすさをこの画像だけでpassとはしない。
- 旧renderは履歴、最新corrected画像は補正の証拠として使い分ける。正本候補全体のユーザー合意は未成立。

## 10. Note disposition ledger

| finding | disposition | evidence | remaining risk |
| --- | --- | --- | --- |
| UX-RN-01 / Note | 旧renderを履歴として保持、補正評価は最新corrected画像へ切替 | 11画像の本担当目視、親の履歴保持宣言 | 将来のhandoffで旧画像だけ参照すると補正を見落とすため、最新資料へのリンクを維持 |
| UX-RN-02 / Note | Phase Aの未接続境界として明示し、実現性/実入力検証を後工程へ残す | `surface.html:50`、入力元説明、操作表:169/170、AC-04/07 | 製品接続の成立と検証品質は未判定 |
| UX-RN-03 / Note | 次のユーザーレビューで密度と値の意味を確認する改善候補。現時点で機能修正必須とは判定しない | `surface.html:43/:44`、共通state更新と双方の再描画、`corrected-confirmation.png` | 2組の入力による視線移動、現在用/次曲用が独立値だという誤読 |

## 11. 推奨追加検証

1. 次曲待ち/欠場・auto/holdで値を編集し、当該曲へ提出できず次曲だけへ反映されること。値0/上限/空欄/小数/負数も含める。
2. 10秒予約中に値/送り方/曲/対象/接続を変え、古い予約・確認が残らないこと。
3. 画面あり/なし/Aの入力元説明と、対応できないsourceの起動拒否の表示。実装段階では実watcher/parserと直接WSの別々の証拠。
4. 実際に2窓を並べる高さ、4人/20人、メニュー・設定・入力元を開いた状態、キーボードのみで対象・値・確認へ到達できること。

## 12. Verdict / 状態

**pass-with-followups / COMPLETE**。旧UX-01〜05は補正の処理と根拠を追跡でき、今回のPhase A補正について未処理の重大findingはない。後続検証と未接続境界は上記のとおり残す。製品実装・Phase B/Cの開始判断は今回の再レビューに含めない。
