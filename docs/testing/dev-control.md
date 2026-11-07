# #192 開発コントロール基盤・検証記録

## 現在の受入判定（2026-11-07、ユーザーUX確認済み）

PR #208レビュー指摘 `discussion_r4501943540`（P2）対応: 操作窓の候補検索に残っていたSP/ANY固定を、reportされたsnapshotのplay_style/level_filterへ変更。レベル制限を持たない合同/大会はANYを使用する。通常3モードのSP/DP・制限あり/なしと合同/大会DPの6条件をprivate HTTP report→候補取得→相手選曲commandの配送で回帰確認。修正前は非既定の5条件で失敗し、修正後は全条件PASS。これはbroker HTTP回帰であり新しい実ゲーム/実source証拠とは扱わない。control127/client186/Worker193/integration6/stats17、root型/lint/契約/agentsとNode構文検査がPASS。

同原因の点検ではprivate brokerの候補検索以外に固定queryなし。Host B用launcherの新規作成時SP/ANYは既定値の指定であり、今回の既存Host Aルーム検索とは区別して維持。client adapterは返されたchartKeyを正規roomStore.submitPickへ渡す。WorkerのsearchCharts/submitPickとshared enumの契約を確認し、製品の検索・選曲規則、権限、WS schemaは変更していない。コード不具合と回帰試験で対応し、新たなガバナンス規則は追加しない。

ユーザーから修正後の表示について「上記問題なし」と確認を受けた。残技術検証・人間のUX判断とも **COMPLETE**。AC-01〜11は既存実証と今回の模擬入力/GUI補完で充足し、追加実プレーや画面操作の要求はない。開催中は「通常対戦」「合同・大会」を隠し、「開催へ戻る」だけを表示する4状態の導線も承認済み。

native過去エラーの原因/頻度未確定はNoteとして維持し、安全停止・固定診断・回復/保存の既存証拠と回帰結果で受入。再発時に記録を収集して別途調査する。未処理Blocker/Must fixなし。検証用runtime/割当portは停止済み。保存のprivacy拒否によるpartialと別採取GUI画像を区別した記録も保持する。

既存PR #208へコード・受入記録を反映する。merge / Issue close / deploy / release / branch・worktree・既存証拠の削除は引き続き未許可。以下は実装・検証時の履歴で、「未commit/未push」「UX判断待ち」は各記録時点の状態を示す。

## UX修正記録（2026-11-07、代表画像確認後の指摘反映）

追加の導線指示を反映し、未参加時だけ「合同・大会」を表示する。参加中は「通常対戦」「合同・大会」を隠し、「開催へ戻る」に一本化。開催画面では同ボタンを選択中（aria-current=page）とする。終了後の「合同・大会へ戻る」で参加解除→入口への遷移は既存の修正を維持。client186/root型/lint PASS。既存visual fixtureのブラウザーGUIでも、入口2つの非表示、選択状態、履歴から開催への復帰、終了後の参加解除と作成/参加入口の再表示を確認した（実Worker/sourceの再実証ではない）。補助証拠は `sidebar-check.json` / `sidebar-event-only.png`。未commit/未push。

ユーザーの「ゲームの補助ツール・個人開発であり、完全な情報は不要」という指摘を表示の判断基準にした。通常対戦と合同・大会の参加中は相互の参加導線を出さず、設定/成績からの戻りも現在の参加先へ戻す。開催中の「通常対戦へ」を削除し、終了後は「合同・大会へ戻る」に変更。接続開始時とdeep linkも既存の参加モードに従う。参加の排他・提出・配点・履歴schemaは変更していない。

「固定N」と正常時の受信範囲/完全記録を削除。これまでの曲・過去曲詳細・履歴は `.59(SPA)` 形式。履歴の「同期済み」「保存版」「最後の受信」や未対応履歴の生ID/schemaも削除し、一部しか残っていない場合だけ「一部の結果のみ」と表示する。指標はEXスコア/ミスカウントへ統一。source障害、結果読込中など利用判断に必要な案内は残す。正本の [UX原稿](../ux/issue-188-redesign/issue-188-draft.md) に今回の表示方針を反映した。

- 実装/技術検証: **COMPLETE**。client186、control120、Worker193、integration6、stats17、root typecheck/lint、契約/agents、production buildがPASS。Rust/Worker製品コードに変更なし。新しい依存/フレームワークなし。
- 最終GUI session `s20261107130004-27fe6c10`。最新未commit差分を含む実nativeアプリで2人入室を待ち、大会作成→設定→戻る→選曲/開始→隔離RefluxからA800/B500→終了→履歴詳細→開催へ戻る→合同・大会の入口を操作。A/Bとも開催参加中は通常ロビーへの入口なし。結果・履歴の譜面表記、内部情報の非表示、320px表示を確認。Aの正規SUBMIT51→ACK53/rev6、B61→ACK63/rev8。本人の実プレー・表示store直接変更なし。
- 先行GUI session `s20261107125550-d88325f3` はB入室前に1人で開始したため、2人進行の証拠にはしない。自動接続クライアントにも開催画面への誘導を補完後、上記sessionで再確認。2つのsessionとも停止complete/errors[]、停止後の別inventoryで所有runtime/割当port残存0。native保存は入力画面画像のprivacy拒否を伴うpartial、ログはread-back済み。GUI画像はPlaywright別証拠。
- 補助証拠rootは下節と同じ。最新画像は `ux-round-result.png`（曲別/譜面表記）、`ux-final.png`（総合/戻り先/内部情報なし）、`ux-final-320.png`（小幅）、`ux-history.png`（履歴の簡略表示）。`ux-start-final.json` / `ux-evidence.json` / `ux-product.patch` に操作結果、受付、停止、検証した未commitコード差分のhashを保存。画面ごとの全状態キャプチャは追加していない。
- 人間のUX判断は、前回画像への今回の指摘を反映した状態。修正後の代表画像を返し、追加の実プレーやユーザーの画面操作は求めない。記録・コードは同じworktreeに未commit/未pushで保持。merge/Issue close/deploy/releaseなし。

## 初回の代替検証結果（2026-11-07、追加実プレーなし・UX修正前）

ユーザー承認の新方針により、追加のINFINITAS実プレーと本人の手動GUI操作を残検証の前提から外した。変更前後・AC-01〜11の分類と代替根拠は [受入台帳の最新節](../../tasks/issue-192-dev-control-validation.md) に保持。既存の実プレー/3source実証を再利用し、残る大会・BPL再戦・選曲UIを自動補完した。**技術検証: COMPLETE。人間のUX判断: WAITING_FOR_HUMAN_DECISION。** PR #208はDraftのまま、merge / Issue close / deploy / release / 破壊的cleanupは未実施。製品コード、通常動作、権限・秘密保護、依存、CIは変更していない。

指定worktree `C:/Users/tts13/.codex/worktrees/issue-188-phase-c-host-led/infinitas_arena` / branch `codex/issue-192-dev-control` / HEAD `88f84ef` を継続。今回の新session以外のworktree/branch/stash/証拠を保持した。以下の補助証拠rootは `C:/Users/tts13/.codex/visualizations/2026/11/07/01a1b5f7-815a-7182-bc52-ab61dec09192/pr208/`。rawログ/native保存はworktree内の `testdata/runtime/dev-control/<session>/`。今回のharnessと画像はrepo外で、製品へテスト用の強制状態変更は追加していない。

### Host A大会（実native/parser/Worker、入力は模擬Reflux）

- session `s20261107122608-726dc3ac`、room `5fec66fc-214d-4f08-96c3-d4deda43c83d`、event `b47d0749-834e-4081-9419-294a29b22131`。Aのsource参照先を今回専用の `self-reflux-tournament` に指定し、Bは既存supplierの隔離fixtureを使用。本人の実Refluxソフト・実ゲームが生成した入力とは扱わない。Aのbroker代理コマンド拒否は維持し、作成・参加選択・開始・選曲・次曲・終了はAの通常GUIをPlaywright/CDPで操作した。
- `.59 SPA` を2曲、毎曲Readyなし。両曲ともA800/MISS10、B500/MISS10、固定名簿/N=2、曲別2pt/1pt、最終4pt/2pt、`HOST_ENDED`。Aを通常ロビー表示へ移動してから模擬ファイルを投入し、開催へ戻ると結果を表示。終了→通常対戦→reload→開催履歴で「大会・固定2人・同期済み2曲・完全」を確認した。
- round `f85c5feb-892a-4236-8c18-fd5607e83602`: A parsed37→SUBMIT38→同request accepted ACK40/rev6→SUBMITTED snapshot41。B parsed47→SUBMIT48→ACK50/rev8→snapshot51。
- round `200b603b-444d-4f89-809d-573001bfc3a4`: A parsed68→SUBMIT69→ACK71/rev12→snapshot72。B parsed74→SUBMIT75→ACK77/rev14→snapshot78。4提出すべてsource=`reflux`/unresolved=0、observed=expected、request/round/sessionの相関を確認。詳細は `tournament-correlations.json`。
- 第2曲は同じ譜面/同じ値。古いファイルのまま新round開始後2.2秒を経過しても両者PENDINGで、Aは新timestamp `20261107-213204`、Bは `20261107-213205` の新着だけを受付。第1曲A/Bは `213116`/`213118`。重複入力の無条件再投入や鮮度条件の緩和はしていない。`input-<round>.json` と `same-chart-stale-check.json` を保存。
- 停止前native bundle `bundle-1794054794019842500` はsaved/missing[]。途中のBが通常ロビーにある画像はprivacy拒否でpartial、Bを開催結果へ戻して再保存したものと区別。停止は12:33:11.404Z→12:33:21.925Z、stopped/complete/errors[]、process/port確認true。停止後の別inventoryでも所有runtime/割当port残存0。停止後controllerは証拠の再表示用として保持。

### BPLの不足区間（完走証拠の再利用＋正規Host操作による状態準備）

- session `s20261107123332-a87ce036`、room `47b0efba-fbc0-4b06-a847-e62a184c4d6f`。A/Bは実native検証クライアント、sourceは隔離Reflux設定。Aは通常GUIで入室/Ready/選曲、Bは通常GUIと既存controlを使用。3曲は正規Host `FORCE_ADVANCE` で未提出TIMEOUTとしてRESULTを構築した。時計・store・Worker保存状態の直接書換えなし。このrunではsource結果投入はせず、BPLの実プレー完走は旧 `s20261029002846-23896aa8` の証拠を再利用する。
- 旧match `e3ff1ee6-dffe-4618-98fb-67ddb8aa1551` のRESULT→controlの手動RETURN_TO_LOBBY（B raw送信sequence100、B LOBBY snapshot101）→Aの通常GUI Ready（A raw105、全員ReadyのB snapshot109）→controlの明示START_MATCH（B raw113、B PICKING snapshot115）を確認。BのReadyは既存検証clientの自動Readyであり、AのReadyと区別した。
- 新match `a7f33bda-060c-4d4f-b859-834f4eef34f8`、同じroom/generation1。両matchともroom IDとは異なり、LOBBY中のroom-ID fallbackを再戦成功へ数えていない。`bpl-rematch.json` にrawの正規送信・LOBBY/Ready/PICKINGのauthoritative snapshotを保存。新matchの追加プレーはしていない。
- 停止前native bundle `bundle-1794055214170266700` はpartial。A/Bの選曲入力フォーム画像は既存privacy規則が拒否し、ログはnative書出し/read-back済み。GUI証拠は別途Playwrightで安全な代表状態を保存し、native画像欠落を隠してsavedと呼ばない。停止は12:40:12.889Z→12:40:22.626Z、complete/errors[]。別inventoryでも所有runtime/割当port残存0。`final-evidence.json` は両sessionの停止状態・bundle read-back情報・別列挙結果を保持する。

### 選曲UI・技術確認と人間UXの分離

Browser pluginはこのsessionにないため既存Playwrightを使用。対象は実native WebView2の通常GUI（`http://tauri.localhost/index.html`、title=`INFINITAS Arena`）、local Worker。ブラウザー版/mock表示をnative検証へ数えていない。

| 技術確認 | 結果・証拠 |
| --- | --- |
| 初期focus・Tab/Shift+Tab | PASS。検索欄へ初期focus、dialogの先頭/末尾で循環。ui-check.json |
| close / Escape・focus復帰 | PASS。両方でdialogが閉じ、「曲を選ぶ」へ復帰。再表示と選択→明示確定→開始も成功 |
| 1024/736/320px × 700px | PASS。dialogの左右境界・scrollWidth/clientWidthを測定、横はみ出しなし。小幅でも検索/難易度/レベル/曲一覧/閉じるが到達可能 |
| 表示・例外 | PASS。実アプリ内容を確認、framework overlayなし。該当UI操作中console warning/error/pageerrorなし。起動前console全体の収集を意味しない。空検索の案内を取得 |
| 通常経路と証拠 | PASS。source parsed→送信→ACK/確認→snapshot、鮮度/同曲識別、履歴reload、保存/停止を照合。表示store直接編集なし |
| 新しい回帰実行 | control120/client185/native dev_control15（接続/本文timeout・診断・原子保存・read-back・停止競合・失敗再試行・partialを含む）すべてPASS。ログは補助証拠rootに保存 |
| 既存full/独立レビュー | 11/05のfull・Hosted CIと既存独立監査を再利用。3b68e18以降の製品コード変更なし（88f84efは記録のみ）。今回は製品コード/契約を変更しておらずfull全体の再実行はしていない |
| 検証harnessの補正 | 初回のselector表記、popover開放状態、native spool反映待ちの不足はharness内で補正。操作結果はraw通信と最終snapshotで再照合し、失敗した待機を製品成功の根拠にしない。製品修正なし |

人間の確認対象は情報配置・視認性・文言・操作フローの重大な問題。以下の代表キャプチャのみを提示し、全状態の網羅キャプチャや本人による操作/実プレーは要求しない。細かな見た目だけでPR完了を遅らせない。**自動技術検証の成功は、人間のUX承認を代行しない。**

| 補助証拠root内の画像 | 対象/状態 | 人間の確認目的 |
| --- | --- | --- |
| tournament-create.png | 大会作成、自分もプレーするを選択 | 作成文言・参加2択・説明が判断に十分か |
| song-search-1024.png | 選曲、desktop正常状態 | 検索/絞込/一覧/閉じる/確定の案内の配置と視認性 |
| song-search-320.png | 選曲、小幅正常状態 | 検索と絞込、一覧の高さ、追加読込と確定案内の読みやすさ |
| song-search-empty.png | 選曲、検索結果なし | 原因と次の操作が分かるか |
| tournament-final.png | 大会、2曲終了後の総合結果 | 曲別/総合、順位/点数、固定N、記録の完全性、戻る導線 |
| tournament-history-reload.png | 再読込後の開催履歴 | 記録の識別、曲数/完全の表現 |
| bpl-rematch-lobby.png / bpl-rematch-picking.png | BPL、再戦待機/新match選曲 | Readyから選曲へ進んだ状態の確認用（主なUX変更の対象外） |

### 未解明事項の扱い・次の判断

11/01 native読込エラー、11/04一過性の起動所有情報欠落は原因/頻度未確定のNoteとして保持。今回の両sessionでは再現せず、既存の固定診断・安全停止・回復/保存の実証と今回15件のnative回帰を根拠に、原因完全解明をPRの絶対条件から外す。再発時は固定code・時刻・identityで切り分け、再現性/影響が分かれば別Issue化する。現時点で新Issueの起票はしていない。

受入条件の分類3（今回の残検証で、既存証拠/模擬入力では代替不能な実機固有項目）はなし。実ゲームや外部ソフトの将来変化、OS環境差は運用上の一般的な残リスクで、追加実プレーでは解消を保証できず、今回の停止条件へ戻さない。

次は代表画像で人間のUX判断を受ける。重大な問題がなければ今回の残検証を完了とし、実プレー手順を再開しない。merge/close/deployは引き続き別許可。今回の差分は検証記録2ファイルのみで、既存worktreeに保持（未commit/未push）。

## 過去の再開入口（2026-11-05、履歴）

ユーザーの使用量残9%のため、追加の大会・BPL確認は次回へ回す。指定worktreeとbranchは変更せず、軽量フローを継続。以下が11/01記録より新しい現在地であり、過去の完走や解決済み事項へ戻らない。#192全体は未完、PR #208はDraftを維持する。merge/Issue close/deploy/release/破壊的cleanupは未許可・未実施。

今回の修正は `f208433`（native読込失敗の安全な診断）、`1a9a72c`（Host選曲UI・作成文言）、`3b68e18`（自分の参加を常時表示2択へ）としてcommit/push済み。Hostの先頭数曲しか選べないように見える問題は、APIが1ページ10譜面を返すのに旧画面がnext_cursorを読まないことが原因。通常対戦のSongSearchModalViewを再利用し、検索/難易度/レベル/バージョン/追加読込に対応した。選択→内容確認→明示確定→Host開始は維持。作成画面は「自分もプレーする」「進行だけ担当する」「順位の決め方」等にし、初期値・開催ルールは維持した。新testは標準client testへ登録済み。

### 今回完了した実機確認

- 成功session `s20261104144955-6aaad819`、Host A合同、event `26fefe36-3ea6-42bd-ad61-d9adda0efec3`。A実v3、B実client＋隔離Reflux（毎曲500/MISS10）。Aの作成→開催開始→2曲→次曲進行→終了を本人操作で確認。新しい選曲UIのcursor付き追加読込5回も実観測した。
- 第1曲ANTHEM LANDING SPAはA2474/B500で受付。第1曲ではAアプリが開催画面にあり、背景提出の成功証拠にはしていない。
- 第2曲PLEASE DON'T GO SPAはA886/B500。Aアプリの「対戦ロビーを探す」表示を14:58:05Z・14:59:41ZにPENDINGで確認し、15:00:17ZもロビーのままRESULT/SUBMITTEDを確認。実source解析sequence74→SUBMIT75→accepted ACK77/applied_revision14、request `5311acea-afba-4c92-ba2d-8e1a14840354`、round `d4034c02-1f68-4af3-98b1-90275141cf38` が一致。本人が「開催へ戻る」後の実画像 `clients/A/spool/captures/73e061bd-7a24-41ca-b187-795ad15a5e70.png` で886を目視した。
- 本人が開催終了→通常対戦へ戻る→Ctrl+R→開催履歴を実行。navigation type=reload、専用localStorage v2のCOMPLETE/2曲/HOST_ENDEDと再読込後の履歴一覧を確認。A専用profileの `event-results/26fefe36-3ea6-42bd-ad61-d9adda0efec3.v2.json` SHA256は `872e44e739e0b5087d00b25b797d7e22940c824489e36df85f5ee44c87b71d1c`。一覧画像は `clients/A/spool/captures/0663d084-e336-4d4e-b6b3-ce31263cc894.png`。この画像は一覧の2曲/完全表示であり、再読込後の詳細画面画像ではない。
- 補助観測は同sessionの `evidence/resume-20261104/` に保存。Aの背景前後・受付相関・履歴再読込・選曲request要約を記録し、元source全日入力は収集していない。補助観測はbundle外のsession記録で、raw通信証拠はcontroller-spool内にある。
- 最終bundle `bundle-1793804698748695800` はsaved/missing[]、停止前保存済み。15:04:55.440Z→15:05:07.233Zでstopped/complete/errors[]、processesVerified/portsVerified=true。native操作窓のread-backと別のprocess/port再列挙でも残存0。旧bundle/受付/画像を保持し、実IIDX・実counterは停止対象にしていない。途中bundleはBの入力画面をprivacy拒否してpartial、Bを結果画面へ戻した再保存は欠落なしとなった。

### 調査・検証と限界

- 11/01のnativeエラーはbroker読込失敗後のoffline確認エラーを共通文言へ丸めていた。同期PowerShell/CIM列挙がbrokerを一時停止させるtimeout候補だが、当時の失敗理由を保存しておらず原因/頻度は確定不能。列挙5回は643〜672msで5秒超過を再現せず。今後はbroker timeout/connect/http/body等とoffline runtime-present等の固定codeで切り分ける。raw URL/stderr/秘密値は表示しない。停止判定・poll・timeout・製品通知の意味は変更していない。今回成功sessionでは同エラーを観測していない。11/01のサーバー300秒自動通知成功とは別件。
- 新起動 `s20261104142128-9bb8d546` は子processの所有情報を確定できず安全停止。再列挙で残存0。対象PID/欠落fieldの記録がないためexact causeは未確定で、unknownを無条件採用する変更はしていない。後続3起動は成功した。
- `s20261104142345-17b1cd40` はHost A作成/自動B入室まで確認したが、旧選曲UIの修正のため停止。`s20261104144313-8b452166` は専任Hostで誤作成後に本人が終了し、新部屋へ作り直した。操作窓はsession最初の部屋へ固定されるため、そのまま継続せず保存・停止した。両sessionも停止/port残存なし。
- 終了押下の無反応は、親のPlaywright CDP接続にdialog listenerがなく確認ダイアログを自動dismissした検証側の干渉だった。listener登録後、本人の再押下・確認で終了成功。**次回もCDP接続直後に全pageへdialog listenerを登録し、本人のconfirmを代理accept/dismissしない。** 製品終了処理は変更していない。
- 検証: control120/client185/Worker193/integration6/stats17、root型/lint/契約/agents0、client production build、cargo check・Rust全36、Worker dry-runがPASS。最後のradio変更は対象5件・root型/scoped lint・client全185に加え、専用native buildと通常production buildも成功。`3b68e18`のPR CIもsuccess。Rust本文timeout試験の初版はHTTP fixtureのrequest未読で失敗し、fixture補正後の限定15件と全36件をPASS。古い実機証拠と今回の実GUI成功を分けて扱う。
- code独立レビューはnative・UI・radioとも未解決重大findingなし。native本文timeoutのOther包みのShould fixは補正・実HTTP回帰で解消。受入差分レビューもHost A合同/背景/履歴の証拠対応を確認。新選曲の実操作はdesktopで確認し、新規close/focus/responsiveの全幅実GUI確認は未完。

### 次回に残す作業

1. **Host A大会**の本人作成・開始・選曲・進行・終了。合同の今回実証で代替しない。必要なら大会でも背景提出/履歴再読込を確認する。本人の参加可否をその時点で確認し、代理操作しない。
2. **BPL手動再戦**の不足区間。旧BPL `s20261029002846-23896aa8` は3曲完走済みだが、operationsにreturnToLobby=0、startは初回1件。room fallback→初回matchのID変化を再戦としない。完走をやり直すことを既定にせず、新sessionの正規Host強制進行等でRESULTを作り、復帰→本人Ready→新match PICKINGだけを補完できるか検討する（実プレー完走の証拠とは分ける）。
3. 新選曲UIのclose/Escape/Tab/focus・小幅表示の実GUI補完、AC全体照合と最終レビュー。mock/単体成功を実GUI成功へ丸めない。
4. native当時エラーの原因/頻度は未確定として維持。固定診断を使って再発時に切り分ける。起動時の一過性所有情報欠落も再発時に調査する。

全runtimeは停止済み。古いroomへ再入室せず、次の専用起動から開始する。大会起動例: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-dev-control.ps1 -Mode TOURNAMENT -HostClient A -SelfSource daken_counter_v3 -SelfPort 8767 -OpponentSource reflux -VisibleOpponents 1 -PlayerCount 2`。本人は「自分もプレーする」を明示選択し、参加コードは空欄で自動生成可。旧controller/証拠/branch/worktree/stashを削除しない。

## 統合後の再開入口（2026-11-01）

ユーザーの採用承認により#189を `956f0fc`、#206を `9b98b97` としてv1へmerge済み。#188 v2本体・v3連携・Host期限通知・非負整数の提出検証・終了後cleanup再試行は既定branchの製品機能となった。軽量フローは正式採用され、root/local規約・config・zero定義検査は採用版を正本とする。旧Phase/試作の停止条件は履歴として扱う。

#192は元の `3bc6140` を祖先に保持して追随し、PR #208はv1基点のDraftを維持する。退避先のrename競合はarchive192の54ファイルとarchive205の57ファイルをそれぞれ元commitとblob一致で両保全。有効なCustom Agent/project Skillは0、既存Playwrightとdev-controlの標準テスト/CIを維持し、Node 22.23.4を保持した。Worker製品コード/テストは採用版と一致、v3 source-storeは検証済み3bc版（採用版との差はdev gate3行）、client標準テストは親の全対象と既存dev3本を含む。

追随後quick: control120/client179/Worker193/integration6/stats17、root型/lint/契約/agentsがPASS。競合解消を独立read-only確認し、今回の欠落・上書きの指摘なし。新しい対戦/実プレーは行っておらず、既存の実機証拠と受入未完を引き継ぐ。

残作業: Host A・本人Aの開催画面外提出/履歴再読込、BPLの手動再戦等の証拠照合、native定期読込エラーの原因/再現頻度調査。BPL4完走/手動再戦・固定Workerの起動/編集耐性・実時計300秒通知は確認済みで、繰返しを起点にしない。#208のmerge、Issue close、deploy/release、既存branch/worktree/stash削除は今回の承認に含まれない。

## 最新確認（2026-11-01、BPL4実機完走）

本人からアプリ起動・BPL4完走の再開指示を受け、新session `s20261101083610-940460f0` を起動。旧session/WIP/stashを保持。実Workerは起動時に固定したbundle/configを使用する。本人A入室前に元Worker source/configへコメントを4秒間追加し、同じbyte列へ復元した。Bは同室/同generation、transportEpoch=3、CONNECTEDを維持し、失敗観測なし。固定bundle/configのSHA256も起動記録と一致。本人の対戦中にはこの編集試験を行わない。

起動時、Windows 10.0.26300で応答中のWorker/実v3のbound endpointがraw state 0/1へ揺れ、`Get-NetTCPConnection -State Listen`から欠落する事象を確認（独立read-only確認あり）。Listenに加えてLocalPort>0/RemotePort=0のbound endpointを保守的に列挙する。readyには引き続き所有PID/生成時刻/pathとHTTP内容、模擬v3にはnonceを照合する。空の列挙は既存60秒期限内で再試行し、foreign/untracked/reused listenerは拒否する。停止後の別processの占有は成功に丸めない。実loopback serverの所有PID列挙/close後消失を含む5件、開発control標準120件、root typecheck/lint、Worker190件、stats17件がPASS。独立レビューで未解決Blocker/Must fixなし。修正commit `fe094c9`。

起動前失敗 `s20261101083145-fd9cf794`、`s20261101083230-98e317cb`、`s20261101083322-a5b977a6` の所有process/port停止記録を保持。新しい列挙でも旧process/portの残存なし。診断用の手動Wranglerも終了し、そのportのbound endpoint消失を確認。IIDX/実打鍵カウンタは操作・停止していない。

BPL4 match `8bfba1a1-a1d1-4091-a017-47b200bd4b93` はA実v3、B実client＋隔離模擬v3（毎曲EX0/MISS0、自動）で全4ステージ完走。A実結果はTriple Counter SPA 2934/MISS114、リリーゼと炎龍レーヴァテインSPA 2770/MISS54、.59 SPN 701/MISS0、5.1.1. SPA 1404/MISS7。各結果のRESULT_SUBMIT/PLAYER_ROUND_CONFIRMED/同曲snapshotと実mainを照合し、最終A4勝/B0勝。両clientはtransportEpoch=3を維持、失敗観測なし。

最終bundle `bundle-1793523169186955600` はsaved/missing[]、全16file readBack=true。A/Bの実native画像を保存し、A画像（`A-dc58349a-74cf-4fa7-a8d6-f40631cdad26.png`）の最終4対0を目視。A専用profileのroom-results schema1にも4/4曲と最終winnerを確認。操作窓からのRETURN_TO_LOBBYはoperation `b00a7f14-5fcd-46b4-937d-ecb990366900` がconfirmedとなり、roomId fallbackの受付修正を実証。本人AのReady後、同室/世代で新match `52724009-c1d5-44c8-9c75-74a99a3baf8f` の両者PICKINGまで確認し、追加プレーはしなかった。

停止は08:53:50.795Z→08:54:06.905Z、complete/errors[]、process/port再確認true、停止operationもconfirmed。自動保存bundle `bundle-1793523232856686100` は選曲入力フォームのA/B画像をprivacy拒否してpartialを表示し、先の欠落なし最終bundleを保持。所有runtime残存なし、実counterを停止対象にしていない。起動修正 `fe094c9` のPR CIもsuccess。

本人操作なしの大会 `s20261101085429-0da85750`（event `f719ca43-0a23-4bbb-9531-468ba302c5b4`、B native Reflux/C headless、固定N=2）で、.59 SPHの10秒遅延を実確認。operation `44aa2af9-9731-45f7-b828-3c3aae6037de` は08:57:34.382Zに予約、08:57:44.897Zに実source入力、解析/SUBMIT/ACK/同曲SUBMITTEDでconfirmed。B/Cとも500/MISS10・同率1位/2pt。2曲目は同譜面/同値をBのnative経路で新規受付し、Host B切断後にCのhold→auto確認を一度取消（hold/PENDING/入力値保持）、再確認後に当該曲を即時提出。両提出済みでもACTIVEのまま公開を保留し、操作窓はCの新revisionから2/2・Host復帰期限を表示した。

修正後の実時計300秒通知はPASS。Host期限09:03:33.043Zに対して終了保存09:03:33.046Z、Cの自動EVENT_STATE受信09:03:33.051Z（sequence122、revision16、phase RESULT、HOST_DISCONNECTED）。切断後から受信までCの追加STATE_GETは0件、transportEpoch=2/CONNECTEDを維持。未公開の第2曲は総合点へ加算せず、確定済み第1曲の両者2ptを保持した。

ただし操作窓の定期native読込で一時エラー（`Offline runtime verification failed; records remain exportable`）となり、画面は明示エラー付きで旧表示を保持した。既存「最新の状態を確認」の再試行で「開催の最終結果」へ復帰し、Host待ち案内も消失。サーバーの自動通知成功と、この表示復帰を区別する。読込エラーの原因/再現頻度は未特定で残す。端末の状態再読込は製品STATE_GETを送っていない。復帰後画像は外部visualizationsの `host-deadline-final-20261101.png`、ログbundle `bundle-1793523907785988200` はA/B入力フォーム画像をprivacy拒否してpartialを表示した。

同大会の停止前自動保存は `bundle-1793523952427944300`（partial、画像privacy拒否を明示）。最初のshutdown記録にはPID0のbound endpointが残り、安全側に停止未確認となった。その後のnative再確認では占有が消失し、stopped/complete・process/port確認true・停止operation confirmedを実確認。最後に新しい全5 sessionを同じinventory/port列挙で照合し、所有runtime/割当portの残存0。実counter PID9332と8767は維持、診断Workerのport残存も0。開発control120、client179、Worker190、integration6、stats17、root型/lint/契約/agent検査および変更script構文のquick相当を再確認しPASS。

残る実機面は `tasks/issue-192-dev-control-validation.md` のHost A/本人Aの開催画面外提出・履歴再読込、BPLの手動再戦等の証拠照合、および上記の一時native読込エラーの調査。固定Worker実起動/編集耐性・BPL4完走/手動再戦・修正後300秒通知は再試験の起点へ戻さない。#192は引き続き未完、PR #208はDraftとし、merge/Issue close/deploy/releaseは行わない。

## 次回の再開入口（2026-10-29、対戦を停止して引き継ぎ）

この記録時はユーザーの残り使用量に合わせ、追加の対戦・実プレーを停止した（2026-11-01の再開指示は上記）。branch `codex/issue-192-dev-control`、Draft PR #208。軽量規約を維持し、旧Phase記録は履歴として扱う。当時の全sessionはstopped/complete、process/port確認済み。元のIIDX/打鍵カウンタは停止対象に含めていない。既存WIP・2 stash・他worktreeを保持し、以下の検証を最初から繰り返さない。

- 実機済み: BPL全3曲、ARENA全4曲と再戦開始、合同/大会の本人A実v3、相手3source×通常/合同/大会の実client/parser/受付（隔離した模擬入力）、保存成功/失敗/停止後再試行/native restart、画像privacy、release IPC拒否。詳細は本書のsession別記録。
- 未完: BPL4 `s20261029102914-07b6c706` はAのColorful Cookie SPA 2782/MISS64、雪月花SPA 2142/MISS27まで受理。第3曲24h Endurance Race SPAは実プレー/読取後、開発中Workerの自動reloadでA/Bが切断しPLAYER_ALREADY_CONNECTED→RECONNECT_TIMEOUT、未提出。第4曲未実施。失敗記録と両窓画像はsaved bundle `bundle-1793270828009925900` に保全。完走成功と扱わず、新sessionで再確認する。過去結果を新matchへ移し替えない。
- 修正済み・実機未確認: 起動時にWorkerを既存Wranglerのdry-runでsession専用bundleへ固定し、設定もcopyして `--no-bundle --local` で実行する。元source/configの編集で進行中対戦をreloadさせない。実Wranglerでbundle作成・hash取得は成功。実起動と元file編集時のWS保持は次回に確認する（プレー不要）。通常対戦のstale connected状態を強制変更する復旧は追加していない。
- 修正済み・再実証待ち: Host300秒のalarm起床時restoreが先に期限終了を保存して通知しないWorker不具合。永続化後/socket復元後の通知に補正し、独立レビューと失敗例を含む回帰PASS。次回は追加STATE_GETなしの実時計300秒自動通知を確認する。旧 `5b3a6443` は修正前の失敗証拠。
- 次回順序: 固定Workerの起動/編集耐性 → 300秒通知 → 新BPL4完走・復帰/手動再戦 → `tasks/issue-192-dev-control-validation.md` の残AC（Host A/本人の背景提出等）の証拠照合。本人の参加可否を確認し、本人操作は代行しない。BPLの手動再戦など、共通経路の単体/既存証拠で足りる部分と実機未確認を区別する。
- 最終判定: #192は未完、PRはDraftを維持。merge/Issue close/deploy/releaseは未許可。現在のローカルsessionへ再入室せず、新しいIDで起動する。起動コマンドは `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-dev-control.ps1 -Mode BPL4 -HostClient B -SelfSource daken_counter_v3 -SelfPort 8767 -OpponentSource daken_counter_v3 -VisibleOpponents 1 -PlayerCount 2`。

## 最新状況（2026-10-28、軽量フローで再開）

以下を最新記録とし、後段のPhase/T2記録は履歴とする。branchは `codex/issue-192-dev-control`、製品基点は #188 の `0dac1b0`。`c1e6950` で #206 を暫定適用した。旧定義46ファイルはbyte一致のarchiveへ退避し、通常参照するCustom Agent/project Skillは0。Playwright・製品CI・製品/UX資料を保持。#206のmerge・正式移行は行っていない。

- 再開時の81 WIPファイルは `.tmp/issue-192-resume/before.json` にhash付きで記録。削除なし。既存2 stash、他worktree/branchを保持。#207のReceiptLedger修正は現在のファイルを正本として確認し、101件成功の基点を再確認した。再実装していない。
- native復元/停止/新session、atomic保存、process/port所有権、CIM中の消失、HTTP.sysのv3 readiness、専用build/asset/WebView loader、controller再表示/独立存続、main終了通知、受付相関を補正した。
- focusはnativeの実確認を根拠とし、製品WS受付と区別する。broker消失時は所有台帳と確認tokenを使う限定停止を許し、既存の証拠・元sourceを保つ。
- 実v3が文字列の外部譜面IDを送ることを実プレーで確認。人間の承認を得て、曲マスタの曲名/SPDP/難易度が完全一致・一意・全件取得済みの場合だけ内部数値IDへ正規化した。数値ID不一致/欠落、不正な小数ID、曖昧/未完/取得失敗は拒否する。模擬v3も文字列IDへ合わせた。製品WS/shared/snapshotのschema変更なし。
- 画像はUI threadを止めずに取得し、撮影中の機密表示/context変更を監視する。安全確認まではnativeメモリに保持し、拒否/期限超過/別ID/再利用ではspoolへ確定しない。独立レビューのprivacy TOCTOU指摘に対処した。実画像の統合確認とは分ける。

| 検証 | 結果・限界 |
| --- | --- |
| client標準unit | 179/179 PASS。v3通常/合同/大会、文字列ID、一意性/失敗/旧context、画像の一時private→safe、Host断中の新しいguest観測による進行表示を含む |
| 開発control標準unit | 118/118 PASS。停止前native保存の成功/partial/失敗/期限切れ、古い受付拒否、再戦復帰、停止要求自身の追跡、Worker bundle/config固定を含む。`test:dev-control` を既存Windows CIへ登録 |
| native Rust | 33/33 PASS。停止前bundle相関・read-back、停止との競合・409拒否時の状態/証拠保全、Reflux空baselineの非観測/重複排除、メモリ画像の安全確認/破棄/期限/再利用拒否を含む |
| CI面 | root typecheck/lint、check:agents/check:design-contracts、client production build PASS。Worker190、Host Event integration6、stats17 PASS。Worker dry-run、cargo check --release成功（deployなし、既存警告2件） |
| script構文 | mjs全件node --check、PS4件ParseFile PASS |
| rendered UI | 既存試験用seamとPlaywrightで初回/稼働中read失敗の再試行、terminal後poll停止、孤立runtime停止dialogを確認。凍結corrected画像/操作表を維持。mock成功をnative受理とは扱わない |
| 独立レビュー | receipt/atomic保存/復元/所有権/source/focus/画像privacyを別contextでread-only確認。重要な指摘は修正・再検証し、実証が残る部分を下記へ分離 |

| 実Windows session | 実証 |
| --- | --- |
| `s20261028092709-1de2a0d1` | 合同/B inf-notebook。実watcher/parser→SUBMIT→ACK→同曲snapshotを2曲連続（同譜面/同値）で確認。新入力前の再提出なし。B main公開SCORE400を目視。保存bundle/停止後記録保持、process/port完全停止 |
| `s20261028095536-4055e8a2` | controller hide→再表示。broker異常終了後に実所有process/port停止を確認し、独立read-only shellからnative restartで次sessionへ。旧証拠保持 |
| `s20261028115543-e052f72c` | 合同/A実v3の `.59 SPA` EX1086/MISS2は読み取り済み・数値ID不成立で未提出。B模擬v3はSUBMIT/ACK/同曲SUBMITTEDを確認。保存は画像欠損をpartial表示。停止時PID再利用を拒否し、offline再列挙で元process/port完全停止を確認 |
| `s20261028122911-91eb9842` | 修正後のA実プレー `.59 SPA` EX1094/MISS1を実v3から提出、normalize成功/SUBMIT/accepted ACK/同曲SUBMITTEDを確認。文字列IDのBも実parser→SUBMIT→ACK→SUBMITTED、両者提出後にround RESULT。A mainの公開結果でA1094/1位、B400/2位を実画像で確認。native保存のA画像も開いて同結果を確認。Bは旧privacy判定で欠損を表示しpartial保存。このsessionのbinaryはメモリ画像確定変更前 |

未完: 3source×通常/合同/大会のnative全経路、ARENA/BPL/BPL4の全進行、全異常/再接続の実GUI確認、停止前bundleの自動flush/read-back（独立確認でMust fix、修正中）。大会の実プレー2曲、メモリ画像確定保存/撮影途中の機密切替、release実行時拒否/通常起動は10/29に実証（下記）。単体/モック成功だけで #192 全体を完成扱いしない。

再開時はこの最新欄と現在の `AGENTS.md` / `QUALITY.md` を読む。元のWIPやstashをreset/上書きせず、対象sessionの `launch-state.json` / `manifest.json` / `controller-spool/state.json` を照合する。停止済み記録は `scripts/start-dev-control.ps1 -ReopenFrom <sessionのmanifest.json>`、新sessionはUIの確認付きrestartを使う。元A sourceはread-onlyを維持し、過去全日入力を証拠へ収集しない。PR merge/Issue close/deploy/releaseは未許可。

### 2026-10-29 再開

本人Aは現在参加不可。本人操作/実プレーを代行した成功記録は作らず、自動確認可能な範囲を進める。`91eb9842` のruntime/portは全終了していたがspoolはquiescingで途切れていた。専用ReopenFromで旧controllerを独立起動し、native readbackがstopped/complete・processesVerified/portsVerified trueを確認。停止後も前日のA実画像・受付ログを保持して新bundleへ再保存できた。旧shutdown.jsonは欠落としてpartialを維持した。

PR #208 の初回CIは追加broker試験の一時directory親が存在せずENOENTとなった。試験側に明示mkdirを追加し、空の作業directoryから既存broker testを実行して25/25 PASS。製品検査の削除・緩和なし。

`265d027` のPR CIは成功（run `40791136947`、check `123176357024`）。`s20261029000125-62374cff` は本人Aを未入室のまま保持し、B実client/Refluxで開催開始→選曲→入力→parser→SUBMIT→accepted ACK→同曲RESULT/500→開催終了を確認した。Aの代理操作や実プレー成功とは扱わない。B mainの「開催へ戻る」で実結果を開き、メモリ画像の確定保存とPNGの内容一致を確認。Aの入力画面はprivacy拒否のためpartialを正しく表示。最新capture B `3ce07624-9141-4f19-9841-d33ef4d2609b`、bundle `bundle-1793232474097421600`。

同sessionを実UIの確認から停止し、約9秒後にstopped/complete、process/port確認済み、errorsなしを確認。shutdown.jsonのincomplete/remaining/remainingPortsはいずれも空。元sourceプロセスは起動も停止もしていない。

`s20261029001104-47d06cd5` の起動で、owned frontendのTCPはlisten済みでも最初のHTTPが5秒内に準備できず失敗する事象を確認。終了後のowned process/port残存なし。HTTP timeout/abort/接続一時失敗/5xxだけを既存60秒期限内で再probeし、4xx・不正JSON・capability/content不一致は即拒否する修正を追加。各probeで所有PID/path/作成時刻を再照合し、TCP/HTTPを残時間で制限、応答後も期限を照合する。期限後の正しい応答も採用しない負例を含む2/2 PASS、独立レビューの期限指摘を修正・再確認済み。script全体109/109 PASS。

配布相当のrelease build（production assets、専用identifier `com.infinitas.arena.verify.issue192`、通常profileから隔離、bundle公開なし）を実起動し、通常ロビーが表示されることを確認。WebView2のlocal CDPから実IPCで開発command12種を呼び、すべて `Development control is unavailable in release builds` を返すことを確認。restartは正しいversion/options DTOでも同じ拒否。無効なrestart DTOの引数拒否だけをrelease guard成功の根拠にはしていない。テスト用APIはloopbackの未使用先で、製品roomへ接続していない。probe process/子processは所有identityを照合して終了し、debug port消失を確認。既存 `match_history_window.rs` のrelease警告2件は目的外のため変更していない。

その後本人が参加可能となり、曲は固定せずこちらで変えて選ぶ方針を確認。`s20261029001325-3b68e611`（大会、A実v3/B実clientの模擬v3/C headless）でAを開催前に入室、名簿とN=3を固定。第1曲5.1.1. SPAのA実結果244/MISS647をaccepted ACK/同曲SUBMITTEDと照合、実mainでB600/3pt、C450/2pt、A244/1ptを確認。Cを切断→同じ人として再接続し、epoch更新後も確定450・SUBMITTEDを保持。第2曲24th Century BOY SPHではA1811/MISS2とB/Cのautoを新曲として受付。A mainの最終結果は2曲完全記録、専用profileの保存documentもschema2/COMPLETE/ended/N3/名簿3/2曲、総合B5pt・A4pt・C3ptを確認した。

同sessionでnative `dev_control_capture` の実request開始を既存Playwrightから観測後、Bを設定画面へ切替→すぐ開催画面へ戻した。B capture `fe5efa80-ebd9-45fe-b335-70ffb29f5113` は「画像取得中に画面が変化」でmissingとなりPNG不存在。安全画面へ戻しても復活しないことを実native経路で確認。両窓が安全な状態で再保存するとmissing[]/savedとなり、最終結果bundle `bundle-1793233753153950000` を作成。runtime停止は約11秒、errors[]・process/port消失を確認。native画像/IPC試験ではBrowser plugin不在のため既存Playwrightで実WebView2へlocal CDP接続した。新しいharnessや依存は追加していない。

`s20261029002846-23896aa8` のBPLは3ステージ完走。A実v3でMENTAL MELTDOWN SPA 2289/MISS102、24h Endurance Race SPH 1949/MISS16、GALGALIM SPA 1954/MISS31を各曲の実送信/受付と照合。Bはinf-notebookの実watcher/parser経路から毎曲500/MISS10。最終RESULTは3/3曲、A3勝・B0勝で、実mainと公開結果が一致した。10/29夕方の再開時はアプリ終了済み、停止途中のspoolと全結果を保持している。

停止前bundle不足を補正。quiesce/収集後、停止ID・期限付きでnativeの新bundle flush/read-back受付を待つ。保存失敗/期限切れでも停止を続け、spool/旧bundleを保持する。独立レビューの外部collect再開・古い失敗上書き・nativeとbrokerの全state置換競合を修正し、稼働中の保存結果はbrokerのみが確定する。再レビューで未解決Must fixなし。停止後の保存・再試行は従来のnative経路を維持。実nativeの最新修正版での停止確認は継続中。

夕方のARENA `s20261029094734-d7fdfe8c` で、B/Refluxの曲切替時に架空baseline曲によるNB-UNRESOLVED-ALIAS dialogを実確認。供給側のbaselineをプレーでない空objectへ補正し、製品parserは変更していない。supplier7/7と既存Rust parserを通る空入力→実結果→空入力→旧結果再配信の試験がPASS。初期化/失効で架空aliasを作らず、古い結果を新規扱いしない。独立レビューPASS。次の起動で実GUIのダイアログ不在と2曲連続受付を確認する。

同ARENAはA実v3/B実Reflux/C・D headlessで4曲完走（match `03abbd5e-5d50-4bbd-bc25-d79204c236cb`）。AはLittle Little Princess SPA 2457/MISS9、.59 SPH 973/MISS1、24h Endurance Race SPN 961/MISS0、24th Century BOY SPA 2459/MISS15。Bは各700/MISS10。実main/最終RESULTはA8pt・B4pt・C/D0pt。最終画面をnativeで保存し、PNG内容を確認（bundle `bundle-1793268396592638900`、missing[]）。待機室復帰→A本人Ready→操作窓から再戦開始し、新match `4255f596-cac1-4fe9-8922-ffa6410abbd7` のPICKINGまで確認。追加プレーはしていない。操作窓からA実窓の表示/focusもnative確認によりconfirmedとなった。

復帰時の操作結果だけunknownになる不整合を発見。製品snapshotがLOBBYで `current_match_id = room_id` にfallbackするのに、ledgerがnullのみ要求していた。既存契約に合わせ、同室/世代・送信後・LOBBY・current_roundなし・result_ready=falseのときだけ同roomId fallbackも確認する。送信前/別室/別世代/別match/RESULT残存は拒否。broker+receipt70/70 PASS、独立レビューPASS。次の通常モード最終結果で実GUI再確認する。

ARENA停止は約12秒、要求ID一致の新native bundle `bundle-1793268581537080500` を停止前にflush/read-backしてからprocess/port完全停止、errors[]。選曲入力画面の画像拒否をpartialと表示し、前の最終結果画像bundleは保持した。旧controllerからnative restartし、大会/Reflux `s20261029101123-30ce7fff` の起動を確認した（以後の修正を反映したnative保存writer）。

停止そのものが成功しても操作記録で停止要求自身をcancelledとする表示不整合を発見。stop.operationIdで自要求だけ未投入予約の分類から除外し、nativeのprocess/port両方の照合後に同session/controller/操作IDだけconfirmedへ確定する。残存時はunknown、別操作/別session/拒否済みは保持。delivery/evidence25/25、root typecheck、独立レビューPASS。実GUIは次sessionで確認する。

大会/Reflux `30ce7fff` はB実clientとC headless、A未入室でN=2固定。`.59 SPH` を同値650/MISS10で2曲連続、実watcher/parser→正規SUBMIT→accepted ACK→同曲SUBMITTED/confirmedと照合し、実mainで両者同率1位2ptを確認。初期化・曲切替後の架空alias dialogなし。Bは第1曲に通常画面にいたまま背景提出し、開催へ戻って結果を表示した。Aの代理操作・本人実プレー成功とは扱わない。

開催終了後、手動保存を挟まず全体停止。修正版native writerが要求ID一致の新bundle `bundle-1793268971173649300`（flushing状態を収録、全file readBack=true）を10:16:11Zに保存し、その後のshutdown記録は10:16:16Z、停止完了10:16:19Z・process/port確認済み・errors[]。B最終2曲のPNGを開いて確認。A入室前の入力画面はprivacy拒否をpartialとして明示。停止後の保存再試行で別bundle `bundle-1793268998164251300` を作成、旧bundle/画像/受付記録を保持。次の大会/inf-notebookは同じcontrollerのnative restartから起動する。

大会/inf-notebook `s20261029101658-600c3388` はB実client/C headless、A未入室・N=2。3曲のB500/MISS12を実watcher/parser→SUBMIT/ACK/同曲SUBMITTEDと照合。第2曲ではHost Bの提出後にBを切断し、Cをhold→確認付きautoへ変更して提出。Host断中に両SUBMITTEDでもACTIVEを維持し、復帰後に結果公開。第3曲はC holdを残してHost締切、C ABSENT/DEADLINE/0pt・B2pt、固定N2を確認した。

同試験でHost Bのrev12と接続中Cのrev14が異なるのにヘッダが古いBを使う表示不整合を発見。同session/room/event/generation内の最大revisionを進行表示に使い、Host本人の操作context/権限は維持。終了時は再接続待ち案内を消す。client179/179、root typecheck/lint、独立レビューPASS。最新UIの実Host断表示は次sessionで確認する。

同sessionの未使用exports先へ検証専用の遮断fileを作り、native保存失敗を実発生。保存failed/os error183を表示しつつ約14秒でruntime停止・process/port確認、停止要求自身もnative確認後confirmedとなった。spool/画像/受付を保持。自分で作った遮断fileだけを同じroot内の記録fileへrename後、停止済みcontrollerの「保存」で新bundleへ再試行した。

再保存bundle `bundle-1793269523550552500` は全file readBack=true。spoolとexportのobservations.jsonlは、保存失敗前・再試行後とも同じSHA256（39e1…3a18）。Aの画像欠損をpartialのまま表示し、保存失敗とruntime停止成功を混同しない。

最新UIの大会 `s20261029102646-5b3a6443` でHost断中のC両提出を確認。B rev8に対しCの新revisionからヘッダ2/2人・Host復帰期限を表示し、実WebView画像も確認。実時計300秒の期限でサーバーは10:33:57.029ZにHOST_DISCONNECTEDを保存したが、Cへ自動EVENT_STATEが届かずPONGのみが続いた。10:35:36の明示STATE_GETで初めてRESULTを受信。終了後のヘッダと再接続待ち案内消失は表示修正版で確認した。これは期限自動通知の成功とは扱わない。

独立調査で、DOのalarm起床時にrestoreが先に期限を確定し、その後のalarmは終了済みなのでbroadcastしない通知漏れを確認。restoreで新たな期限終了が永続化されたときだけ、hibernated socket復元後に既存EVENT_STATEを送る最小修正を追加。保存失敗rollbackでは通知せず、保存後cleanup alarm設定失敗でも通知する。保存schema/期限/権限/秘匿/WS型は変更しない。controller28/28、Worker全190/190、Host Event integration6/6、bundle dry-run、独立再レビューPASS。修正版の実時計300秒自動通知は再確認が必要。

2026-10-24。作業基点は `codex/issue-192-dev-control` / `0dac1b02d3b23d9449d1e63d7ca3f822f98f9e50`。Phase C の責務別checkpoint記録であり、製品全体の受入完了ではない。正本は `tasks/issue-192-dev-control-{window,tasks,validation}.md`、`tasks/issue-192-design-source-manifest.md` と `docs/ux/issue-192-dev-control/control-boundary.md`。

## T2 interface

- controller は `protocol.ts` / `transport.ts` の private DTO を使う。`getDevControlIdentity` / `getDevControlState` / `sendDevControlCommand` / `saveDevControlEvidence` / `restartDevControlSession` を入口とする。roomへの接続は持たない。
- main adapter は自分の native identity で report / adapter-state / poll / finish を使う。adapter-state の `hostClientId` / `hostReady` は、通常roomの最初のJOINを指定Hostへ限定するための観測gate。AのJOIN/製品操作は本人が実アプリから行う。
- 一つのplayerは manifest で `real-client` / `headless` のどちらかだけを持つ。画面あり相手の結果をbrokerから直接WSへ送らない。A宛は focus / state.refresh だけをnative・broker・adapterで許可する。
- supplier はprocessをspawnしない。launcherが `kind=source` / clientId と実identityでmockを台帳登録し停止する。`createSourceSupplier({manifest,clientId,verifyContext})` → `prepareInput` → source-armの単一claim → mainの `armedInputId` report → `supply`。`invalidate` / `stop` を持つ。v3 control file は相手fixtureRootの `today-updates.json`。このT2試験ではsupplier stubを使い、実parser/実sourceの証拠へ流用しない。
- pollは再実行許可ではない。各commandの直前に最新adapter-stateを再取得し、brokerが持つvalue/policy revisionとmainのsnapshot/connection epochを照合する。非同期供給準備/arm/supplyの境界でもcontextを検査する。
- broker単独のschedulerが10秒予約を所有する。期限到達時は `reserved` → `pending` にして単一claimへ進む。未claim予約だけ取消でき、claim後の取消を成功扱いしない。15秒timeoutはunknown、settled operationへの遅延finishは拒否し、新IDで自動再投入しない。
- draftは次回入力であり確定済みsnapshotを変更しない。競合製品操作の返答待ちでもdraft/policyの編集を保つ。unknownの結果投入は同曲へ再投入しない。操作可否の正本照合は凍結operation matrix §3〜6。通常N5接続操作、開催Host自身退出不可、Host断中guest退出不可と有効SUBMIT継続を分離する。
- raw観測はJSONLへ保存し、context、operationId、実client_msg_id/request_id、event revision、受信順を保持する。通常snapshotへ架空revisionは付けない。送信をconfirmedへ変換しない。最終受付相関・unknown再同期・保存停止protocolの完成はT5。

## T2で実施した検証

| command | 結果 / 範囲 |
| --- | --- |
| `npm run typecheck` | PASS。root tsconfigは追加 `src/dev-control/adapter.test.ts` を含む |
| `npm run lint` | PASS、exit 0 |
| `npm --workspace @infinitas/client run test` | PASS 156/156。追加adapter test3件を列挙scriptへ登録 |
| `npm run build:client` | PASS。通常production mode。専用controller実窓の証明ではない |
| `node --test scripts/dev-control/broker.test.mjs scripts/dev-control/delivery.test.mjs scripts/dev-control/scheduler.test.mjs scripts/dev-control/guards.test.mjs scripts/dev-control/processes.test.mjs` | PASS 12/12。10秒fake clock、claim単一実行、claim後取消拒否、timeout後finish拒否、async prepare中epoch変更、A保護、Windows所有identity停止 |
| `node --test scripts/dev-control/peer.test.mjs scripts/dev-control/delivery.test.mjs` | PASS 5/5（delivery4再実行＋peer1）。通常3mode/開催2modeの正規envelope、0を有効値として配送 |
| `node --test scripts/dev-control/broker.test.mjs scripts/dev-control/delivery.test.mjs scripts/dev-control/scheduler.test.mjs scripts/dev-control/guards.test.mjs scripts/dev-control/processes.test.mjs scripts/dev-control/peer.test.mjs` | 最終PASS 14/14。deliveryへsupply await中のstop後unknown維持を追加。停止後beginPeersの再開も防止 |
| `scripts/dev-control/*.mjs` 各 `node --check` | PASS。scriptsはroot TS/lint対象外のため別検証 |
| `scripts/start-dev-control.ps1` / `scripts/dev-control/processes.ps1` の PowerShell ParseFile | PASS |
| native cwd `cargo check --locked` | PASS |
| native cwd `cargo test --locked dev_control` | PASS 2/2。他20件はこの限定commandではfilterされる |
| `git diff --check` | PASS。依存・lockfile・Worker/shared製品変更なし |

client workspace tsconfigは `.test.ts` を除外するため、workspace typecheckだけでは検証していない。追加TypeScript fixtureは公開ContextToken/constructor inputへ `satisfies` を付け、root typecheckと標準testの両面で検証した。Node mjs/PowerShellには別の明示実行面が必要。

## 監査findingの修正対応

| finding | 対応 | 検証 / 残る確認 |
| --- | --- | --- |
| C192-T2-01 | action-policyで通常RESULTの接続操作、開催Host自身/Host断guest退出制限を補正 | delivery test。独立再監査へ返却 |
| C192-T2-02 | 同対象の競合製品操作を返答待ち中は拒否。draft/policy編集は維持 | delivery testのready逆値連打拒否。最終受付解除はT5 |
| I192-T2-01 | delay dispatchをpendingへ遷移しsource-armをclaim可能にした | fake clock10秒→poll1回→supply1回 |
| I192-T2-02 | claim後取消を拒否、settledへのlate finish上書きを拒否 | delivery test。既投入は取消成功としない |
| I192-T2-03 | normal WSのold socket open/message/errorをidentity guardで隔離 | typed adapter test。実pause/reconnectは独立VM/T6 |
| I192-T2-04 | poll後/command毎の最新adapter-state再取得、store接続の同期epoch照合 | root typecheck/client test。deferred pollは独立VM再検証へ |

親から独立再監査の受領結果を確認: C192-T2-01/02、I192-T2-01〜04はresolved。契約担当から最新delivery5/5（supply途中stopを含む）の独立PASS、`pass-with-followups` / T3解禁可を受領した。T2責務checkpointはCOMPLETE。最終全体T7 verdictではない。

C192-T2-N01（Note）は後続foundationへ継続: headlessの `client.focus` availabilityを無効にし、controllerの `state.refresh` をpoll不要の読取へ接続する。T4/T5接続前の同scope最小補正とし、UI fileへは書き込まない。

T1-S01の `WaitForExit(5000)` bool判定は実装済み。timeoutはfailedとしstoppedと記録しない。実runtime停止後のprocess/port read-backはT5/T6。

## 未実証・後続境界

T3の実source3種×通常/合同/大会とSC192-01、T4のUI/visual source照合、T5の通常confirm+snapshot/開催ACK+statusの最終相関とunknown再同期・停止前spool/停止後export、新session、T6のA実プレー・実窓・保存領域/履歴隔離・release直呼び拒否・全runtime停止は、このT2部分checkpointでPASSにしない。A元設定/履歴へのwriteやA代理操作は行っていない。

本checkpointでは見た目の実装を行っていない。UI正本は凍結operation matrixとdesign source manifestで、配置・画像の準拠証拠はT4 ownerが提出する。commit/push/PR/merge/Issue close/deployは実行しない。

## 2026-10-25 foundation依存接点・test登録checkpoint

`source-store.test.ts` の実在を確認し、foundation所有のclient標準test scriptへ追加。root `tsconfig.json` は同fileを含むがclient workspaceは `.test.ts` を除外するため、CIと同じroot `npm run typecheck` とclient標準testを実行した。

| command | 結果 / 範囲 |
| --- | --- |
| `npm run typecheck` | PASS、exit 0。追加source-store fixtureを含むroot面 |
| `npm run lint` | PASS、exit 0 |
| `npm --workspace @infinitas/client run test` | PASS 159/159。source-store 3件を標準実行。source ownerの後続補強後は再確認する |
| `node --test scripts/dev-control/restart.test.mjs scripts/dev-control/delivery.test.mjs scripts/dev-control/broker.test.mjs` | PASS 9/9。restart閉鎖DTO、v3 exact fingerprint arm、停止途中unknown維持などの局所接点 |
| native cwd `cargo test --locked dev_control` | PASS 3/3、20件filter。実restart/release直呼びの証明ではない |

source/UI ownerへの依存照会では、現private DTO/transportとsupplier interfaceの不足は報告されていない。UIの `DevControlView.test.tsx` / `presentation.test.ts` も実在確認後に標準登録済み。UI fixtureのstrict undefined補正後、foundationがroot `npm run typecheck` を再実行しPASS、client標準testは166/166 PASS。UIの後続rendered QAは継続中なので、その完了や実native保存の証拠へ流用しない。

Node supplier/runtime試験はclient標準scriptの対象外なので、T3 ownerの明示実行面を記録する: `node --test scripts/dev-control/sources/supplier.test.mjs`、`node --test scripts/dev-control/sources/v3-runtime.test.mjs`。後者はT3 owner報告で1/1 PASS（23.6秒、Windows相手専用PS mock実起動→supplier→raw WS/replay→停止後port再bind）。foundationの独立再実行結果ではなく、native watcher/parser全9面の実証でもない。

T5全体はT3/T4責務checkpoint待ちで、この時点ではread-only設計調査のみ。受付相関、停止前回収、停止後export/retry/read-only再表示、新sessionの実証は未完。実runtime検証前にraw送受信・snapshot・manifest・log・spool・bundle全体へ保存前の中央redactionを適用し、session認証およびhost/rejoin/resume等の製品secretを保存しない。相関ID/ACK/status/contextを保持し、redactionと取得不能資料を明記する。本人Aの元設定・全日source入力・無関係履歴は証拠へ収集しない。この予定を前taskの実証済み証拠として扱わない。
