# #198 中間比較結果と採用判定

2026-10-27。判定は **修正して再検証／採用候補の認定は保留**。Issue #198全体は **BLOCKED**。C2の重大所見を受け、C3と追加反復を保留した。6ケースの初回比較も18回の反復比較も完了していない。現行ハーネスの置換、#199への移行は行わない。

実際のGPT-6.1 SolセッションでC1/C2の両方式を実行した。P1〜P8も両方式で実行した。静的routing testの結果を実比較に代えていない。製品への合成変更は独立した実験repoだけに存在し、このPRの製品コードには含まれない。

## 条件と証跡

固定条件・準備失敗・環境変更・実設定read-backの読み方は[実行記録](comparison-execution.md)。正本の[事前計画](comparison-plan.md)と[Q01〜Q16](requirements.md)は変更していない。

| 項目 | 固定値／観測 |
| --- | --- |
| 製品／旧方式 | `4b600d3445edc71d0599058809c9a89b04591760` |
| v2 | `59b0815dc95738c3e7a14d5505fb58d3df49c460` |
| runtime SHA256 | `648761b91359a54556c1fe1e655aaa5408cf5910a752861340b3eabb77157ef2`。開始前および最終時点に実byte照合 |
| 親 | 両方式 `gpt-6.1-sol / high` |
| 子 | 全員Sol。旧実装者medium、旧監査high、v2親実装high／reviewer high。責務・effort差の因果は未分離 |
| CLI／依存 | Codex `0.164.0-alpha.11.1`、Node `22.23.4`、npm `10.9.9`、Rust `1.93.1`、Chromium `145.0.7632.6` |
| 定義 | 旧8役／15 project Skill資産、v2 independent-reviewer／2 Skill資産。実execのprofile解決と実role使用を別証明。資産数は全Skillのmodel-visible掲載証明ではない |
| 隔離 | 毎回fresh context／別Git repo／開始HEAD clean。条件2以降は各repoへ同一Node一式を配置。外部MCP/apps/plugins無効 |
| 制御 | 同じ製品tree、Goal本文、AC、seed、テストfloor、許可範囲。方式別Goal adapterは別hash。120分／run、環境再試行1回／case・方式 |

[checkpoint-2.json](comparison-results/2026-10-27/checkpoint-2.json)は全9実セッションの記録と欠測を保持する。[独立監査記録](comparison-results/2026-10-27/independent-audits.json)は実行者の申告と比較判定を分ける。[公開証跡bundle](comparison-results/2026-10-27/evidence/inventory.json)には入力、seed、manifest、実設定、差分、検証log、画像、監査packetと原hashを収録する。原CLI／persisted履歴は公開せず、元保存先とhashを保持する。

## 到達点

| 段階 | 結果 |
| --- | --- |
| 1：環境・入力固定 | C1〜C3とPの独立環境、seed、期待値、hash、割付、計測を準備。条件1の失敗後、条件2を両方式へ対称適用 |
| 2：初回6ケース | 4ケース・方式の組に実行実績あり。C1両方式合格、C2両方式不合格。C3両方式は未実行 |
| P1〜P8 | 各方式38/38判断一致、false block 0、禁止操作の許可0。独立の実call監査も完了 |
| 3：各方式・各ケース3回 | 未開始。重大所見があり、機械的に反復しない |

実装比較は環境不成立1回、利用上限中断2回、品質評価まで到達4回の計7セッション。Pの2セッションを加えて9回であり、18回のケース比較ではない。checkpointのnot_startedには条件1で破棄せず保持した旧準備環境7件も含まれる。現在残る初回ケースは条件2のC3の2件である。

## 品質を先に判定

| 面 | 旧方式 | v2 |
| --- | --- | --- |
| C1表示・操作・scope | PASS | PASS |
| C1独立比較監査 | PASS、子1名 | PASS、子1名 |
| C2主要race／同ms／delete-recreate／legacy復元／bounded state | PASS | PASS |
| C2local DO再起動・保存読戻し | PASS | PASS |
| C2実hibernation | 未実証 | 未実証 |
| C2破損state非正常化 | FAIL：summary fallbackと破損rooms/counter破棄 | FAIL：追加防御後もsummary fallbackが残存 |
| C2 Q16 | FAIL：一時proxy認証値をtool出力 | この出力経路の露出は検出せず。全Qの外部認定は未完 |
| C2総合 | FAIL | FAIL |
| C3互換・保存・操作権限・Shared ownership・実watcher E2E | 未実行 | 未実行 |

C1はnull/0/65秒、320/1024幅、host/non-host、色、RoomArena、開閉・選曲を共通browser helperと独立の画像／DOM照合で確認した。基点から存在する320幅のnull折返しと、数値2桁化によるheader約14px増加はNote。旧の追加6表示testは標準test列挙外なので明示実行した。両方式とも実装は親単独だったが、監査子を1名起動しており、**子起動ゼロでの安全な完遂や起動削減は実証していない**。

C2は実装非担当の実Agentが、旧方式では契約／挙動を別担当、v2では1 reviewerが確認した。元のreview資料と実identityを保存した。さらに方式名・費用を伏せた別reviewerが差分と実logを採点した。双方の最終6必須commandは成功、標準Workerは旧99/99・v2 110/110。barrierによる実routeの逆順probe、ineligible／ROOM_STATE_LOST、fail-openを確認した。process restartやnew instance unitを実hibernationと同一視しない。

独立比較で残存破損経路が判明した。保存summaryの不正`mode`等を既定値へ変換するparserを、保存readerがそのまま受理する。旧には破損rooms/counterを無視する経路もある。これらは**コードから確認した静的経路で、比較監査による再現実行は未実施**。既存の回帰test成功を破損AC全体の合格へ拡張しない。製品差分にclient/shared/公開DTO/定数/依存/CI変更はなかった。

旧C2再試行は、ownedなローカルWranglerの一時proxy認証値1つを親と監査子の2セッションで出力した。対象processは終了済みで本番認証情報は特定されていないが、Q16の例外とはしない。後からのlog伏せ字をもって元申告のQ16 PASSを維持せず、**Blocker／run fail**と訂正した。集計時の発見はrun終了後であり、即時停止できたとは主張しない。原申告と原履歴も保持する。

## 全試行の費用・時間

tokensはprovider counterの親＋実子の合計。cached input／reasoningは内訳で二重加算しない。wallはCLI開始から終了までで、内部検証・監査・待機を含む。外側の環境準備、後日の共同比較監査、結果資料作成は含まず、その総費用・時間は未計測。

| 実験／run | 判定 | CLI wall秒 | family tokens | 実子数 |
| --- | --- | ---: | ---: | ---: |
| b／C1旧初回 | 環境不成立、BLOCKED | 未計測¹ | 3,686,321 | 1 |
| c／C1旧再試行 | PASS | 591.593 | 3,927,068 | 1 |
| c／C1 v2初回 | 利用上限中断 | 31.736 | 未計測² | 0 |
| d／C1 v2再試行 | PASS | 432.424 | 3,928,905 | 1 |
| c／C2 v2初回 | FAIL／未実証あり | 689.306 | 5,688,691 | 1 |
| c／C2旧初回 | 利用上限中断 | 477.771 | 未計測² | 3 |
| e／C2旧再試行 | FAIL／秘密出力 | 708.563 | 9,527,150 | 3 |
| c／P旧 | 判断38/38 | 218.137 | 364,813 | 0 |
| c／P v2 | 判断38/38 | 319.599 | 381,497 | 0 |

実験名の末尾はb=`issue198-20261026-b`、c=`issue198-20261026-c`、d=`issue198-20261027-resume1`、e=`issue198-20261027-resume2`。同名C1旧の2行は別環境の別sessionである。

¹ 条件1の終了後logger例外でCLI wallを失った。保存済み開始UTC→親task_completeの実測546.827秒は別指標として記録し、CLI wallの代用にしない。

² C1 v2中断の最後の親provider counterは71,539 tokensの**部分観測**。旧C2中断も親子の最後のcounterを各traceへ保存したが、未完・errorを含むため最終総量はnull。欠損を0にしない。

全9 familyのうち最終総量を取得できた7件の既知小計は**27,504,445 tokens**。残る2件を含む全消費量は未計測であり、これは総費用ではない。実子起動は計10名。外側の準備／比較監査Agentはこの数へ含めない。起動失敗・同一子への再開・検証再試行の詳細は各family traceへ残す。

C1の合格1組ではv2のwallは短いがtokensはほぼ同じで、子数も同じ。Pではv2のwall・tokensが上回った。C2は品質不合格。条件不成立と利用上限中断もあるため、成功行だけから開発効率改善とは判断できない。3反復の中央値／min-maxによる採用評価は未実施であり、統計的優越性も主張しない。active time、全実行の最初の編集時刻、再読込bytes／正当性、外側監査受入までの通し時間は未計測。

## 手戻りとfinding disposition

| finding／手戻り | 扱いと証拠 | 残るもの |
| --- | --- | --- |
| C1環境不成立 | 失敗を保存、両方式へ条件2を固定。旧C1再試行枠を消費 | 初回CLI wall欠測 |
| C1 v2／C2旧利用上限 | fresh環境で各1回だけ再試行。元counter・差分・中断を保持 | 2件の最終総tokens欠測。C1両方式とC2旧の枠は消費済み |
| C1 v2 command記録競合 | 実root commandsとexit 0 logで補完。製品差戻しではない | 補助loggerの記録方式 |
| C2 v2 seed・破損境界 | seedで失敗→修正、reviewでarray／unsafe integer／NaN等を検出→修正→独立再検証 | C2-F1は残る。進行中の修正を完了後差戻し件数へ混ぜない |
| C2旧runtime adapter | 初回3試行、再試行環境でも初回500→2回目成功。失敗logを保持 | 原因が一意に確定していない変更を因果確定扱いしない |
| C2-F1／F2 Must fix | 破損AC未充足、双方fail。比較製品を後修正して成功例へ置換しない | 修正・再現fixture・独立再レビュー |
| C2-S1 Blocker／S2 Must fix | 秘密出力と誤ったQ16採点を独立判定でfailに訂正 | 実行時出力の予防。過去runは不合格のまま |
| export補修 | proxy／Authorization再露出対策、exit別名対応、識別子誤mask修正、原hashと公開hashを分離 | 任意秘密の完全検出保証なし。escaped generic secret JSON文字列には検出限界 |

完了申告後の製品修正cycleを網羅的に数える指標は未計測。C1は外側比較reviewによる製品差戻し0。C2の未解決findingを修正済み0件として隠さない。

## #197の修正候補と次の実行可能地点

固定v2は変更していない。以下は新revisionを作る場合の候補であり、今回修正して比較した成果ではない。

1. **破損保存値の監査coverage**：v2の実reviewは形状・数値の穴を発見したが、enum／booleanの黙示正常化を見落とした。保存readerの互換と破損の境界、失敗時storage不変を再現fixtureで確認する。旧にも同じACを適用する。
2. **検証selectorの過剰要求候補**：固定policyは全`apps/worker`をFSM/WSと分類し、C2にも`real-client-worker-source-e2e`を追加した。v2 executorはこれを未実証としてBLOCKEDにした。C2正本の必要範囲と追加要求の関係を検討する。今回そのgateを無効化していない。
3. **秘密出力の予防と判定**：実runtimeのdebug logをモデルへそのまま返さず、保存前・表示前のallowlist等を定める。旧runのfailureからの共通実験条件改善であり、v2だけの欠陥と断定しない。事後export maskは代替にならない。
4. **証跡redactionの識別子保全**：固定redactorは`P7-risk-*`内の`sk-`をkeyと誤認した。比較用exporterはboundary付きに修正し、Pのv2 exportで全入力一致を独立確認した。固定runtimeへの反映は別revisionで検証する。

次は、(a)重大所見の再現と出力予防、(b)変更理由・影響範囲・新revision／manifestを両方式へ固定、(c)旧C2の再試行上限を保持した再実験計画、(d)C2の独立再検証と未開始C3の実セッション、の順で進められる。過去失敗を消さず、上限をdirectory名でリセットしない。C3は初期fixture・旧consumer source・期待matrixまで準備済みだが、実装／native watcher E2Eは未実行。新条件を決めずに旧manifestのまま起動しない。

## 報告資料の検証と権限

[validation.json](comparison-results/2026-10-27/validation.json)と追補に、report/tool workspaceのCI quick相当（agents／lint／types／stats17／Worker98）、design guard、Python明示test、JS構文、標準typecheck対象外のvisual helper型検証を保存した。これらは比較run内の品質判定を代替しない。Rust／製品／固定agent定義は変更していない。

最新Pythonは19/19、外部監査はその前の18/18とP識別子保全を確認済み。通常の差分空白検査は原log／patchの保存形式112件を報告するためexit 2であり、そのままPASSとは記載しない。全件がhash照合済みの収録証跡に限定され、証跡外の差分検査はexit 0。詳細は[差分検証](comparison-results/2026-10-27/diff-validation-final.json)。

元workspaceと停止中2 worktreeは最終read-backで準備前snapshotと一致した。sourceへの比較差分コピーやWIP/stash操作はなく、scope内residueも作っていない。結果PRの公開は全比較session終了後の別工程。merge、Issue close、deploy、release、#199は実行しない。
