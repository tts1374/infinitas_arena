# 監視ソースI/O仕様（Ph1）

## 0. 目的
Ph1で対応するローカル監視ソースについて、
入力ファイル、採用フィールド、新規イベント判定、同定処理、異常時の扱いを定義する。

Ph1では以下を前提とする。

- 対応ソースは 3種類（+ legacy）
  - `inf-notebook`
  - `daken_counter_v3`
  - `reflux`
  - `inf_daken_counter` は legacy（設定UIでは通常非表示）
- **1端末1ソース固定**
- ソースは事前設定で選択
- ルーム参加中は変更不可
- 監視方式はソースごとに固定
  - `inf-notebook`: **file watcher**
  - `reflux`: **file watcher**
  - `daken_counter_v3`: **local WebSocket** (`ws://localhost:{port}`)
- 監視異常時は `SOURCE_UNAVAILABLE` を表示し、TECHスキップ誘導とする

---

## 1. 共通方針

## 1.1 採用対象
ルームの勝敗判定に使用する値は以下のみ。

- `SCORE` モード:
  - EX SCORE 絶対値
- `MISSCOUNT` モード:
  - miss count / bp

以下は採用しない。

- update差分値のみのスコア
- DJ LEVEL
- CLEAR TYPE
- ランプ
- オプション差による補正

---

## 1.2 同定キー
譜面同定は以下で行う。

- `play_style`
- `difficulty`
- `title_search_key`
- `chart_id`（任意。存在時は優先判定）

### expected_key
```text
(play_style, difficulty, title_search_key, chart_id?)
```

### observed_key
監視ソースから取得した情報を正規化して生成する。

### 採用条件
- `observed_key == expected_key`
- `round_index == current_round_index`
- 当該プレイヤーの当該ラウンドが未確定
- `chart_id` は双方にある場合のみ一致必須
- `daken_counter_v3` は `expected_key.chart_id` がある場合、`observed_key.chart_id` 欠落を不採用

これを満たす場合のみ `PLAYED` として採用する。

---

## 1.3 タイトル同定
Ph1(v1) ではソースごとに同定方式を分ける。

### inf-notebook
- `records/summary.json` の `musicname`（DB由来）をそのまま使用する
- `music_title_alias` は **exact 一致のみ**で参照する
  - `alias_scope = 'inf' AND alias = ?`
- `alias_norm` / 大文字小文字の正規化検索 / fuzzy 検索は行わない
- runtime alias API（`/api/chart-aliases/resolve`）が有効な場合は trim exact 候補で補完し、短TTLキャッシュで追従する

### reflux
- `title` を優先し、必要時 `title2` をフォールバックに使う
- `diff` / `playtype` から `play_style` / `difficulty` を導出する
- alias 解決は inf-notebook と同様に exact 優先、必要時 runtime alias 補完を使う

### inf_daken_counter
従来どおり `normalize_title_input(raw_title)` を同定処理側で行う。

最低限含む処理:
- Unicode NFKC
- trim
- 連続空白を1つに正規化
- 括弧直前空白除去
  - `Summer Vacation (CU mix)` -> `Summer Vacation(CU mix)`
- 英字小文字化
- 記号の最小正規化

解決失敗時:
- `UnmatchedTitleLog` に記録
- 当該ラウンドでは未同定扱い
- Ph1では手動再割当は行わない

---

## 1.4 新規イベント判定
各ソースごとに last_seen を保持し、
**すでに見たイベントを再採用しない**。

Ph1では「現在ラウンドのみ受理（accept_window=0）」であるため、
遅延イベント・過去イベントは採用しない。

---

## 1.5 監視異常
以下は監視異常とみなす。

- ファイルが存在しない
- 読取失敗
- JSON/XMLパース失敗（書き込み途中が疑われる場合は短時間リトライ後に判定）
- 必須フィールド欠落

対応:
- `SOURCE_UNAVAILABLE` 表示
- 自動提出は行わない
- PLAYING中は TECH スキップ誘導

---

## 2. ソース: inf-notebook（リザルト手帳）

## 2.1 使用ファイル
必須:
- `records/summary.json`（監視対象）
- `export/recent.json`（`score` / `misscount` 補完用）

Ph1(v1)では、**勝敗判定の一次ソースは `records/summary.json`** とする。  
`export/recent.json` の `music` / `difficulty` は OCR 由来のため、照合主キーには使わない。

---

## 2.2 records/summary.json 入力例
```json
{
  "musics": {
    "Thunderbolt": {
      "SP": {
        "ANOTHER": {
          "latest": {
            "timestamp": "20250729-201348"
          }
        }
      }
    }
  }
}
```

---

## 2.3 export/recent.json 入力例
```json
{
  "version": "0.19.0.0",
  "count": 20,
  "score": 39398,
  "misscount": 441,
  "updated_score": 10447,
  "updated_misscount": 16,
  "clear": 17,
  "list": [
    {
      "timestamp": "20250729-201348",
      "difficulty": "ANOTHER",
      "music": "Thunderbolt",
      "new": true,
      "score": 2878,
      "misscount": 13,
      "updated_score": 157,
      "updated_misscount": 4,
      "clear": true
    }
  ]
}
```

---

## 2.4 summary 差分抽出
毎回全譜面を再処理せず、前回スナップショットとの差分のみ抽出する。

比較対象:
- `musics -> <musicname> -> <playtype> -> <difficulty> -> latest`

抽出条件:
- 前回値と比較して `latest` が変化した譜面のみ

抽出値:
- `musicname`
- `playtype`
- `difficulty`
- `latest_timestamp`

`best.score` / `best.misscount` は採用しない。

---

## 2.5 recent 補完（timestamp 主体）
`export/recent.json` は `timestamp -> record[]` の multimap を構築して参照する。

判定:
- 0件: 短時間リトライ後、未取得なら欠損扱い（`resolved_partial`）
- 1件: `score` / `misscount` 採用
- 2件以上: `ambiguous_recent` 扱いで不採用

注意:
- `recent.music` / `recent.difficulty` は warning 用の整合性チェックに限定
- OCR 文字列一致は採用条件にしない

---

## 2.6 observed_key 生成
```text
play_style = summary.playtype
difficulty = summary.difficulty
title_search_key = alias_scope='inf' AND alias=summary.musicname の exact 解決結果
score/misscount = export/recent.json (timestamp一致)
```

---

## 2.7 監視・再読込
- watcher は `records/summary.json` を監視する
- 更新検知後に短い debounce を入れて再読込する
- parse 失敗時は即エラー確定せず、短時間リトライまたは次回更新待ちとする

---

## 2.8 状態分類
最低限以下を区別して扱う。

- `resolved_full`:
  - alias 解決成功
  - recent 一意突合成功（`score` / `misscount` あり）
- `resolved_partial`:
  - alias 解決成功
  - recent 欠損（再試行後も0件）
- `unresolved_alias`:
  - alias exact 0件
- `ambiguous_recent`:
  - 同一 timestamp の recent 候補が2件以上

---

## 3. ソース: inf_daken_counter（legacy / 非推奨）

## 3.1 使用ファイル
必須:
- `today_update.xml`

---

## 3.2 today_update.xml 入力例
```xml
<Results>
  <item>
    <lv>10</lv>
    <title>GHEL NAGARAJA</title>
    <difficulty>DPH</difficulty>
    <lamp>EXH-CLEAR</lamp>
    <score>+2064</score>
    <opt>OFF / OFF</opt>
    <bp>3</bp>
    <notes>1110</notes>
    <score_cur>2064</score_cur>
    <score_pre>0</score_pre>
    <rank>AAA</rank>
    <scorerate>92.97</scorerate>
  </item>
</Results>
```

---

## 3.3 採用フィールド
### 共通
- `title`
- `difficulty`

### SCORE モード
- `score_cur`

### MISSCOUNT モード
- `bp`

### 採用しないフィールド
- `score`（差分文字列。例 `+2064`）
- `lamp`
- `rank`
- `opt`
- `scorerate`

---

## 3.4 difficulty の変換
`today_update.xml` の `difficulty` は以下のような略記で入る。

例:
- `SPN`
- `SPH`
- `SPA`
- `SPL`
- `DPN`
- `DPH`
- `DPA`
- `DPL`

これを以下へ変換して observed_key を作る。

- `play_style`
- `difficulty`

例:
- `DPH` -> `play_style=DP`, `difficulty=HYPER`

---

## 3.5 observed_key 生成
```text
play_style, difficulty = parse_chart_difficulty(xml.difficulty)
title_search_key = normalize_title_input(title)
```

---

## 3.6 新規イベント判定
Ph1では以下を採用する。

### fingerprint
```text
(title_search_key, parsed_difficulty, score_cur, bp)
```

### last_seen
- 上記 fingerprint を保持
- 同一 fingerprint の再検出は無視

ファイル更新時:
- 最新 `item` を読み取る
- fingerprint が未確認なら新規候補
- `observed_key == expected_key` なら採用

---

## 3.7 ソース: daken_counter_v3（Ph1 v1）

入力:
- local WebSocket `ws://localhost:{port}`（default `8767`）

受信:
- `type == "today_updates"` のみ処理対象
- `data.items[]` は一覧スナップショットとして扱い、前回受信との差分のみ新規候補にする

採用:
- LOBBY では採用しない（直近スナップショットのみ保持）
- PLAYING 開始時に接続確認し、接続不可なら `SOURCE_UNAVAILABLE` として監視開始しない
- PLAYING 中のみ差分判定を有効化し、重複履歴を保持して再処理を防ぐ
- `difficulty` は 3.4 の変換表を厳格適用する
- `battle == 1` は v1 非対応として破棄する

---

## 3.8 ソース: Reflux（Ph1 v1）

入力:
- `latest.json`（監視対象）
- `tracker.tsv`（best補助 / 再読込対象）

受信:
- `latest.json` は短時間リトライ付きで安全読込する
- 同一内容の再処理を避けるため、内容ハッシュで重複抑止する

採用:
- SCORE: `exscore`
- MISSCOUNT: `bad + poor`
- `diff` と `playtype` を照合し、矛盾は warning として扱う
- `tracker.tsv` は譜面単位の best 補助値（`best_score` / `best_bp`）として `source_meta` へ付与してよい

---

## 4. ソース設定UIとの対応

## 4.1 設定値
- `inf-notebook`
- `daken_counter_v3`
- `reflux`
- `inf_daken_counter` は legacy 非推奨（既存設定が残っていても利用しない）

## 4.2 制約
- 1端末1ソース固定
- ルーム参加中は変更不可

## 4.3 監視対象パス
### inf_daken_counter
- `today_update.xml`

### inf-notebook
- `records/summary.json`
- `export/recent.json`

### daken_counter_v3
- `ws://localhost:{port}`（default: `8767`）

### reflux
- `latest.json`
- `tracker.tsv`

---

## 5. 採用フロー（共通）

### 5.1 ラウンド開始時
- ルームから `ROUND_BEGIN(expected_key)` を受信
- クライアントは監視を継続
- `round_soft_ttl` の起点は **START音声時**

### 5.2 監視イベント検出時
1. ソースごとの新規イベント判定
2. observed_key 生成
3. `observed_key == expected_key` を確認（`chart_id` が双方にある場合は一致必須）
4. 勝敗モードに応じた `metric_value` 抽出
5. `RESULT_SUBMIT` を送信

### 5.3 採用失敗時
- key mismatch: 採用しない
- metric欠落: 採用しない
- parse失敗（再試行後も継続）: `SOURCE_UNAVAILABLE` 扱い

---

## 6. 未同定時の扱い
未同定（title解決失敗）は以下とする。

- `unresolved_alias` はダイアログを表示し、現在ラウンドへの今回限り登録を明示承認した場合のみ送信する
- `resolved_partial` / `ambiguous_recent` は採用せず通知のみ行う
- 未承認または解決不能の場合は提出しない
- ラウンドが進行した場合は最終的に `SKIP_SELF` / `FORCE_ADVANCE` / `TIMEOUT` のいずれかで確定する

---

## 7. 将来拡張余地
Ph2以降で以下を追加可能。

- `export/recent.json` の補助利用強化
- `summary/recent` 反映タイミング差の推定改善
- source自動診断
- file watcher + polling のフォールバック
- 未同定タイトルの管理UI
- 複数ソース対応の統合ログ
- 監視中の詳細デバッグ表示

---

## 8. Host開催へのsource接続

- 既存parser、title normalize、difficulty mapping、`observed_key == expected_key`、source別の新着/重複判定を再実装しない。通常room/開催roomの提出先contextだけを切り替えるadapterを置く。
- 開催ではserver-authoritativeな`PLAYING`、自分が当該`round_id`の対象、準備済み、未提出である場合だけ新着結果を`EVENT_ACTION(SUBMIT)`へ送る。event/round/expected_keyを必ず照合し、通常のnotebook timestamp dedupeを維持する。
- 新曲開始や再接続で、監視済み結果を新しいプレーとして再送しない。端末側判定だけを安全境界とせず、serverのround/資格/最初の有効提出/idempotency検証と組み合わせる。
- 準備/開始条件はsource parser成功と分離する。source読取り不能でも既存`SOURCE_UNAVAILABLE`表示と本人`SKIP`導線を提供する。
- 専任Hostにはsource設定・監視・架空提出を要求しない。通常roomの監視、expected key、異常通知、legacy source方針は変更しない。
