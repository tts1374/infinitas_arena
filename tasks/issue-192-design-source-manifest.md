# #192 design source manifest

2026-10-23 JST。Phase Bで読取り・存在/hashを確認した正本参照台帳。原本は変更しない。

- source root: `C:/Users/tts13/.codex/visualizations/2026/10/17/01a14a57-d0ac-7fd0-8093-6fcd2f4a05bf/`。
- 製品参照root: `C:/Users/tts13/.codex/worktrees/issue-188-phase-c-host-led/infinitas_arena`。
- branch/HEAD: `codex/issue-188-phase-c-host-led` / `0dac1b02d3b23d9449d1e63d7ca3f822f98f9e50`。
- 合意の最新根拠: correction-reviewとdraftの2026-10-18ユーザー全体合意。独立再レビュー内の合意前時点の記述、旧試作/旧レビューの未処理判定は履歴。
- UI正本: 補正後v3 HTML＋operation matrix。見た目の最新証拠はcorrected画像7件。旧concept/renderを最新補正の根拠にしない。

## 凍結対象

| source file | bytes | SHA256 |
| --- | ---: | --- |
| issue-192-phase-a-draft.md | 40606 | `CB6482BDCBDC34A9B5271DE4C1AA5DA0CB8EDFCB7894833CA16015074B230A30` |
| issue-192-operation-matrix.md | 24893 | `2A1CE3F6B1818DC13AD82CA07842F7A3DA92128FF2BEDD1049DF6E07FB0B0163` |
| issue-192-control-window-v3.html | 50857 | `6C7093E7686B1EAA881E490000368C67EED8521423DF9F4A623BF447110498F3` |
| issue-192-correction-review.md | 11878 | `31EFD1D45C02813FCA1B9C7E754884503A9548709FF3FD0924B63591BF2695EC` |
| issue-192-rereview-contract.md | 11973 | `304A96DC91E46706741D5AFFE315A5ECCB6BEB07D0C7DF11E9CB394E782737F6` |
| issue-192-rereview-ux.md | 15020 | `24E3472F17048202142610DC9E8DFDC660EB9877A5420E2C88CC8E0015A085D2` |
| issue-192-corrected-confirmation.png | 137416 | `7BF93536BF9E67B3ABE6DAF013944E56DA1539BEE0D620C20CAC56982E03A39D` |
| issue-192-corrected-default.png | 91645 | `53F01577CE0747A6994238088D9B783AD357F96F32B3C4FEE5DF2891E75E49D0` |
| issue-192-corrected-input-route.png | 139028 | `FBD07F172C71074BDC277103961046D7161705CF04103BB7B877B0D11C10EED4` |
| issue-192-corrected-mobile-footer.png | 8382 | `BFBB5B90A58F957A5A2D17103AAD4BEAD4AE1E07E694EECBE83DF79E7C76A9E1` |
| issue-192-corrected-mobile.png | 42205 | `E18589AB651388078B06AA1CA90486643B4410AC7DEAAA315A51F222791D3F62` |
| issue-192-corrected-preparation.png | 111147 | `1EA108E8F91DB7125D93A8D5C778659D70794C50008091A4C70F1C2A7FF8D3D2` |
| issue-192-corrected-status.png | 107718 | `DDEAD39F6E09D8DC2B46B73DE5D2320E94F90270B0D639576A1D0922E5622B15` |

## 参照・保存方針

Bでは6資料を静的に読み、corrected画像7件を目視した。既存試作を起動・編集したり製品受入証拠として再利用したりしていない。画像の範囲: default=配置/A状態、preparation=事前値、confirmation=即時auto確認と重複入力Note、status=当該曲の提出/欠場、input-route=source別説明、mobile/footer=小幅と下部保存。mobile単独は下部の到達証拠にならない。

CのT0は上表と原本を再照合し、`docs/ux/issue-192-dev-control/phase-a/`へ同byteの参照copyを置く。READMEに由来・合意時点・hash・履歴の扱いを残す。欠損/hash差異はBLOCKEDとし、旧資料や再生成した別画像へ黙って置換しない。元フォルダーや元#188資料を書き換えない。

HTMLは凍結参照で、直接編集しない。必要なら編集元の `issue-192-v3-surface.html` / `issue-192-v3-behavior.js` / `issue-192-v3-presentation.js` / `assemble-issue-192-v3.py` も由来を明記して参考保存する。相対リンク先の旧履歴は原本rootを参照するかREADMEで所在を示し、欠けた相対リンクを製品仕様へ読み替えない。

実装者とauditorは読んだsource、実装の該当画面・意図的差分、検証画像path/viewport/操作を出力する。実装後の証拠は `testdata/runtime/dev-control/<session>/evidence/<run>/` に保存し、承認参照画像を上書きしない。秘密tokenや本人の無関係情報を公開成果物へ混ぜない。既定ではruntimeはgit管理外とし、レビュー用に選ぶ画像だけを内容確認後にdocsへ保存する。

本manifestと計画が存在してもPhase Cは未許可。ユーザーによる別途明示開始指示とC Kickoffが必要。
