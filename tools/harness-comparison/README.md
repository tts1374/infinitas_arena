# Issue #198 comparison tools

目的は固定した旧方式／v2の実Codexセッションを別repo・fresh contextで比較し、失敗も保存すること。採用を結論として組み込まない。正本と停止状態は[比較結果](../../docs/harness-v2/comparison-results.md)を参照する。

`compare.py`が固定revision・runtime照合、seed、開始状態、実CLI、120分上限を管理する。`freeze.py`は同じNodeと入力を固定、`verify_frozen.py`がignored入力も開始前照合する。`profile_probe.py`は実execと同じprofile解決、`environment.py`は補助read-backであり、後者のapp-server設定を実execの有効設定と同一視しない。

`collect.py`は実provider counterと親子identityを関連付け、未完・error・リンク欠落の総量をnullにする。`retry.py`はproviderの利用制限による中断だけをfresh環境へ1回再試行できるよう準備し、元台帳を継承する。内部検証再実行と新しい全セッション再試行は区別する。

`browser_fixture.mjs`／`visual-fixture.tsx`はC1の実React表示と操作、`c2-barrier.test.mjs`は実lobby routeの非同期競合の共通fixture。後者は単体テストであり、process restartやhibernationの代用ではない。`probes.py`は固定判断入力、`score_probes.py`は判断の正誤だけを採点する。

`evidence.py`／`blind.py`／`trace_packet.py`は実行者申告と独立評価を分ける。`bundle.py`は明示されたowned実験から収録し、原hashと公開hashを残す。`redact.py`は公開時の補助で、実行時漏出を防いだ証明や失敗runの合格化には使わない。任意の秘密を完全に検出する機能ではない。

現在、重大所見により実験には`experiment-hold.json`を保存済み。launcherは新しいモデル起動を拒否する。新revision・対称な条件変更と再試験計画を固定する前にC3／反復を起動しない。固定v2を編集して比較し直したようには扱わない。比較中のGitHub writeや製品への合成変更の取り込みは禁止。

明示テスト（通常のnpm test/typecheckではPythonを検証しない）:

```powershell
python -B -m unittest discover -s tools/harness-comparison -p test_compare.py
```

実行レシピ・入力・実CLI引数・setup記録は保存済みmanifest／invocation／read-backを正とする。外部認証はコピー・公開しない。元実験を上書きせず、結果PRの公開はモデルセッション終了後の別工程にする。
