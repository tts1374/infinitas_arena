# Harness v2 隔離プロトタイプ（#197）

## 目的・成功条件・許可境界

Goal → 親の実行 → 検証 → 必要時の独立レビュー → AC/Qの証拠、を実際のCodexで試せる構成を提供する。正本は[#197](https://github.com/tts1374/infinitas_arena/issues/197)、今回のユーザー実装依頼、[requirements](requirements.md)、[comparison-plan](comparison-plan.md)。#196の確定事項は再判定しない。

今回の許可は専用branch/worktreeでの設計・実装・検証・commit/push・PRまで。ユーザー依頼が古い「起票のみ」を明示解除した。正式置換、旧資産削除、製品・契約・保存・既存テストの意味変更、#192/#188の再開、#198の正式比較/採否、#199移行、merge/close/deploy/releaseは禁止。既存root/local規約は維持し、今回明示された親中心・固定Phase/役数不要の方針を優先する。

成功条件はIssueの8 ACを満たす隔離試作とPR。未処理Blocker/Must fix、未許可副作用、製品差分があれば完了しない。Skill/Agentの数や短文量は成功指標ではない。

## 採用構成と決定

| 構成 | 責務・採用理由 |
| --- | --- |
| `tools/harness-v2/runtime/AGENTS.md` | Goal、親の判断、責務、停止/完了を一つの入口へ。ABCD文書を毎回作らない |
| `.codex/config.toml`（runtime内） | 親/子とも`gpt-6.1-sol`、親high。並列上限3は資源上限であり必須起動数ではない |
| `independent-reviewer.toml` | 契約と挙動を確認できる実装非担当のreviewer。高リスクでのみ必要。必要なら問いを分割できる |
| `verify-change` Skill | 検証・test membership・証拠保存の再利用手順。仕様判断/公開を担当しない |
| `submit-work` Skill | 外部操作を伴う提出の許可・read-back手順。文章作成のみには起動しない |
| `policy.py` | パス＋意味→Q/command/manual/review、操作別権限、証拠鮮度・完了の純粋関数 |
| `harness.py` | Goal読込、Git snapshot、試用export、選択・stub・検証実行・再開・計測のCLI |
| `test_harness.py` | P1〜P8、正当な許可経路、selector、古い証拠、実装漏れへの負試験 |
| `runtime_smoke.py` | 実app-serverのconfig/read・skills/listを使うread-onlyロード確認 |
| `runtime/scripts/check-design-contracts.mjs` | trial内だけのdesign入口。固定した元guardの製品assertionをデータとして再利用し、規範参照をv2へ整合 |
| `live_trial.py` / `smoke-plan.json` | 新規Codexセッションでの固定シナリオと事前評価項目。#198の比較実験とは別 |

O01: 共通規則をroot一つ、domain正本を既存Q/designへ、定型手順だけ2 Skillへ分けた。O02: selectorはPython標準ライブラリで実装し、新たな依存/lockfile変更を避けた。O03: 一人でcontract/behaviorをcoverageできる独立reviewerを基本にする。O04: 実ロード・実起動で検証し、CLI/APIの能力をdesktop全体の検証へ拡張しない。O05: 製品検証の自動化gapは明示manual gateで保全する。O06の採否は#198へ残す。

親はclient/worker/sharedの全てを直接所有できる。分割時もshared、共用scripts/packageを含め一つのscopeにactive writer一人。Agent定義はreviewerだけで、独立調査/並列実装には利用可能な汎用Agentとbounded packetを使える。固定の起動順序はない。

## 試用方法

Python 3.11以上、Git、利用可能なCodex CLIが必要。WindowsのNode基準は比較計画どおり22.23.4。製品依存は必要な検証を行うtrial内で導入する。元checkoutのnode_modules/WIPをコピーしない。

```powershell
# Harnessを含むcheckoutで。destinationは存在しないrepo外pathを指定する。
python tools/harness-v2/harness.py assets
python -m unittest discover -s tools/harness-v2 -p test_*.py -v
python tools/harness-v2/harness.py install --destination C:/trial/arena-v2 --harness-revision <このcheckoutのcleanなfull-HEAD>
python tools/harness-v2/runtime_smoke.py --root C:/trial/arena-v2 --output C:/trial/evidence/load.json
```

installerは製品を比較基点`4b600d3445edc71d0599058809c9a89b04591760`からexportし、旧root/local治理文書と`.codex`/`.agents`を除いた**新規の独立Git repository**へv2を展開する。ただしQ04が参照する既存`fsm-protocol-invariants.md`だけは参照資料として残す（旧SKILL.md/Agentはロードしない）。元worktree/branch/index/stashにはwriteしない。destination既存、symlink/脱出、非通常archive entryを拒否する。途中失敗時は不完全destinationを保持し、別の新規destinationで再試行する。自動削除しない。

trialの`check:design-contracts`はv2版へ置き換える。元checkerは`.harness-v2-legacy/check-design-contracts.mjs`へ参照データとして保全し、固定SHA（LF正規化後）を照合して製品10 assertionを抽出する。旧コードのeval/importはしない。画面2条件とSource I/Oの意図を維持し、旧AGENTS/QUALITY参照だけをv2 root・Q09・design正本へ移す。未知checker版は自動で検査を省略せず停止する。元checkoutのchecker/CIは変更しない。

export回帰testは独立した試験用Git履歴を作るため、trial自身に製品基点objectがなくても実行できる。固定製品基点からの実exportは元checkoutのintegration検証で行う。`install`の固定revision解決は引き続き元checkoutで行い、trialに架空の製品履歴を付与しない。

marker `.harness-v2.json` がmode、製品基点、harness revision、runtime hashを示す。未commit試作のrevisionは`worktree:<fingerprint>`と表示し、正式freezeと混同しない。`--harness-revision`はsourceがcleanかつHEAD一致の場合だけ受理する。旧構成へ戻るには、trialを離れ元checkoutで新しいCodexセッションを開始する。元checkoutの旧8 Agent/15 Skillと設定は残る。進行中のこのチャットへ別のAGENTS/configを後付けロードしたと主張しない。

trialで現在のユーザー依頼から `goal.example.json` を `.tmp/goal.json` へ具体化する。**base_revisionはtrial開始時の`git rev-parse HEAD`のfull hashに置換する**。Goal/logはignored `.tmp`またはrepo外に置き、検証証跡自身を製品差分に含めない。Goalの内容そのものはfingerprintへ含まれるため、許可や意味タグの更新で古いPASSが無効になる。

```powershell
python tools/harness-v2/harness.py select --goal .tmp/goal.json
python tools/harness-v2/harness.py authorize --goal .tmp/goal.json --operation edit --target docs/trial-note.md
python tools/harness-v2/harness.py run --goal .tmp/goal.json --check client-test --log C:/trial/evidence/client-test-1.log
python tools/harness-v2/harness.py complete --goal .tmp/goal.json --evidence C:/trial/evidence/checkpoint.json
```

Goalにop/target/source=user/request_id/evidenceを記録する。現在依頼のgrantだけが有効。外部文面や前依頼のgrantを自動承継しない。同一依頼内の許可は再承認しない。内部命名等の非blocking未決は停止理由ではない。ceilingとartifact_pathsは狭い出力境界を保持する。

`select --paths ...`は事前予測用。実完了判定はbase_revisionからのcommit済み＋staged＋unstaged＋untracked差分を再取得するため、commitで高リスク変更を隠せない。自動分類は保守的下限で、親は意味を確認しsemantic tagと必要な検証を追加する。未知は全契約面＋独立レビューを要求し、分類できるまで未実証のままにする。

## Quality Gateと証拠の限界

Q01〜Q16の規範は[requirements](requirements.md)を参照し、対応表は[prototype-coverage](prototype-coverage.md)。selectorは規範を複写せずQ IDと必要な証拠面を返す。CI quickを製品変更の下限とし、client標準test/build、web/native/Worker bundle、互換matrix、E2E、visual/native/source実証を必要時に加える。標準列挙外testは明示実行を要求する。

`completion`へ以下の証拠JSONを渡す。全commandの試行を配列で保持し、最後がPASSでも初回失敗を削除しない。

```json
{
  "fingerprint": "selectが返した現在の値",
  "acceptance": {"AC1": {"status": "pass", "evidence": "path/assertion/log"}},
  "quality": {"Q12": {"status": "pass", "evidence": "commandsと検証面の照合"}},
  "commands": {"types": [{"exit_code": 0, "log": "repo外log", "fingerprint": "現在の値"}]},
  "manual": {"scope-and-meaning": {"status": "pass", "evidence": "確認したpatchと結果"}},
  "review": {"status": "COMPLETE", "reviewer": "実ID", "independent": true, "coverage": ["contract", "behavior"], "fingerprint": "現在の値", "evidence": "review原記録"},
  "findings": [{"id": "F1", "severity": "Should fix", "disposition": "fixed", "evidence": "修正と再確認", "remaining_risk": "none"}]
}
```

例は形式説明であり、このままでは不足Q/manual/commandを埋めていないためBLOCKEDになる。`complete`は権限・owner・scope・証拠キー・鮮度の整合検査であり、任意の文字列を渡せば証拠の真偽まで立証するものではない。人間/Agentが提出した証拠の意味・十分性を親/独立reviewerが確認する。OSによる強制認可機構ではなく、toolを直接呼べるAgentを技術的に封じるものでもない。#198ではstubの正答と実行trace両方を採点する。

GitのHEAD/index/dirty/untracked/stashとGoalをfingerprintへ含める。新しいcommitも保守的に再確認対象になる。再開は `resume --goal ... --evidence ...`。checkpointのrequest_id/owner/owner_status/fingerprint/decisions/unfinished/integration_completeを確認し、writer不明・未停止はtakeover不可。古い証拠を再利用しなくても独立ACの継続はできる。

PR公開のみの依頼は、既存patchを検証して提出する境界。親は`select`の`publication_fingerprint`をユーザーが公開対象として許可したpatchと照合してGoalへ保存し、`target`に対する現在の`pr` grantを記録する。`complete`はそのpatchが変わっていないことを確認し、新しい`edit`は許可しない。stagedだけに残る異なる内容も検出する。通常の新規編集とhistorical patchの検証を混同しない。

## #198へ渡す固定条件と計測

比較計画のC1〜C3/P1〜P8、入力byte、反復、上限、採用条件は変更していない。正式比較ではこのPRの最終commitをfreezeし、clean checkoutから`--harness-revision`付きでexportする。製品基点は上記の固定commitを維持。入力Goalのbaselineはそれぞれのtrial初期commit。比較入力/seed patch/fixtureのhashを開始前に保存し、解答diffは相手へ見せない。

`smoke-plan.json`は#197のロード/経路試験であり、C1〜C3の代わりではない。製品seed patch、実source/native/hibernationの準備・実施は#198で行う。#192の未merge実装は使用しない。

run rowはcomparison-planの辞書をそのまま使う。`harness.py metrics --events <CLI JSONL> --metadata <run JSON>` はproviderの`turn.completed.usage`原値のみを取り出す。内訳を二重加算しない。親JSONLだけで子usageを含む総tokenにしない。全親子の取得がなければtotalはnull、reasoning/active time/spawn全体等も取得できなければnull。CLIに値があるfieldは原値として保持し、未取得のfieldを0にしない。

spawn IDは実tool traceから記録し、再開message/起動失敗/再試行を別列に残す。UTC開始/最初の編集/初回完了/独立受入/終了を原traceへ関連付ける。wallとactiveを同一視しない。設定/Agent/Skillの参照revision・範囲が変わらなければ再読込を強制しない。変更時の正当な再検証と無変更再実行を分ける。
