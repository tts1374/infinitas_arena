# #192 private制御境界 v1

2026-10-23 JST。T0の契約checkpoint用。製品規範は`docs/design/01_fsm.md`、`02_ws_protocol.md`、`03_data_model.md`、`06_source_io_spec.md`、`07_constants.md`、`10_regression_guard_addendum.md`および開始HEADのshared型。ここで定めるのは開発ツール内部のDTOとguardであり、既存Worker/sharedのschemaを変更しない。

objectiveは制御窓の意図を対象の正規操作へ結び、本人保全・排他・受付証拠を維持すること。成功条件は以下の境界をT1〜T5と監査が共通参照できること。stop conditionは独立契約checkpointを返すまで。allowed side effectsは本書と凍結参照のみ。未確定の製品仕様を補完しない。

## processとauthority

`controller process → debug限定native bridge → loopback broker → 相手main adapter / headless peer`。A/B実clientとは別のcontroller processを起動する。controllerは専用mode assetを同梱し、room/source/watcher/scenario runner/updaterを起動しない。query/E2Eフラグだけで制御権限を持たせない。

Worker/DOとsnapshotがroom state・結果・期限のauthority。brokerは意図・予約・記録のowner。画面あり相手のsource供給はfile/local WSから既存watcher/parser/自動提出へ渡す。brokerが同じ結果を直接WS送信しない。headlessは正規WSの通信/受付だけを確認する。一つのplayerは一つのtransport ownerを持つ。

private DTOのkeyはcamelCase、`protocolVersion: 1`を必須とする。unknown version/field/action、必須field欠損、識別子の型違いは実行前に拒否する。製品のsnake_case fieldは既存DTOを保持し、private境界で明示変換する。

## DTO

以下は共有するinterfaceの意味。製品型のimportは既存shared型を再利用する。native側/Node側も同じnullable条件と検証を持つ。任意WS envelope/raw URL/任意file pathをcommand payloadとして受け取らない。

```ts
type DevControlRole = "controller" | "self" | "participant";
type DevControlTransport = "real-client" | "headless";
type DevControlSource = "inf-notebook" | "reflux" | "daken_counter_v3";
type SendPolicy = "manual" | "auto" | "delay" | "hold";

interface ContextToken {
  sessionId: string;
  targetClientId: string;
  transportEpoch: number;
  roomId: string | null;
  roomGeneration: number | null;
  matchId: string | null;
  eventId: string | null;
  roundIndex: number | null;
  roundId: string | null;
  expectedKey: ExpectedKey | null;
  selectionRevision: number | null;
  policyRevision: number;
  valueRevision: number;
}

interface DevControlManifest {
  protocolVersion: 1;
  sessionId: string;
  sourceHead: string;
  createdAt: string;
  runtimeRoot: string;
  broker: { host: "127.0.0.1"; port: number };
  clients: DevControlClientManifest[];
  ownedProcesses: OwnedProcess[];
}

interface DevControlClientManifest {
  clientId: string;
  playerId: string | null; // controllerのみnull
  identifier: string;
  role: DevControlRole;
  transport: DevControlTransport | null; // controllerのみnull
  windowLabel: string;
  source: DevControlSource | null; // controller/headlessはnull
  readOnlySource: { paths: string[]; port: number | null } | null;
  fixtureRoot: string | null; // self/controllerはnull
  sourcePort: number | null;
  storageRoot: string;
  spoolRoot: string;
}

interface OwnedProcess {
  kind: "controller" | "client" | "broker" | "worker" | "frontend" | "source";
  clientId: string | null;
  pid: number;
  createdAt: string;
  executablePath: string;
  ports: number[];
}

interface DevControlCommand {
  protocolVersion: 1;
  operationId: string;
  sessionId: string;
  actorClientId: string;
  targetClientId: string;
  context: ContextToken;
  action: DevControlAction;
  payload: ActionPayload; // 下表actionごとの閉じたunion
}

interface DevControlObservation {
  protocolVersion: 1;
  sequence: number; // session内単調増加
  operationId: string | null; // 未相関のraw受信はnull
  sessionId: string;
  clientId: string;
  playerId: string | null;
  context: ContextToken;
  stage: "operation" | "reserved" | "input" | "parsed" | "sent" | "received" | "failed";
  origin: "raw" | "derived";
  at: string;
  clientMsgId: string | null;
  requestId: string | null;
  snapshotRevision: number | null; // 通常snapshotへ架空revisionを付けない
  receiveSequence: number | null;
  detail: ObservationDetail; // allowlistされた記録型、秘密tokenなし
}

interface DevControlResult {
  protocolVersion: 1;
  operationId: string;
  sessionId: string;
  context: ContextToken;
  status: "pending" | "reserved" | "input-written" | "parsed" | "sent" |
    "confirmed" | "rejected" | "unknown" | "cancelled" | "failed";
  reason: string | null;
  evidenceSequences: number[];
}
```

`ExpectedKey`は既存`packages/shared/src/models/expected-key.ts`。EX/MISSのdraftは整数か空欄として保持し、無効値を送らない。`sendPolicy`の適用revisionと編集値のrevisionは別に進める。上限は選択譜面と製品規則を使い、試作の固定4000を流用しない。confirmed値はsnapshot/公開結果から別に保持する。

`roomId`/`roomGeneration`は未入室時null。通常は`eventId`/`roundId`/`selectionRevision`がnull、開催は`matchId`/`roundIndex`がnull。選曲・開始前に未決定の曲識別子はnullであり、別識別子で穴埋めしない。result送信時は当該modeに必要な識別子・expectedKeyが必須。識別子nullをwildcardとして扱わない。

native bridgeの読取は`getDevControlState`、意図送信は`sendDevControlCommand`。停止後export/再試行と新session起動は、broker接続を要しない限定native経路を別に持つ。具体的Rust command名はfoundation所有、意味の変更は契約checkpointへ戻す。

### Phase Cで具体化した限定interface（2026-10-25）

以下は既存の新session/供給失効契約の具体化で、製品WSやsource dedupeの変更ではない。実装正本はclient private `protocol.ts`/`transport.ts`。

```ts
interface DevControlRestartOptions {
  mode: "ARENA" | "BPL" | "BPL4" | "CASUAL" | "TOURNAMENT";
  hostClientId: "A" | "B";
  opponentSource: DevControlSource;
  visibleOpponents: number;
  playerCount: number;
}
interface DevControlRestartRequest {
  protocolVersion: 1;
  sessionId: string;
  options: DevControlRestartOptions;
}
interface DevControlSourceInput {
  context: ContextToken;
  source: DevControlSource;
  timestamp: string;
  inputId: string;
  sourceFingerprint?: string;
}
interface DevControlSourceArm {
  kind: "source-arm";
  operationId: string;
  context: ContextToken;
  input: DevControlSourceInput;
}
```

`DevControlState.restartOptions`に現在の初期値を持ち、`restartDevControlSession(request)`が限定native経路を呼ぶ。未知field/version、別session、不正enum/人数は拒否。playerCountは2〜20、ARENAは4、BPL/BPL4は2、画面あり相手は1以上かつplayerCount未満。AのselfSource/path/portは旧manifestから継承し、このrequestから変更しない。既存session内の排他的設定fileと固定launcherだけを使い、任意path/URL/CLIを受け付けない。確認UIと停止済みsession検査を経て新ID/tokenを発行する。実restartの成立はT5/T6で別に検証する。

source-armはbrokerが相手mainへ渡す内部claimで、controller向け任意commandのallowlistを広げない。`prepareInput`→arm単一claim→`armedInputId` report→`supply`とし、各await後に固定contextを照合する。v3の`sourceFingerprint`は意味上必須で、欠損/不一致を拒否し、既存source fingerprint定義と完全一致させる。file sourceはtimestampも照合する。普通の起動とself Aにはdev-control source gateを適用せず、既存の監視・提出規範を維持する。

## role・権限・秘密

| 呼出元/対象 | 許可 | 拒否/照合 |
| --- | --- | --- |
| controller | 状態/記録閲覧、相手のallowlist操作意図、focus、保存、hide/再表示、全体停止、新session | 自身は製品接続を持たない。nativeとbrokerの双方でmanifest/session/windowLabel/roleを照合 |
| self（A実client） | 普段の明示source参照を読取、本人の製品操作、観測、focus | 代理Ready/選曲/結果/切断/退出をnative/broker両方で拒否。fixture書込不可。元設定/履歴のcopy/migrateなし |
| participant real-client | 自分宛commandのclaim、正規store操作と自分の観測報告 | 他client宛claim/結果報告拒否。結果はsource経路だけ、直接SUBMIT不可 |
| participant headless | brokerがそのplayerの正規API/WSを一元所有 | 実source監視成功とは表示しない。実clientへライブ切替不可 |
| host操作 | 現snapshotのhostがB以降なら、そのhost clientをactor/targetにして正規操作 | 選択中のguestへhost操作を配送しない。host=Aなら本人の実アプリへ誘導 |

session tokenはnative環境だけに保持し、URL/query/frontend状態/JSONL/bundle/公開dumpへ出さない。brokerはtokenとclient roleを照合し、匿名mutation/汎用CORSなし。nativeはmanifest固定loopback brokerのみへ接続し、redirect/非loopback/任意URLを拒否。debug compile gate＋専用起動manifest＋window/roleが必須。通常/releaseは同env/queryを与えても拒否する。

pathはmanifestに固定したsession/client領域から解決する。writeは相手fixture/spool/exportのみ。canonical pathと新fileの親を検査し、root外・相対脱出・UNC・symlink/junction脱出・他client・A参照元重複を拒否する。process停止はPIDだけを根拠にせず所有handle/作成時刻/pathを照合する。

## action allowlistと製品型の対応

payloadは表にあるfieldだけを受け取る。mode/state/権限/在室/接続/返答待ち/当該曲の条件は操作表を適用し、server応答をauthorityとする。private actionは次の範囲に閉じ、汎用raw WS転送を作らない。

| private action / payload | 実行経路 | actor/対象・制限 |
| --- | --- | --- |
| `ready.set` / ready | READY_SET(generation, ready) / store | 相手本人、通常N0だけ |
| `pick.submit` / chartKey | PICK_SUBMIT(pick_chart_key) / store | 相手本人、通常N1で残枠あり |
| `match.start` / 空 | START_MATCH / store | B以降host、通常N0、全員Ready/人数/手動PRIVATE |
| `match.forceAdvance` / 確認token | FORCE_ADVANCE / store | B以降host、通常N2/N3、未確定者数確認 |
| `match.returnToLobby` / 空 | RETURN_TO_LOBBY / store | B以降host、通常N5、手動PRIVATE |
| `event.start` / 確認tokenまたはnull | EVENT_ACTION START_EVENT | B以降host、E0、大会は固定名簿/Nの確認 |
| `event.confirmPick` / chartKey | CONFIRM_PICK | B以降host、E1、現event/selection_revision |
| `event.cancelPick` / 確認token | CANCEL_PICK | B以降host、E2、現round/selection_revision |
| `event.startRound` / 空 | START_ROUND | B以降host、E2、確定譜面・eligible 1人以上、Readyなし |
| `event.closeRound` / 確認token | CLOSE_ROUND | B以降host、E3、未提出人数/DEADLINE欠場を確認 |
| `event.nextPick` / 空 | NEXT_PICK | B以降host、E4 |
| `event.end` / 確認token | END_EVENT | B以降host、E0〜E4、未確定曲無効/確定曲保持を確認 |
| `participant.add` / manifest登録済み設定ID | 正規create/join | 通常N0、合同E0〜E4（E2以降pending_next）、大会E0のみ、定員内 |
| `participant.disconnect` / 空 | transport ownerが自動復帰を抑止し切断 | 相手、通常N0〜N5/開催E0〜E4。退出と分離 |
| `participant.reconnect` / 空 | 同player/保存復帰情報で正規復帰 | 一時切断者だけ。期限内、退出済みには使わない |
| `participant.leave` / 確認token | ROOM_LEAVE / EVENT_ACTION LEAVE | 相手本人、開催hostはevent.endを使う。E5/E6不可 |
| `draft.update` / exScore, missCount | brokerの次値draftだけを編集 | A以外、N0〜N4/E0〜E4。旧予約/確認を取消、現在確定値不変 |
| `policy.apply` / policy, 確認tokenまたはnull | broker予約policy | A以外。現在N3/E3未提出へauto適用は対象/曲/値/即時送信を確認 |
| `result.send` / 固定値revision | 実画面: source供給。headless: RESULT_SUBMIT / SUBMIT | 相手、N3/E3、有効対象・未確定・接続・キー一致。EX/MISSから製品win_metricへ変換 |
| `result.delay` / 固定値revision, delayMs=10000 | broker予約→上と同じ経路 | 10秒予約、同じguard。遅延を製品deadlineへ置換しない |
| `reservation.cancel` / 予約operationId | 未投入予約/開いた確認だけを失効 | 自分session/対象のみ。既投入/送信の取消成功を主張しない |
| `client.focus` / 空 | 既存実窓focus | Aも可、画面なしは不可、二重起動なし |
| `state.refresh` / 空 | participant/selfは正規STATE_GET / EVENT_ACTION STATE_GET、controller自身は制御記録の読取 | controller読取のtool-confirmedは製品受付を意味しない。終了後も必要な公開結果読取だけ |
| `evidence.save` / 許可保存先ID | controller spool/限定native writer | 停止後も可、任意path指定不可、write/flush/read-backで成否 |
| `session.stop` / 確認token | 所有runtime停止protocol | Aの検証用processも終了対象、普段のIIDX/連携は対象外 |
| `session.restart` / 上記閉鎖DevControlRestartRequest、UI確認 | brokerへ製品操作を配送せず限定native hidden launcher、新ID/token | 旧証拠保持。mode/host/相手source/画面あり変更も新session、本人A参照は継承 |

`SKIP_SELF`/`SKIP_HOST_ASSIGN`/開催SKIP/KICK/INVALIDATE_ROUND/任意FSMジャンプ/期限変更/任意WS編集は初版ツールのallowlist外。必要なTECH導線等は既存実アプリで確認する。明示退出後の再入室も既存アプリの正規導線で確認し、reconnectへ混ぜない。

## N/E全行の適用表

| 表示case | product状態 | 現在提供する進行/提出 | 次値・接続・終了 |
| --- | --- | --- | --- |
| N0 | LOBBY | Ready、条件充足時host開始 | 相手次値可、追加可 |
| N1 | PICKING | 残枠の相手選曲 | 全枠確定待ち、次値可 |
| N2 | PLAYING開始前表示 | host強制進行（確認） | ツール送信待機、次値可。serverの+55秒拒否を主張しない |
| N3 | PLAYING | 未確定当該曲の結果、host強制進行 | manual/auto/delay/hold、次値可 |
| N4 | client曲別結果表示 | 古い表示曲へ送信不可、次ROUNDは自動 | 次値可、最新snapshotへ同期 |
| N5 | RESULT | host手動再戦 | 次値編集終了、部屋存続中の接続操作は可 |
| N6 | CLOSED | 進行/送信不可 | 記録/保存/新session |
| E0 | LOBBY | host開催開始/終了 | Readyなし、次値/追加可 |
| E1 | PICKING譜面未確定 | host曲確定/終了 | 次値可、合同追加可、大会開始後新ID不可 |
| E2 | PICKING譜面確定 | host取消/プレー開始/終了 | 送信不可、次値可、合同追加は次曲待ち |
| E3 | PLAYING/ACTIVE | 有効PENDINGの結果、host締切/終了 | 次値可、host断中も有効SUBMIT継続、公開保留 |
| E4 | PLAYING/RESULT | host次曲/終了 | 送信不可、次値可 |
| E5 | RESULT | mutation/再接続不可 | 公開結果/履歴/保存/新session |
| E6 | CLOSED | mutation/再接続不可 | 記録/保存/新session |

全行に操作表§5〜7の上書き条件を重ねる。通常はARENA=4人・各1、BPL=2人・各1＋serverランダム、BPL4=2人・各2が初版起動値。開催は4人から定員内追加。`current_playing_player_ids`が分母、同集合の確定statusが分子。接続/在室/大会固定Nを代用しない。通常PLAYEDと開催SUBMITTEDを別型として扱い、開催null/次曲待ち/欠場理由を潰さない。大会固定N/配点は縮めず、合同へ総合ptを加えない。

## 排他・claim・鮮度

commandのsession/targetとcontextは完全一致させる。actorはnative環境/manifestから照合し、frontendからの自己申告を権限にしない。重複operationIdで別payload/contextが来たらconflict、同じ内容なら既存結果を返す。main adapter pollは自分宛commandを一つの実行ownerがclaimし、重複pollで再実行しない。

brokerとmain adapterは送信直前と全非同期await解決後にtokenを再照合する。値/policy/対象/曲/世代/接続epoch/停止/session変更で確認・予約を失効。対象選択変更でそのUIの開いた確認/遅延予約を取消す。manual制御と既存scenario automationは排他とし、観測をautomation gateへ結合しない。Aもrunner代理操作しない。

投入済みfile、mock latest/replayは物理取消済みとみなさない。供給停止・新baselineとclientのcontext再照合で次曲への漏れを防ぐ。alias解決中/非同期parser中の世代変化も同じ扱い。source dedupeを弱めず、v3 timestampだけで同値fingerprintが新しくなったとみなさない。SC192-01はT3で通常snapshot依存のpayload handler/譜面同定helperを規範§8へ最小整合する必須項目。現在はcode checkpointを独立監査で確認済みだが、実native/sourceからの受付9面は未実証であり、全体解消判定はT6の証拠を要する。

## status・timeout・再同期

| 結果/段階 | 根拠 | 表示上の意味 |
| --- | --- | --- |
| pending/reserved | 操作検査/予約作成 | まだ投入・送信していない |
| input-written | 許可file/local WSへ実投入 | parser/WS送信/受付は未確認 |
| parsed | client既存parserの有効観測 | 送信/受付は未確認 |
| sent | 実transport送信とclient_msg_id/request_id | source `ok`を受付成功へ読み替えない |
| confirmed（通常結果） | PLAYER_ROUND_CONFIRMEDのplayer/round＋最新snapshotのroom generation/match/当該曲確定 | 通常に新規汎用ACKを追加しない。通知単独で別matchと相関しない |
| confirmed（開催結果） | EVENT_ACTION_ACKのrequest_id/applied_revision＋該当round/player status/snapshot | ACK/状態は順不同・重複でも照合。ACK単独で提出状態を捏造しない |
| rejected | 対応するERROR/EVENT_ERROR/正規拒否＋context | 通常ERRORにはrequest_idが無いので一意相関できなければunknown |
| unknown | 送信後応答timeout/切断/停止/相関不足 | 未確認の成功へ変えず、最新snapshot/結果の再同期で解決 |
| cancelled | 未投入予約/未適用確認の失効 | 既投入/既送信へ適用しない |
| failed | 投入前エラー、source失敗、保存失敗など具体的段階 | 保存は操作結果と別に失敗/部分保存/再試行を表示 |

private native→broker I/Oは1request最大5秒、body最大1MiB、redirect禁止。操作の返答待ち表示は15秒でunknownとし、送信後に新operation/request IDで自動再投入しない。claimはlease切れで別ownerへmutationを自動再配送せずunknownへ落とす。これらはツールI/Oの上限であり、製品のround/host/rejoin deadlineの短縮ではない。既存開催request再送の同ID規則を維持し、通常はSTATE_GET/最新snapshotで確認する。遅延予約10秒、開催host猶予300秒など製品規範を別に保持する。

## 停止と保存

### T5 private観測・保存DTO

製品WSとは別のversion 1 DTOを使う。`DevControlState.stop`はphase（idle/quiescing/collecting/flushing/terminating/verifying/complete/failed）、要求/完了時刻、errors、processesVerified/portsVerifiedを持つ。lifecycleのstoppedは停止要求の受領だけで合成しない。保存はidle/collecting/exporting/saved/partial/failed、path/error/missing、bundleId/attemptを区別する。画像欠損を保存済み全取得へ読み替えない。

main専用pollには既存command/source-armと別に`evidence-capture`を追加する。captureId、固定context、deadlineAtだけを受け取り、任意path/URLを受け付けない。nativeの固定保存先へ取得したreceipt（captureId/clientId/status/relativePath/error）を報告する。pending/saved/missing/failedを区別し、本人Aの製品操作は行わない。sourceの汎用解析countだけで個別operationをparsedにせず、実入力・contextと照合できる証拠だけを対応付ける。

実窓の撮影はUI threadを停止せず期限内に行う。画像はnative processのメモリ内に一時保持し、撮影中のDOM・設定入力・入室情報・source参照表示およびcontextの変化をmainで監視する。機密表示が一時的にでも発生、context変更、期限超過の場合はメモリ画像を破棄し、spoolへ書かない。同一captureIdの安全確認を受けた画像だけ固定保存先へ一度だけ確定し、flush/read-back後にsavedを返す。

全spool/JSONL/state/子process出力は永続化前に秘密値を除去する。認証・host/rejoin/resume等token、本人元設定・元source全日入力はbundle対象外とし、相関ID/context/ACK/statusは保持する。本人の正規入室に必要なlocal PRIVATE入室コードだけは認証済みnative経由のlive DTOで一時表示し、保存state/JSONL/bundleへは復元しない。session/製品認証tokenのfrontend露出を許可するものではない。

restart応答`{status:"launch-requested",requestId,oldSessionId}`はhidden launcherへの起動依頼受領であり、新sessionのready証明ではない。旧stateのlifecycleをfrontendで書き換えず、旧証拠を保持し、新sessionは別の識別子で起動する。

停止は新mutation/予約禁止→未送信予約失効→source/participant供給停止→in-flightをconfirmed/rejected/unknownへ分類→取得可能な画面/ログをcontroller専用spoolへ回収→bundle flush/read-back→所有検証runtimeを停止→process/port照合。controller shellだけ存続し、room/source接続・poll/timerは持たない。保存失敗でもspoolを保持し、停止を取り消して再接続しない。

停止前のflushingにはprivateなexportRequestIdとexportDeadlineAt/exportDeadlineMsを付け、nativeが同じ要求の新bundleをflush/read-backしてから受付を返す。稼働中のstate更新はbrokerだけが行い、古い要求・期限後・確定後の受付と外部collectは拒否する。保存失敗または15秒以内に確認できない場合もspool/旧bundleを保持して停止を続行し、停止後に再試行できる。

停止後の閲覧/保存再試行は同梱dev-control assetと限定native writerを使用し、停止済みbroker/frontendへ依存しない。終了済み窓の画像は欠損を表示する。controller終了時もactive runtimeを停止し、専用launcherから既存記録をread-onlyで再表示できる。新sessionは限定native hidden launcherで新ID/token/process台帳を作り、旧予約/古いpayloadを引き継がない。

## T0検証・handoff

操作表N0〜N6/E0〜E6全14行および§5〜9、最新correction reviewを照合。製品型の照合先は`packages/shared/src/ws/client.ts`、`ws/host-event.ts`、`ws/server.ts`、`models/host-event.ts`、`constants/timers.ts`、`constants/host-event.ts`。private keyと製品keyの違いを明示し、allowlist外の製品APIを新設しない。原本13件/複写13件のbytes/hashはREADMEに記録。

独立contract-auditorへT0 checkpointを依頼し、未処理Blocker/Must fixがなければT1へ。T1/T2の部分checkpointはT3〜T5の完成を条件にせず、V1〜V9統合はT6で行う。GUI/実source/本人実プレー/停止後保存の実証はT0で未実施。
