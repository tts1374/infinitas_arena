# QUALITY.md

## 0. 基本原則

完了条件は「動作を証明できること」。

常時必須:
1. 技術的検証
2. 差分検証

変更領域連動で追加必須:
- FSM/Protocol 検証
- 監視ソース検証
- E2E/シナリオ検証
- Agent/Governance 整合検証

---

## 1. 技術的検証 (常時必須)

- build/typecheck 成功
- lint 成功
- 関連 test 成功
- 不要な依存追加なし

### 1.1 Validation Surface Parity

- 選んだ validation は、touched files に対して repo CI の validate surface と同等以上でなければならない
- workspace の typecheck/test が touched files を除外している場合、狭い pass を「十分な検証」として扱わない
- `*.test.ts` / `*.test.tsx` を追加・変更した場合、標準 typecheck/test entrypoint がその file を含むか確認する
- 標準 entrypoint に含まれない test file は、明示コマンドで実行するか、script へ追加する。どちらでもない場合は validation gap として扱う
- CI 相当 command をローカルで再現できない場合、`skip reason` と residual risk を完了証跡へ残す

Worker 変更時:
- `wrangler` build 成功
- DO/WS 系の基本起動性を確認

Client 変更時:
- client build/typecheck 成功
- 必要時に Rust 側 watcher/parser コンパイル性確認

---

## 2. 差分検証 (常時必須)

- 変更対象外 diff がない
- 無関係な整形変更なし
- 生成物更新は意図的
- UTF-8(no BOM) / LF を維持

---

## 3. リスク連動検証マトリクス

### 3.1 FSM / Protocol 変更時
必須確認:
- RoomState 遷移
- timer/deadline/TTL 振る舞い
- expected_key enforcement
- idempotency (`client_msg_id`)
- host 権限境界
- LobbyDirectory 公開条件

### 3.2 Lobby summary / freshness / cleanup 変更時
必須確認:
- stale cleanup が probe 後の newer summary を削除しない
- freshness token が同一 ms / 同一 tick 衝突で再利用されない
- `delete -> recreate` や reorder を含む経路で古い cleanup 条件が再一致しない
- 公開レスポンス schema が意図せず拡張されていない
- persisted helper state に bounded-growth または明示 reclaim 方針がある
- internal storage shape 変更時に restore compatibility がある

### 3.3 Source I/O 変更時
必須確認:
- `inf-notebook` 抽出
- `daken_counter_v3` 抽出
- `reflux` 抽出
- `inf_daken_counter` (legacy有効時) 抽出
- `observed_key == expected_key` 採用
- 異常時 `SOURCE_UNAVAILABLE` と TECHスキップ導線

### 3.4 E2E/シナリオ必須時
最低限:
- create -> ready -> pick -> play -> result
- duplicate pick 差し替え
- TIMEOUT と FORCE_ADVANCE
- `SKIP_HOST_ASSIGN` 拒否動作
- `ROOM_STATE_LOST` 経路

### 3.5 Agent/Governance 変更時
必須確認:
- `npm run check:agents` 成功
- `npm run check:design-contracts` 成功
- `.codex/config.toml` の default model / spawned-agent default model が repository-approved model と一致する
- 廃止 agent 名の残存参照がない
- skill 内の agent 参照が canonical kebab-case 名と一致し、machine-specific absolute path がない
- 状態語彙/severity 語彙の統一定義が維持される
- root docs / agent 定義 / skill の間で `objective` / `success criteria` / `stop condition` の責務配置が矛盾していない
- judgment を agent から skill へ不適切に移していない
- implementer / auditor の `continue` vs `BLOCKED` / `ESCALATION` 境界が欠落していない
- user-facing な Plan / kickoff / audit summary / final result が、user の明示指示がない限り日本語で返される規則になっている

### 3.6 Workflow Artifact / Closure Task 実行時
必須確認:
- Entry Protocol に `Stage / affected layers / contract-sensitive / execution profile / Plan Mode` がある
- 委譲した場合は `delegation execution record` が残っている
- 非委譲の場合は `No-delegate reason` が残っている
- Phase C 実行時は C Kickoff 出力が実装開始前にある
- 正本 artifact が `current request ceiling` / `stop condition` を持つ場合、実施内容がその ceiling を超えていない
- `planning-only` / `kickoff-only` / `task-authoring-only` の turn では、許可された artifact 以外の product implementation diff がない
- blocker 解消のための artifact 作成だけが許可されている turn では、same turn の downstream 実装差分がない。ただし同一 request が downstream 実装をすでに明示許可し、正本 artifact により狭い ceiling がない場合は除く
- user が同一 request で `Phase C implementation` / `C〜D execution` を明示し、正本 artifact により狭い ceiling がない場合、task artifact / kickoff が synthetic な explicit implementation authorization を `next unlock condition` として追加していない
- missing artifact が唯一の blocker だった場合でも、同一 request が downstream 実装を明示許可していれば、artifact 作成後の kickoff が `implementation-ready` / `Implementation authorization: YES` へ進めることを妨げていない
- review response 実行時は、対応 thread / validation / reply / resolve / 再レビュー依頼の処理状況が追跡できる
- Phase D で follow-up を作る場合は、次スレッドで再利用可能な `Issue-ready artifact` 粒度になっている
- Issue を閉じる場合は `docs/issue_close_evidence_template.md` に準拠している
- stateful GitHub write-back を行う場合は、comment/reply/resolve/close の反映結果を URL/id または read-back で確認している
- write-back command の empty response / stdout 不在だけで成功扱いしていない
- review / PR / close 作業では、validation surface が CI より狭くないことを確認している
- PR publish / merge 作業では、`author.login` / `author.is_bot` の read-back と lane evidence が確認されるまで `bot-created PR` を前提にしていない
- clean worktree / branch isolation を使った場合、source worktree に in-scope upstream-equivalent residue が残っていない
- base branch latest-sync 実行時は、final `git status` が clean であるか、保持した WIP / stash の理由が記録されている
- temporary stash を作った場合は keep / drop と対象 path が追跡できる
- local cleanup を行う場合、cleanup target worktree / branch が task-owned な `codex/*` と一致している
- local cleanup を行う場合、target worktree が削除前に clean である
- local cleanup を行う場合、target branch の作業が削除前に base branch へ取り込まれている
- local cleanup を行う場合、`$worktree-branch-cleanup-guard` の必須確認を踏んでいる
- local cleanup 後は `git worktree list` で対象 path が消えている
- local cleanup 後は `git branch --list` で対象 branch が消えている
- local cleanup で current branch / protected branch / base branch を削除していない
- post-approval merge を行う場合、Codex が target PR を self-approve していない
- post-approval merge を行う場合、human approval と required checks green が確認されている
- post-approval merge を行う場合、unresolved actionable review thread が残っていない
- `Standard` の bot-created PR を Approve で merge する場合、follow-up 判定と close prerequisites が完了している
- `Standard` の `task-owned / user-authored PR` strict fallback を使う場合、single-maintainer same-account deadlock の根拠、explicit `mergeしてOK` または同等の merge authorization、required checks green、unresolved actionable review thread なし、follow-up 判定完了が確認されている
- `High-Risk` の post-approval merge では、approve に加えて explicit merge authorization または auto-merge 許可がある
- post-approval merge 後は PR merged state が URL / merged flag / merge commit SHA で確認されている
- `merge + close + cleanup` を行う場合、順序が `merge -> closure evidence -> Issue close -> local cleanup` になっている
- audit findings がある場合、`finding -> disposition -> evidence -> remaining risk` が追跡され、未処理の `Blocker` / `Must fix` が残っていない

### 3.7 UI design source / wireframe 準拠がある変更時

必須確認:
- 正本 artifact が指定する wireframe / screenshot / design doc / visual reference を確認している
- 確認した design source の path / URL / identifier が output に残っている
- 実装差分が design source の該当箇所と対応している
- text / layout / visibility / placement / overflow / responsive behavior のうち、正本で指定された観点が検証されている
- visual source を確認できない場合、準拠確認を完了扱いせず residual risk または `BLOCKED` / `ESCALATION` としている

---

## 4. Severity Convention (統一)

- `Blocker`: 完了不可。修正または明示再スコープまで停止
- `Must fix`: 現タスクで修正必須。延期時は明示的合意が必要
- `Should fix`: 重要改善。同タスク内または明示的後続化
- `Note`: 情報共有/軽微懸念。単独では完了阻害しない

---

## 5. Completion Evidence

完了宣言には次を含める:
- 実施検証一覧
- リスクに対応した証跡
- 未解決項目と扱い（修正/延期/エスカレーション）
- `COMPLETE/BLOCKED/ESCALATION` の明示

`Blocker` 未解決の完了宣言は禁止。
