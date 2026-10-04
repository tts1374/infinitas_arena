# #188 体験再設計 — Phase Aからの引き継ぎ

状態: Phase A `COMPLETE` / specification readiness `READY`。2026-10-04 JST、全体案への「良いのではなかろうか。」を最終合意として記録。今回の作業はここで停止。Bは未着手。

## 参照する正本と証拠

リポジトリ: `C:/work/infinitas_arena/infinitas_arena`
設計資料: `C:/work/infinitas_arena/infinitas_arena/docs/ux/issue-188-redesign/`

- `issue-188-draft.md`: 合意済みの全体仕様、維持/変更の区別、観測可能な受入条件。GitHub未反映。
- `phase-a-review.md`: 最終合意・readiness、留保事項、#188追記/コメント原稿。
- `prototype-review.md`: 通常対戦の参照対応、主要導線、役割別操作、確認操作、試作の見方。
- `source-review.md`: #188・#189・規範文書・現行画面との照合。
- `validation.md`: 視覚・操作確認と検証の限界。旧版の記録は履歴として保持。
- `reference/issue-188.json` / `reference/pr-189.json`: 取得時の参照スナップショット。

合意済みのクリック試作:
`C:/Users/tts13/.codex/visualizations/2026/10/04/01a105aa-dfe2-7d82-a3ae-e34f7aeb6247/event-host-led-prototype.html`
確認用の独立ページ:
`C:/Users/tts13/.codex/visualizations/2026/10/04/01a105aa-dfe2-7d82-a3ae-e34f7aeb6247/event-host-led-preview.html`
現在のローカルURL: `http://127.0.0.1:18988/event-host-led-preview.html`。サーバーの稼働は別チャット時点で再確認する。原本ファイルを正本とし、URLの生存に依存しない。

## 確定した骨格

Topは通常対戦、開催は専用ページ。作成/参加の2入口、開催ID＋コード入力。通常対戦の曲/難易度ヘッダー・プレイヤーカード・下部主操作・右の曲履歴/補助管理・順位カードを生かす。重要操作は対応表の確認付き。

毎曲Readyと別の連続参加設定を廃止。参加＝Host進行に合わせて遊ぶ意思とし、曲・開始は通話/配信で共有してHostが開始する。参加者には毎曲のアプリ操作を要求しない。
休憩は通話で申告。休憩・参加者切断でも席と当該曲対象を残し、Hostが待つか進めるか判断する。未提出締切で欠場・大会0pt。自動除外・自動欠場・休憩ボタン・Hostの個人別欠場指定は追加しない。
上限20、専任/兼任Host、固定N、同点、最初の有効提出、結果秘匿、復帰、Host切断5分、無効化、端末履歴・通常統計との分離は維持する。

## 残る事項

未解決の仕様Blocker/Must fixなし。招待文一括貼り付けとアプリ音声通知は必須範囲から外した改善候補。微細な文言/寸法は合意した意味と情報階層を変えない調整事項。
PR #189の再利用・修正・書き直しは未判断。新設計との相違、コードの品質・契約・検証で判断し、モデル世代を根拠にしない。実通信/実連携/実時計/多端末保存は試作で検証していない。

## 後続チャットの境界

Bを別チャットで明示的に開始するときは、本引き継ぎと合意済み原稿・試作を起点にする。GitHub #188、製品規範01/02/06、旧 `tasks/issue-188-host-event-mode.md` / PR #189には毎曲Readyの旧前提が残る。旧B計画や旧READY記録を新設計の正本にしない。
今回、製品コード・GitHub・既存PRは変更せず、commitも行っていない。設計資料は `docs/ux/` の未追跡ファイルとして保存済み。既存の未追跡 `target-e2e/` はユーザーの作業として保持する。新チャットの作成も行っていない。
本引き継ぎはPhase Bの詳細計画やC Kickoffではなく、Phase Aの成果物一覧と境界の記録。後続の開始許可を代替しない。
