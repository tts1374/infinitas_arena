# 製品検証（Issue #205 隔離試作）

検証面の正本は現在の `.github/workflows/validate-reusable.yml` と各package script。
製品テスト・契約検査を削除/弱体化しない。変更testが標準対象外なら明示実行する。

- quick: lint、root typecheck、client stats、Worker tests、および基点CIが持つ追加検証。
- full: quickにclient build、cargo check、Worker bundle dry-runを加え、基点CIが持つclient unit・integration・cargo testも保つ。
- 常時: 差分/対象範囲、UTF-8 no BOM/LF、意図しない生成物/lockfile変更がないこと。
- FSM/WS: state遷移、host権限、現在ラウンド、expected_key、冪等性、deadline/TTL、再接続、ROOM_STATE_LOST、公開ロビーを検証する。
- ロビー: probe後の新summary、同tick・delete/recreate、reorder、growth/reclaim、保存復元互換を確認する。
- source: inf-notebook / daken_counter_v3 / reflux、およびlegacy有効時のinf_daken_counterについて抽出とexpected一致、SOURCE_UNAVAILABLE/TECH導線を確認する。
- 対戦経路に影響する場合: create→ready→pick→play→result、duplicate pick、TIMEOUT/FORCE_ADVANCE、SKIP_HOST_ASSIGN拒否、ROOM_STATE_LOST。
- UI: 指定wireframe/画像のpath、実画面との対応、text/layout/visibility/placement/overflow/responsiveと操作を確認する。
- 保存/互換: writerとreaderの往復、旧データの復元、破壊的変更の適用順とrollbackを確認する。
- 秘密/操作権限/本人データ/外部公開を保つ。GitHub書込みはURL/id/read-backで確認する。

重要契約変更は独立レビューを受ける。findingには処置・検証証拠・残リスクを対応付ける。
未解決Blocker/Must fixと必須検証の未完を残したままCOMPLETEとしない。
旧統治方式だけを検査する `check:agents` は、この試作では有効Custom Agent/project Skillが0であることを検査する。
