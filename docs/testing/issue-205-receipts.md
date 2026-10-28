# Issue #205: ReceiptLedger の受付照合試作

#188 固定基点 0dac1b0 の隔離 worktree で、独立した受付照合 module を検証した。変更範囲は receipts.mjs、receipts.test.mjs、本記録。protocol.mjs は持ち込まれた内容を変更せず参照する。

送信後に登録した観測でも、その sequence が送信以前なら既存実装は confirmed に進んだ。また一般操作では snapshot の context 世代、snapshot 本文の room が十分に照合されていなかった。

修正は次の境界に限定した。

- 送信・受信・snapshot の sequence は正の安全な整数とし、確認証拠は対応する送信より厳密に後のものだけを使う。
- 開催 ACK / ERROR は実際の request_id / client_msg_id に対応する送信と照合する。別 request での再送前の snapshot を流用しない。
- snapshot の session / target / room / generation と、本文の room / generation を確認する。通常の match / 曲、開催の event / round / revision の既存条件も維持する。
- 派生状態の非 authoritative な snapshot は確認証拠にしない。ローカル切断・再接続は同じ scope と新しい transportEpoch で確認する。
- 不足した証拠から confirmed を作らず sent / unknown を維持する。送信後の通知と snapshot の到着順は問わない。

呼出し契約は、broker が送信直前と受信時に単調増加する正整数 sequence を渡し、生の受信を適用前 context とともに received へ渡すこと。生 snapshot は received が登録し、派生状態・接続観測は snapshot(client, sequence, false) で扱う。broker 自体の統合は今回の範囲外。

検証結果:

- 修正前の既存テスト: 5 / 5 PASS。
- 負試験を追加し実装を変えない段階: Node の集計 43 件中 26 FAIL、17 PASS。古い / 不正 sequence、異 scope、別 room 本文、再送前証拠などで誤った confirmed を再現した。親テスト失敗も集計に含む。
- 修正後: 44 / 44 PASS。上記に加え、ACK の request_id 欠落拒否と client_msg_id 照合も確認した。
- 実行: node --test scripts/dev-control/receipts.test.mjs。
- protocol.mjs / receipts.mjs / receipts.test.mjs をそれぞれ node --check し、すべて成功した。
- ログ: .tmp/issue-205/receipts-baseline.log、receipts-red.log、receipts-green.log。初回 CLI の環境 policy 拒否は成功として計上しない。

実窓・source 連携・broker 統合・E2E は未検証。sequence の正しさと raw / derived の区別は呼出し側の契約に依存する。本試作から製品の受付 ACK や統合完了を主張しない。製品 CI の確認は親タスクが別途担当する。
