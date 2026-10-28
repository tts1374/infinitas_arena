# #192 開発用コントロール窓 — 凍結参照とprivate制御契約

2026-10-23 JST。T0の成果物。目的は、承認済みの同一資料と既存製品契約を後続実装・独立監査へ渡すこと。製品機能・実通信の合格証拠ではない。

- 合意時点: 2026-10-18。`issue-192-correction-review.md`とdraftのユーザー全体合意が最新根拠。
- 原本root: `C:/Users/tts13/.codex/visualizations/2026/10/17/01a14a57-d0ac-7fd0-8093-6fcd2f4a05bf/`。
- 製品基点: `C:/Users/tts13/.codex/worktrees/issue-188-phase-c-host-led/infinitas_arena`。
- T0開始read-back: branch `codex/issue-192-dev-control`、HEAD `0dac1b02d3b23d9449d1e63d7ca3f822f98f9e50`。dirtyは指定計画Markdown4件のみ。`codex/issue-188-phase-c-host-led`の内容を同じworktreeで保持した#192専用branch。既定`v1`への置換なし。
- 正本計画: [実行計画](../../../tasks/issue-192-dev-control-window.md)、[bounded packets](../../../tasks/issue-192-dev-control-tasks.md)、[検証台帳](../../../tasks/issue-192-dev-control-validation.md)、[source manifest](../../../tasks/issue-192-design-source-manifest.md)。
- 現request ceiling: ユーザーの明示指示によりPhase C Kickoff・実装・検証・独立監査まで。計画のC開始解除条件は充足済み。commit/push/PR/merge/Issue close/deployは許可外。T0担当は本scopeの凍結参照と制御境界作成で停止し、実装は各ownerへ渡す。

`phase-a/`の13件は原本を同byteで複写したもの。文書・HTMLを編集しない。HTMLは静的な設計参照であり、状態ジャンプ・固定配列・仮受付・仮保存を実装へ移植しない。組立fragmentは今回複写不要と判断した。編集が必要な場合の由来は原本rootの`issue-192-v3-surface.html`、`issue-192-v3-behavior.js`、`issue-192-v3-presentation.js`、`assemble-issue-192-v3.py`を参照する。

旧concept/render、旧試作と旧レビューの未処理判定、合意前の待機判定は履歴。最新UI正本は補正後v3 HTMLと操作表、最新の視覚証拠はcorrected画像7件。凍結文書内の相対リンクが旧履歴を指す場合は原本rootで読む。リンクの不足を新しい製品仕様へ読み替えない。

## T0のbyte/hash照合

原本13件をすべてmanifestと照合した後に複写し、複写先を再度長さ/SHA256照合。13/13一致。照合はPowerShellの`Get-Item`/`Get-FileHash -Algorithm SHA256`、複写は`.NET File.Copy`。原本への書込なし。

| 凍結ファイル（phase-a相対） | bytes | SHA256 |
| --- | ---: | --- |
| issue-192-phase-a-draft.md | 40606 | CB6482BDCBDC34A9B5271DE4C1AA5DA0CB8EDFCB7894833CA16015074B230A30 |
| issue-192-operation-matrix.md | 24893 | 2A1CE3F6B1818DC13AD82CA07842F7A3DA92128FF2BEDD1049DF6E07FB0B0163 |
| issue-192-control-window-v3.html | 50857 | 6C7093E7686B1EAA881E490000368C67EED8521423DF9F4A623BF447110498F3 |
| issue-192-correction-review.md | 11878 | 31EFD1D45C02813FCA1B9C7E754884503A9548709FF3FD0924B63591BF2695EC |
| issue-192-rereview-contract.md | 11973 | 304A96DC91E46706741D5AFFE315A5ECCB6BEB07D0C7DF11E9CB394E782737F6 |
| issue-192-rereview-ux.md | 15020 | 24E3472F17048202142610DC9E8DFDC660EB9877A5420E2C88CC8E0015A085D2 |
| issue-192-corrected-confirmation.png | 137416 | 7BF93536BF9E67B3ABE6DAF013944E56DA1539BEE0D620C20CAC56982E03A39D |
| issue-192-corrected-default.png | 91645 | 53F01577CE0747A6994238088D9B783AD357F96F32B3C4FEE5DF2891E75E49D0 |
| issue-192-corrected-input-route.png | 139028 | FBD07F172C71074BDC277103961046D7161705CF04103BB7B877B0D11C10EED4 |
| issue-192-corrected-mobile-footer.png | 8382 | BFBB5B90A58F957A5A2D17103AAD4BEAD4AE1E07E694EECBE83DF79E7C76A9E1 |
| issue-192-corrected-mobile.png | 42205 | E18589AB651388078B06AA1CA90486643B4410AC7DEAAA315A51F222791D3F62 |
| issue-192-corrected-preparation.png | 111147 | 1EA108E8F91DB7125D93A8D5C778659D70794C50008091A4C70F1C2A7FF8D3D2 |
| issue-192-corrected-status.png | 107718 | DDEAD39F6E09D8DC2B46B73DE5D2320E94F90270B0D639576A1D0922E5622B15 |

## 後続の境界

[control-boundary.md](control-boundary.md)にprivate DTO・role・allowlist・受付/失敗の区別を固定する。製品のWS/FSM/source規範を変更しない。操作表N0〜N6/E0〜E6全行と製品型を対比した。独立contract-auditorのT0 checkpoint後にT1へ渡す。

実装証拠は`testdata/runtime/dev-control/<session>/evidence/<run>/`へ別保存し、承認画像を上書きしない。本人実プレー、3sourceの実client経路、実窓・保存・停止・配布版拒否はT0では未実証。同期する値欄2組はUX-RN-03のNoteとして保持し、値編集の到達性を削らない。
