# Harness v2.1 — #203

新規隔離revision。現行ハーネス、固定v2、#196〜#198と旧比較証跡は保持する。正式移行・#199・merge/deploy/releaseを含まない。

## 変更と理由

| 変更 | 理由 / 保証 / 戻し方 |
| --- | --- |
| tools/harness-v21/policy.py | Worker一般と契約影響を分離。path floor＋意味の追加、unknown fail-closed。低リスクでもCI/Worker bundleを維持。旧policyは不変 |
| safety.py | raw stdout/stderr/例外を保存・表示前に破棄、typed集約だけ返す。任意秘密のregex検出に依存しない。固定ID以外拒否。診断情報の欠測を受け入れ、失敗時停止 |
| fixtures/ | 合成C2の破損enum/boolean/array/数値/形状を拒否。全endpointで保存不変。旧scalar/map、race/reorder、高水位とgrowthを検証。製品取り込みなし |
| runtime/ | 親実装、必要時の独立監査、一つのGoal、同fingerprintの検証再利用。再読込は参照/差分変更時のみ。原logを子/監査へ伝搬しない |
| screen.py | Client/Worker各1回、総2回、retry0、各20分を事前上限としたが、必須local DO証拠未成立で両方未起動。実モデル起動pathを除去しhard hold。中央append-only台帳の負試験は将来の上限設計だけで、実評価成功ではない |

同一write scopeの一人owner、全操作別grant、狭いceiling、証拠鮮度、self-approve禁止は固定v2のgateを再利用する。検証面の選択と証拠の意味判断は親/独立reviewerの責任で、自動gateの成功だけで完了にしない。

安全runnerは協調的なcommand境界。任意shellをOSで強制仲介する機能ではない。直接shellや認証設定・raw履歴を読む経路まで完全に防御できるとは主張しない。screeningでは固定runnerだけを許可し、逸脱・不明は停止。任意秘密の検出は不能なので、export redactorは補助だけ。境界付き比較redactorでP7-risk識別子保持を試験し、固定v2のredactorは変更しない。

## 検証 / 限定評価

`python -B tools/harness-v21/validate.py <新規repo外directory>` は明示Python検査とCI quick＋build/fixtureのtyped証跡を保存する。Python/合成TSは標準npm検査外なので個別実行する。過去の失敗や欠測をPASSへ置換しない。

実session前にsource hash/入力/fixture/モデルeffort/上限/停止/実評価者をmanifestへ固定し、静的・負試験・独立contract/behavior reviewが全て成功した時だけ起動。第一run失敗時は第二runを起動しない。準備/利用上限/中断も試行を消費する。評価は2例のscreeningであり#198の18比較の達成ではない。

このrevisionは必須local DO probe起動失敗のため **BLOCKED**。screen.py runは全入力で停止しモデルを起動しない。worker-bundleも未認定runtime log sinkのため固定BLOCKED。将来再開には、構造化された安全な起動失敗診断、実DO復元証拠、実profile/MCP無効read-back、AC/Q/manual/独立reviewの完了gateとcommand遵守観測を別revisionで独立検証する必要がある。自己申告COMPLETE＋test exitだけで将来runを合格にしない。

費用は親子counterを関連付けて取れた値だけ記載。欠測はnull、キャッシュ/reasoningは内訳として二重加算しない。旧結果とは非同条件のため因果・改善率・統計的優越を主張しない。

## Q01〜Q16 coverage

| 保証 | v2.1の扱い |
| --- | --- |
| Q01〜Q04 | sensitive path/意味で契約/挙動・Worker検証・該当E2Eを維持。製品仕様変更なし |
| Q05〜Q06 | fixtureで旧保存・破損・race/reorder・同tick/delete recreate/growth。実hibernationと単体/プロセス再起動を区別 |
| Q07〜Q10 | history/storage/shared/sourceで旧新writer/reader/未来版/互換・実source/nativeの必要面を保持。未実施のC3は未実証 |
| Q11 | 局所ClientのUI/指定visual source条件を保持。小規模helper screeningを旧C1 UIの再認定と呼ばない |
| Q12 | CI floor＋明示Python/TS、全失敗/skip/欠測を保持。同hashの証拠のみ再利用 |
| Q13 | 独立trial・一人owner・WIP前後hash/stash照合。#188/#192にwriteしない |
| Q14 | 独立contract/behavior監査、重大修正後再確認。将来screening高リスクも独立review必須。現revisionは起動を禁止し、未実装の実review gateを成功扱いしない |
| Q15 | frozen operation/completion gateとP1〜P8正負試験を維持。外部操作はstubのみ |
| Q16 | runtime allowlist集約・raw非保存・env制限・負試験。外部資料から権限追加しない |

復帰はtrialを離れて現行checkoutの新規sessionを使う。新tools/docs/taskのみrevert可能。採否と#203完了は別であり、肯定的screeningも#199実行許可ではない。
