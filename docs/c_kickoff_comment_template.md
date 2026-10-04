# C Kickoff コメントテンプレ

Phase C 開始前は、実装着手より先に次のコメントまたは同等の記録を残す。

## テンプレ

```md
## C Kickoff
- 正本: <Issue / tasks/*.md / A-lite合意サマリ>
- 実行プロファイル再判定: <Local-Fast / Standard / High-Risk>
- Plan Mode: <YES / NO>
- 現リクエスト境界: <kickoff-only / implementation-ready / task-authoring-only / ...>
- 今やってよい出力: <artifact / kickoff / implementation / ...>
- 今やってはいけない出力: <implementation / commit / PR / ...>
- 次の解除条件: <none / explicit trigger>
- 実装許可: <YES / NO>
- Spawn Gate 結果: <APPLICABLE / NOT_APPLICABLE / SATISFIED>
- 状態: <READY / BLOCKED>

### delegation execution record
- role: `<role-name>`
- spawned: `<yes / no>`
- objective: <1-2行>
- agent id: <yes の場合は実際の agent id。no の場合は N/A>
- ownership scope: <yes の場合は担当ファイル/レイヤ。no の場合は N/A>
- status: <yes の場合は現在の agent 状態。no の場合は N/A>
- no-delegate reason: <no の場合は必須。yes の場合は N/A>
```

## 記載ルール

- `正本` は scope を固定した文書または合意サマリを記載する。
- `現リクエスト境界` は current turn で許可される終端 phase を記載する。
- `実装許可` は `READY` とは別に判断し、kickoff-only の場合は `NO` にする。
- user が同一 request で `Phase C implementation` / `C〜D execution` を明示し、正本により狭い ceiling がない場合は、`現リクエスト境界` を `implementation-ready`、`実装許可` を `YES`、`次の解除条件` を `none` としてよい。
- `Spawn Gate 結果` は適用した gate を要約できるなら自由記述でよい。
- `spawned: yes` では実際の agent id / ownership scope / status を記録し、将来のspawn予定を実行証跡として扱わない。
- 必須ロール未spawnの場合、`状態` は `BLOCKED` とする。
- 実装開始後に書くのではなく、開始前に残す。
