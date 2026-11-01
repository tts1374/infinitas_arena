# 2026-10-27 中間証跡

判定の入口は[比較結果](../../comparison-results.md)。Issue全体はBLOCKED、C3/反復は未実行。

- `checkpoint-2.json`が9実セッションの最新集計。`checkpoint-1.json`は旧C2再試行中の途中保存であり、両方を足し合わせない。
- `independent-audits.json`は親が独立監査の返却を記録したもの。実行者自己申告と異なるfail判定も残す。
- `evidence/inventory.json`は収録元・原SHA256・公開SHA256・伏せ字有無。入力・seedの原byteは変更しない。原CLI／persisted session全履歴は収録しない。
- `publication-verification.json`は334ファイルの原／公開hash一致、既知の実runtime値の非残存、JSONと文字コード検査。任意秘密の完全検出の証明ではない。
- `experiment-holds.json`は証跡bundle作成後に追加した停止状態。launcherはholdがあればモデル起動前に拒否する。再開のためにholdを削除して旧条件を使わない。
- `validation*.json`は報告用workspaceの検証。実験runの検証は各archive／blind packet内に分離する。最新は親の19 tests pass、外部監査は変更前の18 testsと識別子保全までを独立確認した。
- `diff-validation-final.json`：通常の`git diff --check`はexit 2。原logの末尾空白／末尾空行とpatch空行contextの112件に限定され、全件収録hash一致を確認した。原byteを整形せず保全する例外で、証跡以外の差分検査はexit 0。最初の狭い分類で不足した記録も`diff-validation.json`に残す。
- `environment-final.json`は最後の補助read-back。開始時点の実exec profile／traceとは区別する。

同じrunのarchiveを複数保存した箇所は履歴であり、追加runではない。特にC1 v2中断は`interrupted-final-counter-policy`が最新で、旧archiveの未完counterを総量と扱わない。Pの`execution-audit.json`は旧redactorが4つのIDを誤maskした版で、`execution-audit-v2.json`が識別子保全済み。入力原本・scoringは不変である。

C1/C2 packetのA/B対応キーは別ファイル。監査はキー／費用の確認前に採点し、対応はその後に照合した。C2 supplementは元packetを上書きせず、同じ選択ルールで実restartとbarrier証跡を補った。実hibernationの証明にはしない。
