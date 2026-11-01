# Q / R / V対応表

正本の文言・品質条件は[requirements](requirements.md)。本表は#197試作の実装手段・検証法・残る人間/実機判断を示す。selectorの選択成功と製品の保証実証は別であり、Q01〜Q11の製品意味変更は今回行っていない。

## 維持する保証

| ID | 規則/実装手段 | 試作での検証法 | 未自動化・残る保証 |
| --- | --- | --- | --- |
| Q01 | `CONTRACTS.fsm/ws/shared`→contract/behavior、design/worker/E2E gate | semantic trigger、cross-layer test | 実FSMの正常/拒否遷移・host/resyncを対象変更ごとに実証 |
| Q02 | timer/restore/lobby→clock/barrier/runtime gate | semantic trigger、Workerパス選択 | 直前/一致/直後、複数alarm、実時計をfixture/runtimeで実証 |
| Q03 | ws/source/shared→Q03、実source E2E | semantic trigger、cross-layer test | payload不正/key/round/generation/host拒否を実コードで確認 |
| Q04 | idempotency/restore/history→Q04/replay | semantic trigger、独立review gate | 再送/復元/世代境界・二重確定/集計/SE、保存寿命 |
| Q05 | Worker/restore/reconnect→restore/runtime | semantic trigger、Workerパス | cold/破損/旧attachment/socket遅延close、実hibernationは別実証 |
| Q06 | Worker/lobby→race/growth/runtime | パス選択とsemantic trigger | probe barrier/同ms/recreate/reorder/回収/公開schemaを実証 |
| Q07 | history/storage/shared→writer-reader matrix | semantic trigger、matrix必須確認 | authoritative/fallback、rated、match_id fallback、重複防止 |
| Q08 | storage/restore/native/shared→旧新/破損/未来matrix | semantic trigger、matrix必須確認 | データ保全・失敗後再試行・移行の製品判断 |
| Q09 | source/native→Rust＋実watcher/parser/E2E | semantic trigger、nativeパス | 3 source/許可legacy、stale/replay/未同定承認を実経路で確認 |
| Q10 | shared writerを親/明示一人へ、consumer/rollout gate | cross-layer・owner競合/停止後takeover test | breaking分類・最低版/期間/撤去・reader互換は意味判断 |
| Q11 | UI→visual source/hash/状態/幅/keyboard、native別面 | 局所UI selector、manual欠落拒否 | 指定画像の取得・比較、実Tauri別窓・操作感 |
| Q12 | CI下限、membership、exit/log/fingerprint、失敗/timeout保存 | test omission/timeout/latest-failure/stale evidence tests | assertionの十分性、対象外testの明示実行、実機skipは未実証 |
| Q13 | scope/owner/ceiling gate、Git snapshot、fresh export | P4/P5/P6、staged/untracked/commit後差分 test | WIPの由来とwrite許可、cleanup/実対象read-backの意味確認 |
| Q14 | 高リスク独立review、implementersとID照合、両coverage/fingerprint | high-risk review freshness/coverage test、実reviewer smoke | identity文字列だけで独立性を捏造しない。原traceと担当履歴を確認 |
| Q15 | current request/op/target grant、ceiling/kind、lane/check/thread/read-back | P1/P2/P3/P7、positive/negative stub | ユーザー許可の解釈は親。stubは実外部結果ではない |
| Q16 | external source grant拒否、secret redaction、export isolation | P8、quoted JSON secret fixture、protected snapshots | 任意秘密の完全検出は保証しない。収集回避と意味レビューを併用 |

## 設計要求

| ID | 対応・検証 |
| --- | --- |
| R01 | Goal一つにAC/non-goals/current grant/reference revision/stop/未決、`validate_goal` |
| R02 | 親が直接実装、局所UI/docはdirect-parent、短い計画は高リスク時、低リスク実セッション |
| R03 | 独立調査/並列利益/独立review時だけ起動。runtime規約のbounded packet、実spawn trace |
| R04 | `independent-review-required`、実装非担当・contract/behavior・新fingerprint必須、独立監査 |
| R05 | cross-layerで親がshared含むwriterになれる。P4で重複拒否と停止後再割当を確認 |
| R06 | decisionにblocking/affects/deadline/interim、非blocking・無関係scopeは継続test |
| R07 | selector/complete＋本表のV対応、CI floor/membership、unknownは保守的gate |
| R08 | `operation`を一元化、旧historyからgrantを継承しない、P1〜P8の正負試験 |
| R09 | 2 Skillの排他的trigger、Q/designを必要時参照、規則の正本をAgentへ複製しない |
| R10 | snapshot/fingerprint、immutable base、checkpointと全AC/統合を区別、P5/commit後差分 |
| R11 | additiveな専用branch、NEW export、marker、実config/skills/reviewer、元旧構成の再ロード |
| R12 | comparison-plan不変、smokeと正式比較を分離、provider原usage/null、固定revision手順 |

## 自動化への移管状況

| ID | 状態 | 手段・暫定検証・限界 |
| --- | --- | --- |
| V01 | 部分実装 | scope/禁止/active owner、base以降diff、index/untracked/stash hash。WIP由来/stagingの意味は親が確認 |
| V02 | 実装＋判断 | path+semantic合成selector、unknownで安全側。意味タグの真偽・想定外影響は親/独立reviewer |
| V03 | 部分実装 | package testの明示列挙照合、非列挙は補完必須。型include/globの完全解析はせずmanual gate |
| V04 | 部分実装 | CI quick下限、client/web/native/Worker面を追加。CI自体の変更/既存#184の解決は対象外 |
| V05 | 暫定gate | design既存check＋contract/behavior/consumer matrix必須。汎用roundtrip自動生成は未実装 |
| V06 | 暫定gate | clock/barrier/restore/replay/growth実証を要求。製品fault fixture新設や実hibernationは#198側 |
| V07 | 暫定gate | writer/reader現行/旧/未来/破損matrixを要求。汎用保存adapterの自動実行は未実装 |
| V08 | 暫定gate | native-check/test＋実source/E2Eを要求。本人プレー/実OS窓をmockで代替しない |
| V09 | 暫定gate | UI source/状態/幅/keyboard証拠を必須化。画像差分や操作感の自動採否は未実装 |
| V10 | 実装 | TOML/Skill/model静的check、実app-server strict config/skills、実reviewer smoke。旧exact8とは別 |
| V11 | 部分実装 | lane/HEAD/check/thread/順序/read-backのstub判定。実外部executor/APIによる強制実行は持たない |
| V12 | 部分実装 | JSONL usage原値、時刻、attempt log/hash、resume/finding。全親子usage・active time・自動全trace集計は未対応、null |

「暫定gate」は品質条件を削除した意味ではない。自動化していない実証はmanualに残り、証拠なしの`complete`はBLOCKED。これらを#198の合格時にskipへ緩和しない。
