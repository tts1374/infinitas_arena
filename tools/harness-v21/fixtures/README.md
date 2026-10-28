# C2 保存境界の合成fixture

この領域は #203 の再現・是正試験であり、製品への修正・移行ではない。
`lobby-directory.ts` は基点の Directory DO の storage/fetch 形状と freshness の意味を使う独立した合成実装。公開契約や実際の保存readerを置換しない。

基点は `e89ea1fde22d830d61cf48dacb1ff3f154550e82`。
参照した製品 reader の Git blob は `7332874b2859b60b5dbce8b61afbb11a6fa266eb`、旧 barrier fixture は `4b9c8ca71a9bf67ca92d13010bf954d30e4b021d`。
実行 manifest ではこれらの参照と新 fixture の SHA256 を固定する。

## 互換と拒否

fixture が受理するのは、storage が空、`rooms` が roomId をキーにするrecord、counterが非負safe integerまたは旧room別recordという範囲。optionalな合成 `schemaVersion` は省略または1のみ。
summary の enum/boolean/string/非負safe integer、capacityとisFullの整合、roomId/key一致を検証する。
一件でも破損、不明版、array、NaN、Infinity、unsafe/fractional/negative数値等なら全endpointを固定 `503 CORRUPT_STATE` にする。空stateへの変換や一部entryの破棄はせず、storageへのputはゼロ。
読取失敗の例外原文も返さない。counterがsafe integer上限ならupsertを保存前に拒否する。

これはfixtureの厳密な入力契約である。製品の過去writerが生成した全値の互換性を証明せず、その契約を製品へ無条件に適用しない。

## 検証面

```powershell
node node_modules/tsx/dist/cli.mjs --test tools/harness-v21/fixtures/restore.test.mjs tools/harness-v21/fixtures/barrier.test.mjs
node node_modules/typescript/bin/tsc --noEmit -p tools/harness-v21/fixtures/tsconfig.json
```

標準npm test/root typecheckはこの領域を含まないため、上記を明示実行する。`package.json`はTSXのES module解決用であり、依存追加はない。

`restore.test.mjs` は破損値をlist/upsert/removeへ通して拒否・storage不変を確認する。基点readerを合成storageで呼ぶ負controlは不正mode/hasJoinCodeの黙示正常化を実行再現する。これは本番の破損発生・利用者被害の観測ではなく、旧runの静的監査を実行PASSへ書き換えるものでもない。

`barrier.test.mjs` は #198 の共通fixtureを新合成DOへ接続したもの。実製品のlobby routeを呼び、逆順probe、同tick、delete/recreate、ineligible/ROOM_STATE_LOST、5xx/network fail-open、legacy counter、cold instance、helperのbounded growthを確認する。
mock storageとnew instanceの試験であり、実local DO process restart、実hibernation、native/source E2Eは未実証。
storage.put障害時の原子的commitもこのfixtureの保証外。

## 実local runtime probe（未合格）

`local-worker.ts` / `wrangler.jsonc` はSQLite-backedの実local DOへ合成実装を接続する試験専用adapter。localhost以外や実Cloudflare resourceへの接続・deployを許可しない。admin seedは固定の合成scalar/map/corrupt presetだけ。

`python -B tools/harness-v21/fixtures/local_probe.py` は専用 `.tmp/harness-v21-local-do-*` persistenceと空profile、空きloopback port、owned processを使用する。計画はseed→process restart後の旧値読戻し/更新と破損拒否→再restart後の保存hash不変の3 startsまで。各start readinessは45秒まで。初回runtime failure後はretryしない。実hibernationは対象外。

初回失敗後の現revisionはCLI/mainをhard holdしたため、上記commandでも新runtimeを起動しない。`_held_reference` は失敗した方式の参照用保存であり、直接呼出しによるhold迂回は禁止。再開は安全な診断と独立確認を備えた別revisionのみ。

原stdout/stderrはpipeをdrainして破棄し、固定status/count/hash以外を表示しない。Wrangler 4.76.0はlog level noneでもdebug fileへappendするため、`discard-runtime-log.cjs` がprobe専用の正確なlog pathへのwriteだけをimport前にdiscardする。合成秘密を使うappend/callback/sync負controlをruntime前に実行し、sink fileが作られたら停止する。任意runtime全体のOS強制ログ隔離を保証する仕組みではない。

2026-10-28の初回runtime結果は **BLOCKED: RUNTIME_START_FAILED、starts=1、checks=0、processes_stopped=true、約2.332秒**。原出力は記録・表示していないため、起動失敗原因は未確定。初回実行時のruntime exit codeは欠測で、後続版では固定numeric fieldへ追加したが未再実行。追加runtime実行を停止し、local DO復元・保存不変を実証したとは扱わない。

先行するsink preflightは2回FAIL（いずれもruntime starts=0）。PATHのVolta shimが空USERPROFILEで解決不能、NODE_OPTIONS内Windowsパスの表記を修正した後、sink負controlを通過した。これらは実session枠の消費や旧比較のretry枠とは別のlocal fixture準備失敗であり、保持する。runtime失敗後のadapterにloopback guardとexit code記録を追加した版は、静的・型検査だけでruntime未確認。

公式参照（2026-10-28確認）: [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/)、[Durable Objects getting started](https://developers.cloudflare.com/durable-objects/get-started/)。現在の公式は新規設定にexportsを推奨するが、既存インストール4.76.0のschemaで確認できるlegacy migrations/new_sqlite_classes形式をこの隔離configで使用し、依存を更新していない。

初回実行はES module指定不足でtest fileのロードが2件FAIL、型検査はPASSだった。ES module指定を追加した後に再実行している。この準備失敗を旧C2の結果や実セッションretryへ混同しない。
