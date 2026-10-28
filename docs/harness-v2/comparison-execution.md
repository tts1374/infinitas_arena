# #198 比較実行記録

正本は[comparison-plan](comparison-plan.md)、[requirements](requirements.md)、[#198](https://github.com/tts1374/infinitas_arena/issues/198)と2026-10-26の実行依頼。比較実行・隔離合成変更・結果PRは今回許可された。merge/close/deploy/release/#199は対象外。

## 固定条件

| 項目 | 値 |
| --- | --- |
| 製品・旧ハーネス | `4b600d3445edc71d0599058809c9a89b04591760` |
| v2 | `59b0815dc95738c3e7a14d5505fb58d3df49c460` |
| runtime SHA256（実byte照合済み） | `648761b91359a54556c1fe1e655aaa5408cf5910a752861340b3eabb77157ef2` |
| 親モデル / effort | 両方式 `gpt-6.1-sol` / `high` |
| 子effort | 旧implementer medium、旧auditor high、v2 reviewer high。v2親による実装highとの交絡を残す |
| service tier | 明示overrideなし。effective read-backのnullは未取得として保持 |
| CLI | `0.164.0-alpha.11.1`（Desktop同梱） |
| 旧active定義 | 8 Agent / 15 project Skill |
| v2 active定義 | independent-reviewer / 2 project Skill。旧SKILL/Agent/全配置の旧AGENTSを除外 |
| 割付 | seed `19820261026`、C1旧→v2 / C2 v2→旧 / C3 v2→旧。その後の予定もscheduleに保存 |
| 上限 | 各run wall120分、case/laneの環境再試行1回。無限retryなし |

各trialは別Git repository・新規context・clean checkpoint。旧方式は基点をそのままexport、v2は固定installerで同じ製品基点へruntimeをoverlayした。製品/fixture/seed/共通指示のhashを照合した。v2のdesign guard adapterは#197で確定済みの差として保持し、旧8役validatorへ合わせるための定義混在は行わない。

Node/npm/CLI/Rust/browser/Tauri、config/skills/agent資産、初期HEADとinput/seed/hashはmanifestとsetup原記録を参照する。実行プロファイルのtrustは新規trialに限る一時profileで指定し、内容一致時だけ除去する。app-serverは`--profile`を受理せず、session-flagのtrustではproject設定を有効にしなかった。旧probeのagents=null/disabledReasonは実exec設定の証明に使わない。`profile_probe.py`が実行時と同じprofile・overrideを`codex debug prompt-input`へ渡し、v2は親含む4枠（子上限3）、旧は7枠（子上限6）の実解決を確認する。モデル/effortとcustom role実使用は実sessionのtraceで別確認する。ユーザーconfigには変更を加えない。

## 環境revisionと失敗の保存

準備失敗`issue198-20261026-a`はC1 seedの引用符assertionで停止した。seedを適用する前の製品を基点referenceとして使用し、失敗を削除しなかった。最初の基点browser captureはfavicon404を記録、合成HTMLのfavicon修正後の別capture `reference-2`で12条件の取得を確認した。

`I198-conditions-1`（実験`issue198-20261026-b`）では、準備側Node22.23.4に対し実CLI shellがNode25.6.1へfallbackし、workspace-write制限で既設Playwrightと標準Vite buildの読取に失敗した。旧C1だけ実行し、指定環境を満たす有効runには数えない。executorはUI未実証と独立監査のBlockerを理由にBLOCKEDを返した。表示修正・試験・失敗・補完buildは保存し、v2の性能との比較には使わない。

`I198-conditions-2`（実験`issue198-20261026-c`）では、両方式の各trial内へ同一Node22.23.4/npm10.9.9を配置し、shellのPATHと実行冒頭のread-back guardを追加した。両方式とも同じlocal実行権限とし、MCP/apps/pluginsを無効化。広い実行能力から他worktree・秘密・外部writeの許可は追加しない。旧C1は環境再試行を1回消費、以後の同case/lane再試行は禁止。条件1の失敗・usageは残し、C2/C3やv2は条件2のfresh環境から始める。Goal・AC・seed・品質基準・固定v2は変更していない。

基点のmodalは0/65を`0:00`/`1:05`と表示するが、確定計画のACは`00:00`/`01:05`。基点画像には実値を保存し、両方式のACは変更しない。320幅のnullの折返しも既存referenceへ残し、helperのDOM PASSだけで視覚全体の合格を主張しない。

## 計測の定義

原CLIイベントと親子persisted traceのID・provider usage・UTCを関連付ける。cached input/reasoning等は内訳でありtotalへ二重加算しない。親のみのusage、子を含む総量、欠損を分ける。最新turn完了・全子リンク・有効counterが揃わなければ総量はnull。wallからactiveを推定しない。実験外の準備・ツール監査Agentは比較runの起動数へ含めず、準備総usageは未計測。

条件1のcaptureは固定redactionが改行を落とした隣接JSONになった。原ファイルを保全し、`collect.events`のJSON decoderで値を変えずに復元した。旧runnerのmetricsが終了後に例外となったため、CLI終了wallは未計測、開始UTC→persisted親task_completeの実測時間を別項目にした。条件2は改行を保存し、差分とcheckpointを計測解析より先に保存する。

run rowはexecutor自己申告と独立評価を分離する。未実証、起動失敗、初回test失敗、再実行、環境中断を削除しない。C2のunit cold instanceを実hibernationへ、C3の直接WSを実watcherへ拡張しない。P1〜P8は同じ入力のread-only判断プローブで、実操作や自己申告だけから全保証の合格にはしない。

2026-10-27 JSTの再開ではCLI版・指定model・runtimeを維持した。条件2のv2 C1初回はusage limitで31.736秒後に失敗している。親の最後のprovider counter（71,539 tokens）は部分観測として保持し、error付きtask_completeを最終総量と扱わない。別のclean exportで環境再試行1回を用意し、case/lane台帳を元実験へ追記した。旧C1とv2 C1はそれぞれ再試行枠を消費済みで、以後はdirectoryを変えても上限をリセットしない。

## 比較ツールの独立監査

| finding | disposition / evidence | remaining risk |
| --- | --- | --- |
| I198-T01 Must fix: 隣接JSONで終了記録前に例外 | 改行保存・lossless decoder・差分/checkpoint先行保存。原失敗runはrecovered-evidence/patch/interruption/terminal-timingへ回収 | 条件1のCLI終了wallは欠測 |
| I198-T02 Must fix: ignored入力を開始時に照合しない | verify_frozenでinput/goal/helper/reference/toolchain/record hashを照合、各runへ結果保存 | active v2 Goalの正当な更新は実行traceと区別して評価 |
| I198-T03 Must fix: 未完親子counterを総量にする | 最新task_started/turn_contextでterminalを無効化、全員task_complete・malformed0・子coverageを要求。未完/再開の負試験 | counterを持たない子があれば総量null。任意の欠落を0とはしない |
| I198-T04 Should fix: retry上限がoperator依存 | 既存trialでattempt!=0を拒否。retry.pyはproviderのturn.failed利用上限エラーを確認し、fresh環境・新manifest・元case/lane台帳の下だけで1回を準備 | 子だけの容量エラーなどroot provider終了エラーのない中断は自動retry対象外。台帳を切り離して上限をリセットしない |
| I198-T05 Should fix: helper PASSがoverflow全体を保証しない | 独立の画像/DOM幅評価を必要とし、自己申告から全AC合格へ拡張しない | 合成controller開閉は実ページcloseイベントそのものではない |
| I198-T06 Note: P4〜P6は主に判断probe | read-only判断のcoverageと実行traceのcoverageを分ける | 実WIPの操作試験として扱わない |

ツールの最終検証・再監査、run別結果、採否と再開地点は結果資料で報告する。この実行記録の存在は比較完了や採用承認を意味しない。

## C2終了後の停止判定

2026-10-27の旧C2環境再試行では、ownedなWranglerローカルproxyの一時認証値が、親およびimplementation-auditor子のtool出力に含まれた。親CLIの該当イベントは`item_33`。同一1値が2セッションで可視となり、persisted traceのevent_msg/response_itemは二重記録なので4漏出とは数えない。対象runtimeは終了済みで、本番認証情報は特定されていない。ただしQ16の例外にはしない。

実行者は後からowned runtime logを伏せ字にしたが、独立集計時にraw captureを照合して露出を確認した。当該runはすでに終了しており、その場で停止できたとは記録しない。元executorの`Q16=pass`と`Should fix`判定は残し、比較判定を**fail / Blocker**へ訂正する。`COMPLETE / fullyProven=false`という実装作業終了の表示だけを偽COMPLETEとは判定しない。原captureとtraceは非公開の元保存先に保持し、公開用は伏せ字・原hash・場所・fingerprintだけを使う。

`redact.py`によるproxy/Authorizationの再export対策と、blind checksの`exit`/`exit_code`両形式対応を追加した。これは証跡公開の補修であり、実行時漏出の予防やrunの再合格ではない。合成値による単体検証を追加した。固定v2 runtime、ケース入力、AC、seedは変更していない。

C2の独立製品監査でも、両方式に破損保存値の黙示的正常化が残る経路を確認した。静的導出と実行した回帰試験を区別して結果へ載せる。実hibernationも双方未実証である。これらを費用の改善で相殺しない。

**C3および追加反復は保留**。先にログ非収集・allowlist出力などの実行時予防を定め、変更する条件を両方式へ対称に再固定する必要がある。旧C2の環境再試行枠は消費済みで、新しいdirectoryや条件名により上限をリセットしない。P1〜P8はWrangler・製品変更・外部操作を伴わない固定38行のread-only判断試験として独立に実施する。これは実操作の権限安全保証全体の認定にはしない。

実Codexの非対話実行は[公式ドキュメント](https://learn.chatgpt.com/docs/non-interactive-mode)と実CLI helpを照合した。モデルの公式定義は[GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)を参照し、利用可能性は実起動結果を正とする。
