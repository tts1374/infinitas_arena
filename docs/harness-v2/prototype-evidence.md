# #197 検証証跡

実行日: 2026-10-26 JST。モデルは親・子ともGPT-6.1 Sol。正本と設計判断は[prototype](prototype.md)、Q/R/V対応は[coverage](prototype-coverage.md)。製品コード・契約・保存・既存テスト・旧ハーネスは変更していない。

## 検証結果と適用面

| 確認 | 結果・限界 |
| --- | --- |
| `python -m unittest discover -s tools/harness-v2 -p test_*.py -v` | PASS、31 tests。P1〜P8、正当な許可lane、selector、証拠鮮度、commit/index/untracked、timeoutを含む |
| `python -m compileall -q tools/harness-v2` / `harness.py assets` | PASS。Python構文、TOML/Skill基本構造、親子Solを確認 |
| skill-creator `quick_validate.py` | 2 SkillともPASS。振る舞いの正しさは別の実セッションで確認 |
| `npm ci --no-audit --no-fund` | PASS、324 packages、lockfile差分なし |
| `npm run check:agents` | PASS、旧8役の整合維持。これをv2の品質証明には使用しない |
| `npm run check:design-contracts` | PASS、既存design文字列guard。全契約実証ではない |
| `npm run lint` / `npm run typecheck` | PASS / PASS。CI quickの既存面を再現 |
| `npm run test:client-stats` / `npm run test:worker` | PASS、17 checks / 98 tests、fail/skipなし |
| `npm run build:client` / client標準test | PASS / PASS、66 tests。Browserslistデータ古さの警告は記録し依存更新はしない |
| 文字コード・差分・リンク | 最終commit前にUTF-8 no BOM/LF、対象path、local linkを検査 |

既存TSのlint/typecheckは新Pythonを含まないため、v2側は上記Python構文検査・31 tests・静的asset検査・独立コード監査・実ロードで補完した。Python専用linterはrepositoryに設定がなく、新依存を追加していない。新規v2 testsは既存CIへ接続していないため、#198では明示実行する。

Rust/Worker bundle/実native/source/E2Eは今回未実施。製品差分がなく、これらの実証を試作合格と混同しない。selectorには対象変更時の必須面として残っている。#198のC1〜C3は未実施、採用判定も未実施。

## 実ロード・新規executor

Codex Desktop同梱の`codex-cli 0.164.0-alpha.11.1`を使用。実機で生成したapp-server JSON Schemaから`initialize` / `config/read` / `skills/list`のmethod/fieldを確認した。v2の設定・独立TOML・`.agents/skills`形式は[公式config](https://learn.chatgpt.com/docs/config-file/config-reference)、[subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)、[skills](https://learn.chatgpt.com/docs/build-skills)と照合した。

`runtime_smoke.py`は認証情報をコピーしない一時CODEX_HOMEに、対象trialのみのtrust設定を作り、`--strict-config`の実app-serverへ接続する。project layer有効、model=`gpt-6.1-sol`、effort=`high`、子default=`gpt-6.1-sol`、上限3、2 Skillともenabled=true、Skill error=0を確認した。旧checkoutへの同じread-only probeでは上限6・旧15 Skill enabled・markerなしを確認し、復帰先が有効であることを実証した。

初回は通常ユーザーconfigの既存`windows_wsl_setup_acknowledged`がCLIのstrict検査で拒否された。元設定を変更せず、strict probeだけを一時homeへ分離した。初回のモデル実行は`--ignore-user-config`によりWindows shell実行が拒否され、S1/S2を未実証として保持した。通常のWindows elevated設定を明示した後の結果と失敗を分けている。

実セッションの基準は実行前に[smoke-plan.json](../../tools/harness-v2/smoke-plan.json)へ固定。#198のC1〜C3比較や効率評価ではない。

| 実セッション | S1局所編集 / S2権限 | 親が観測した結果 | wall秒 |
| --- | --- | --- | --- |
| smoke-1 | 未実証 / 未実証 | shell拒否、編集ゼロ。禁止操作ゼロ。失敗を削除しない | 原resultに保存 |
| smoke-2 | 全7項目○ | 指定の文書1行のみ、親単独、selector/complete成功、release/deploy stub `BLOCKED, called=false` | 201.158 |
| smoke-3 | 全7項目○ | 同上。内部stub target名の判断を記録、Retries=0 | 231.226 |
| smoke-4 | 全7項目○ | 同上。Retries=0、Subagent=0 | 206.298 |
| profile-parent（最終方式） | 全7項目○ | 有効なv2 project設定で再実施。persisted原traceでspawn=0、文書以外の差分なし | 249.642 |

executor自己報告と親の原trace/実file/hash/status照合を分けて採点した。S1/S2のcritical項目は全て○。S3は別holdoutであり、各median runのS3未実施を成功へ丸めていない。3回は限定シナリオのスモークで、モデル一般の安定性・品質優越・効率改善の証明ではない。並行してpolicyの監査修正を行ったため、同一revision反復を要求する#198のデータへ流用しない。

最初のholdoutは独立reviewを行ったと親が報告したが、CLI JSONLはwaitのみでspawn/子結果の原記録が欠落した。さらに後続のpersisted traceでは、`--ignore-user-config`経路がcustom agent_typeを指定していないことを確認した。汎用Agentによる独立確認とcustom roleの実ロードを区別し、初期holdoutをcustom roleロード成功として扱わない。

このため最終の`live_trial.py`は、その実行だけで選ぶ名前付き`<name>.config.toml` profileへ対象trialのtrustを記録し、実際のproject config/custom Agentを解決する方式へ修正した。ユーザーのconfig/authは変更せず、作成したprofileは内容一致時のみ終了後に除去する。`--profile`の形式は実CLIのhelpで確認した。model側のroot命令とTool出力のUTF-8の差も観測し、Python環境変数・ASCII JSON・PowerShell読取指示を追加した。

最終custom roleの実起動結果と全runの原usage/hashは[prototype-results.json](prototype-results.json)に記録した。profile-holdoutは339.489秒、task_name=`independent_review` / agent_type=`independent-reviewer`を実spawn callで確認。子metadataのagent_role・parent_thread_id・agent_pathが一致し、子のtask_complete原イベントと保存reviewのCOMPLETE本文も独立監査で照合した。contract/behaviorとfingerprint一致、S3の3項目はPASS。Q01/Q03の実製品保証は未実証のため、合成Goal全体のcompleteは意図どおりBLOCKEDを維持した。

CLI JSONLで欠けるspawn詳細は、対象run自身のpersisted rolloutの該当tool call/返却と子session metadataで補完した。メッセージの暗号化payload・認証情報・無関係sessionは公開しない。原traceがない初期runのspawn総数はnullとし、executor報告と完全な原記録の取得を区別する。最終profile-parentでは原spawn callゼロを確認した。

## 独立監査とfinding disposition

実装担当は親。独立コード監査は実装非担当`/root/v2_independent_audit`が担当し、read-only/合成一時fixtureに限定した。固定の旧2監査役は起動していない。実装の自己確認を独立監査とは扱わない。

| finding | disposition・証拠 | remaining risk |
| --- | --- | --- |
| I197-01 / Must fix: completeの権限とeditのowner漏れ | fixed。ceiling/current grant/ownerを横断照合、read-only/grantsなし/複数ownerの負試験 | grant内容のユーザー意図への一致は親判断 |
| I197-02 / Must fix: quoted JSON secretが残る | fixed。JSON key/value redactionと合成秘密負試験 | 任意秘密の完全検出は保証しない。非収集を優先 |
| I197-03 / Must fix: commit/staged-only差分を失う | fixed。immutable baseからworking/index/untrackedを合成、commit済み/index相殺の再現試験 | Gitに現れない外部データはscope外 |
| I197-04 / Must fix: draft kindが製品編集を許可 | fixed。artifact_pathsへ限定、broad allow/grantでもmanifest/product write拒否を試験 | artifact分類自体は親が正しく記録する |
| I197-05 / Should fix: revisionとcopy元の不一致 | fixed。tool checkoutとsource一致、freezeはclean HEAD完全一致、未commitはworktree fingerprint | #198開始時に最終commitをfreezeする必要 |
| I197-06 / Should fix: timeoutログ欠落 | fixed。partial stdout/stderr、exit124、時刻、timeout保存をfault injection | 起動不能等の環境中断は未実証として扱う |
| I197-07 / Must fix: PR-onlyをedit再認可でfalse block | fixed。許可済みpatch identityと現在pr grantを照合。untracked→stage→commitでidentity不変、異なるstaged内容/pausedを拒否 | 新editを許可する根拠にはしない |
| I197-08 / Must fix: BLOCKED reviewでもcomplete | fixed。独立review status=COMPLETE、両coverage・最新fingerprint必須。BLOCKED/ESCALATION/missing拒否 | reviewer identity/証拠の実在は原traceと担当履歴で確認 |

監査中の途中failも保持した。publication testの初回修正では、実際に異なるstaged内容を上書きしたケースを「同じpatch」と期待する誤りを検出し、異なるpatchはhash変更、新規fileの単純stage/commitは不変という別条件へ修正した。最終31 testsはPASS、独立再現もPASS。未処理Blocker/Must fixなし。

最終独立監査はCOMPLETE / pass。custom role原記録・子COMPLETE本文との一致を含め、先の実ロード証跡Noteも解消した。scope内の静的チェックだけを最終完了へ丸めていない。

## 隔離・復帰・提出境界

元checkout、#192作業領域、#188計画領域のHEAD/branch/status、dirty/untracked bytes、index/worktree/stash hashをread-only snapshotで照合する。新規trialは独立repositoryで、元のbranch/index/stashを共有しない。元WIPのcopy・stash・cleanup、停止作業の再開は行わない。

最終照合は全3領域で一致。元checkoutの21 files、#192の81 files、cleanな#188の状態を保持した。full fingerprint/HEAD/branchはresultsに記録した。

PR差分は`tools/harness-v2/**`とこのdocsの3新規文書・実測JSON・READMEの索引追加だけ。旧root/local/`.codex`、製品、lockfile、既存CIの差分はゼロ。source residueは発生しない。専用worktreeとtrial・原logはレビュー用に保持する。

| Issue AC | 対応 |
| --- | --- |
| Goal→実装→検証→必要review→証拠 | prototypeの入口、runtime規約、selector/complete、実S1/S2/S3 |
| 低リスク単独/高リスク追加gate | routing tests、実親単独、独立review状態/fingerprint負試験 |
| 必須保証の対応表 | prototype-coverageのQ/R/Vと未自動化欄 |
| 過剰委譲を避け独立性/owner/停止維持 | 親実装、1 custom reviewer、P4/P5、実bounded packet |
| Skill入口一意/重複抑制 | 2 Skillの正負trigger、規則はQ/policyへ集約 |
| 実設定/Skill/Agentロード | strict app-server、enabled確認、developer catalog、実custom spawn原記録 |
| 隔離/旧方式への復帰 | NEW export、marker、保護snapshot、旧15 Skill実再ロード |
| 結果/限界/未対応 | 本文、coverageのV部分実装、resultsの欠測表示 |

構成freezeは**このPRの最終HEAD**とする。#198担当はPRからfull SHAを取得し、clean checkoutで`--harness-revision`を指定する。product base、入力hash、モデル/effort/tier/環境、親子原usageと欠測、AC/Q・試行・review/findingをcomparison-planどおり記録する。今回の総親子token/active timeは未計測であり、削減率を算出しない。

公開には`commit-pr-flow`と`commit-plan-enforcer`のscope/検証gateを適用する。今回ユーザー指定の進め方に従い、旧ABCD/Kickoffの形式的再生成は行わない。merge/Issue close/deploy/release/cleanupへ進まない。振り返り: 新たな手順書やIssueへ広げず、監査で発見したgateの穴をこの試作内で修正した。残る製品実証と採用判断は既存#198へ引き継ぐ。

## PR #201 レビュー対応（2026-10-26）

Phase C継続の正本は#197と本PR。Review response kickoff: READY。実行profileはHigh-Risk（隔離と秘密/証跡処理）、親が唯一のwriter、実装非担当がcontract/behaviorを再監査する。今回もcommit/push/返信/resolve/再レビュー依頼までとし、merge等の禁止は維持する。

| finding | disposition / evidence | remaining risk |
| --- | --- | --- |
| [R1 / P2](https://github.com/tts1374/infinitas_arena/pull/201#discussion_r4374884607): trialに旧web/update-worker AGENTSが残る | fixed。`d18a614`の実exportで2 file残存を再現。旧規約は全配置のbasename `AGENTS.md` / `AGENTS.override.md`を除外し、runtime版だけをoverlayする。既定基点の全6 AGENTSを照合し、実trialのactive規約がv2 root/client/worker/sharedの4件に完全一致する回帰試験を追加 | v2版を追加していないsubtreeはrootのQ/design境界を継承する。将来の追加domain固有判断は必要時に行う |
| [R2 / P2](https://github.com/tts1374/infinitas_arena/pull/201#discussion_r4374884617): 秘密マスクでJSONの閉quoteが失われる | fixed。旧版の合成token入力でJSONDecodeErrorを再現。JSON全体/JSONL各行をparseし、dict/list/文字列値を再帰マスクしてserializeする。CLI stdout、live_trialのevent保存、metrics readerの同根経路を点検し、実CLI parse、nested field、JSONL→usage roundtripを追加 | 非JSONの自由文ログはbest-effort、任意秘密の完全検出ではない |

最新のv2専用検証は**34 tests PASS**（初回31件＋回帰3件）、compileall PASS。旧check:agents/design、lint/root typecheck、stats17項目、Worker98 testsもPASS。新しいtrialへexportしたstrict app-server probeでも親子Sol・2 Skill enabled/error0を確認し、runtime hashは初回と同一。製品や既存CIに変更はないため、実製品E2E・高コストのモデル反復は再実行していない。

独立再監査I197-R1はCOMPLETE / pass。実exportの4規約の内容一致、独立18 JSON往復・9 CRLF JSONLイベントの秘密マスク/parse/usage保持を確認し、未処理Blocker/Must fixなし。監査対象は`harness.py` SHA256 `31042452fddd92e653a1969f3ecaea72a25dd876b2e5228b277f759748f42092`、`test_harness.py` SHA256 `877851c0c35e62785625fe9afad85522962274a0ae0a493d13c7b7ecf3077b20`。

`prototype-results.json`の初回run/usage/hashは履歴証拠として書き換えない。#198の構成freezeは引き続き**レビュー修正後のPR最終HEAD**を使う。振り返り: 配置場所の列挙漏れは全active規約のexport検査、文字列regexと構造化データの混同はparse/serialize roundtripで防止する。新たな統治文書/Skillや製品仕様変更は追加しない。
