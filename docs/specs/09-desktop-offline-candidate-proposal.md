# 09 — PC候補のオフライン起動

Status: **APPROVED — 専用PC候補への限定実装を承認。一般採用・公開は含まない。**
Updated: 2026-10-30. 現在の実装・検証は[todo](../../tasks/todo.md)が管理する。
技術・製品／UXの独立レビュー後、PO2026-10-30が「仕様案09で進める」と承認。
候補自身の登録解除と静的版への復帰も同じ承認範囲に含む。
承認は実装・関連修正・自動検証の権限であり、実行証拠や一般採用ではない。

## 1. 完了させる作業

一度オンラインでアプリを準備し、通信とブラウザを終了した後も、同じPCの
同じ保存場所でプロジェクトを開き、モデル・点群・GS・Caption・メディアを扱い、
編集・ファイル保存・再開まで続けられるPC候補を作る。

承認前のDesktop候補は静的ビルドで、アプリ本体のオフライン起動を持たない。
本仕様は、既存の静的版を保持して追加のオフライン版を作る。
[01e §5](01e-desktop-large-gs-workflow.md#5-approved-ordinary-root-desktop-candidate)
はSW・precache・manifest・installの生成／登録を明示的に禁止している。
本仕様は、その限定PC候補とは別の追加ビルドだけに例外を認める。既存の静的版の禁止は保持する。

## 2. 一括判断の推奨範囲

- 通常版・現在の静的PC候補とは別の、明示的なオフラインPCビルドを追加する。
- 追加候補に限りSW・precache・manifest・所有アイコン・対応ブラウザのインストール導線を
  接続する。OSへのインストールを自動実行したり、完了したと推測したりしない。
- 対象は新形式のProjectSceneと、すでに対応している原本からの初回変換。
  新形式のPoint・GS・Proxyも含む。既存の容量・表示・編集・ファイル・復旧規則を使い、
  新しい形式や保証は追加しない。
- 旧Native／v1画面そのもののオフライン化は含めない。新ビルドで元形式ビューアを
  起動せず、対応する変換と原本保持を案内する。GS全体を対象外にする意味ではない。
  元形式の表示・編集は通常版／静的PC候補に保持する。元形式のSpark追加準備の接続は後続。
- 専用のorigin／profileで使う。同じ専用origin／profileなら、既存ProjectSceneの
  保存領域・Project ID・履歴を継続する。別origin／profileへの自動移行は行わない。
  利用者には「同じアプリのアドレス・同じブラウザのプロファイル」と説明する。
- アプリ資源だけを準備し、更新で作業中の画面を強制切替・再読込しない。
  候補自身の準備を解除して静的候補へ戻れる導線も用意する。

原本を変換できない場合に部分的な新Projectを作らない。原本と既存データを保持し、
従来版での継続を示す。元形式のオフライン再生まで一括で必要なら、本案の範囲を
先に変更・レビューする。`pwa:false`をそのまま「GS準備済み」と見なす代替は認めない。

## 3. ビルド・保存場所・所有範囲

既存の通常／harness／validation／静的Desktopビルドは変更しない。
明示的なビルド設定でのみ追加候補を生成し、別outputへ出す。URLや保存済み設定で
通常版をオフライン候補へ切り替えない。新依存・runtime CDNは追加しない。

SWは専用originのビルドbaseと一致したscopeだけを担当し、候補固有のscript名・
cache prefix・build識別を持つ。normal PWAのrootへ配置せず、既存の別SWを解除／置換
しない。別のSWがこの場所を担当している場合は準備を拒否して理由を伝える。
候補が実行される前から別SWの配信を受ける場所も、配置可能な専用originとは見なさない。

ProjectSceneの歴史的OPFS／IDB／generation namespaceは保持する。
「別URLでも以前のデータが移った」と表示しない。別originからの受渡しが必要な場合は、
既存のファイル保存・確認付きオープン／復元を使い、コピーや移行を推測しない。

## 4. 準備する資源

ビルドから導出する正確なアプリ資源一覧を使う。HTML・CSS・実際に到達する遅延JS・
ローダー・Threeの互換検査／表示側・Worker・WASM・必要なローカル画像／フォント・
GSLの全必要資源と3つの通知文書を含める。GSLのアプリ側chunkをライブラリ番号だけで
固定せず、ビルドの内容識別を保持する。初回変換にも必要な依存を落とさない。

このビルドで開けない元形式ビューアを、隠れた遅延入口として残さない。
Native Sparkを自動precacheせず、通常版の独立した準備・cache identityを変えない。
manifest／installに使う画像は所有・配布確認済みのものだけに限定し、public全体を取り込まない。

Project、ZIP、モデル・添付本体、OPFS／IDB、Blob URLや任意の取得URLはSWキャッシュへ
入れない。現在のWorkspaceFS・package・Sessionによる検証と保存をそのまま使う。
汎用runtime cachingでモデルや写真を拾う実装は不可。

## 5. 準備状態と更新

既存の作業を妨げない文脈内に「オフラインで使う準備」を置く。
処理中・失敗・再試行を局所表示し、準備処理がProjectの編集・保存済み判定を変えない。
入口と現在の状態は各1つにし、SW・cache・制御状態を利用者の設定選択にしない。

「資源を保存できた」「SWが利用可能」「現在の画面が対応するSWで開かれている」を区別する。
初回登録中のページを、制御済みの再起動と同一視しない。ビルド・準備一覧の確認後に
一度閉じて開き直す導線を示し、状態の再確認で準備の欠落が分かれば準備済みを解除する。
OSのインストール完了・永続的なcache保持・Projectのバックアップ成功は推測しない。

更新時は`SKIP_WAITING`・`clients.claim()`・自動reloadを使わない。
旧版を使う制御対象の窓がある間は、その窓へ新コードを強制適用しない。
更新を知らせ、入力の確定と必要な保存を終え、当該PC版の画面をすべて閉じて開き直す
流れにする。初回SWのactivateと、既存版からの更新待ちは別の状態として扱う。

新しい準備の失敗で、動作している旧版資源・作業データを消さない。
install中は旧cacheを掃除せず、後の掃除も候補が所有する不要な版だけに限定する。
通常版／Nativeのcache、OPFS／IDB、Projectの履歴を消す包括的な掃除は行わない。
初期化・中断・quota不足・資源欠落は、準備の失敗として再試行可能にする。

従来の静的PC候補へ戻る場合に、サイト全体のデータ削除を要求しない。
必要時の詳細に「オフライン準備を解除」を設け、オフライン起動ができなくなる影響を
確認したうえで、対応する候補自身のSW登録だけを解除する。開いている画面は強制reload
せず、すべて閉じた後に従来の静的候補を同じアドレスで開く手順を示す。
そのアドレスで従来の静的ビルドを再配信し、接続できる状態が必要である。
登録解除だけで現在のビルドを置き換えたり、旧ビューアをオフライン化したりしない。
この操作はcacheやProjectを一括削除しない。残った候補cacheも登録解除後に準備済みと
見なさず、次の準備では再確認する。別のSW登録には触れない。
解除の戻り値だけで完了を表示せず、並行する準備との所有・登録状態を再確認する。
解除後の現在画面から自動で再登録しない。競合や未確認状態は再試行として示す。

SWの既定ライフサイクルとprecacheのinstall／activate分離を基礎にするが、
ここでの強制更新禁止・所有境界・表示条件はLociViewの提案である。
[更新のライフサイクル](https://developer.chrome.com/docs/workbox/handling-service-worker-updates)、
[precacheの動作](https://developer.chrome.com/docs/workbox/modules/workbox-precaching)、
[scopeと初回制御](https://developer.chrome.com/docs/workbox/service-worker-lifecycle)、
[登録解除と並行登録](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/unregister)を参照した。

## 6. 実装境界と検証

ビルド設定とplatform側が、資源一覧・SW・cache・登録・更新の寿命を所有する。
UIには準備状態のread／prepare／再確認／候補自身の登録解除のportだけを渡す。core／viewerにUIや
Project保存の依存を追加しない。通常の`registerPwa()`をPCから無条件に呼ばない。
候補を閉じた後の遅い応答が、別画面の準備完了を表示しないよう所有を確認する。

想定配置は、純粋なstate／portを`src/platform/desktopOfflinePorts.ts`、登録・状態の
所有を`src/platform/desktopOffline.ts`、portだけを使う表示を
`src/ui/projectScene/offlineControls.ts`とする。専用の`offlineEntry.ts`が組み合わせ、
必要な準備・候補自身の登録解除portを既存のProjectScene UIへ渡す。platformはUI・Project保存へ依存せず、
UIはCacheStorageやSWを直接操作しない。Worker生成には既存VitePWAを使い、新依存を前提にしない。

実装対象はこれらとvite設定・候補専用bootstrap・既存の起動分岐。
元形式の静的継続は既存ビルドへ保持し、初回変換・元形式入口の可否も明示的に検査する。
正確な型・許可importは実装前の内部の独立レビューで固定する。同じ承認範囲の
module・helperごとにPO承認を求め直す手順ではない。

検証は既存の専用Chromiumと所有fixtureを使い、別のSW許可laneで順次実行する。
既存Desktop laneのSW禁止を変えず、個人のChromeを使わない。

1. 同じ専用profileで静的候補の既存Projectを残し、追加候補へ切替えて履歴・本体を照合する。
2. 必要資源を準備後、ブラウザを完全終了する。所有テストserverも停止し、通信を遮断して
   同じprofileからcold起動する。単なる開いたままの操作やHTTP cacheだけで合格にしない。
3. 所有Mesh・Point・GS／Proxy・メディアの保存済みProjectを開く。既存の500k SH4 fixtureも
   再利用し、Caption閲覧・編集・ファイル保存・完全終了後の再開を確認する。
4. 通信・server停止後のcold起動から、対応済み原本の代表fixtureで初回変換→編集→保存→
   再開も行う。対応外原本では部分Projectを作らず、原本を保持して明確に拒否する。
5. 旧版の複数窓と未適用入力を残した更新準備、欠落資源／中断／quota失敗を確認し、
   強制reloadなし・旧版資源と原本保持・再試行を検証する。
6. 別SW／別cacheと元形式の入口を検査し、黙った置換や準備済み偽装がないことを確認する。
7. 候補自身の準備解除→全画面終了→所有serverで再配信する同じアドレスの接続可能な
   静的候補への復帰で、ProjectSceneと
   旧形式の保存データを保持し、別の登録・cache・OPFS／IDBを消さないことを確認する。

必要な最終rootチェックと既存4ビルドに加え、追加候補build・全artifactのHEIC隔離・
SW/cache/entry分離を検証する。PCでの自動cold証拠、OSインストールの実操作、
実機Edge／Chrome・iOS・信頼できるHTTPS上での受入れは別々に記録する。

## 7. 今回含まない判断と停止条件

main／Pages配信、公開URL、通常入口の全面置換、一般採用、iOS合格、ライセンス／版数の
変更は含まない。OSファイル関連付け・共有シートの拡張、origin間移行、新しいモデル／
画像形式、GSの段階読込や容量拡大も含まない。

§5で定めた候補所有の不要版cacheの掃除を超え、別の既存cacheやProjectを消す必要、
保存形式・renderer・旧reader契約の変更、
新依存・新しい配信権限が必要と分かった場合は、該当部分を止めて具体的に再判断する。
本案の承認後は、その範囲の通常実装・不具合修正・自動検証を一括で進める。

## 8. 承認範囲内の実装設計

内部の独立技術レビューを経て、明示modeを`project-scene-offline`、出力を
`offline-desktop-dist`、専用bootstrapを`offlineEntry.ts`とする。既存Desktop入口を
importせず、元形式viewerへの動的入口も残さない。互換検査・初回変換に必要な
Nativeの純粋な読取り部品は保持する。既存modeのSW禁止は変更しない。

platformの`DesktopOfflinePort`はread／subscribe／recheck／prepare／removeと、
ブラウザが実際に提示したinstall promptだけを公開する。既存validation host内に
任意の準備UIを1つ置き、ホーム・復旧・編集を通じて状態を保つ。Projectのdirtyや
Session操作を準備処理の待ち状態に含めない。破棄後の応答は表示しない。

既存VitePWAのInjectManifestと、同梱済みWorkboxの独立PrecacheControllerを使う。
scope＋build IDごとにcacheを分け、同じcontrollerのrevision付きキーで全件を検査する。
別cacheで不足を補わず、network fallbackや汎用runtime cacheは設けない。
navigation fallbackはbase／indexだけを対象とする。app／workerは同じビルド識別を使い、
MessageChannelで応答元worker・実際のbuild・全件存在を確認する。初回版は、別buildが
並行install中である可能性を排除できないcacheを保持し、版をまたぐGCを実装しない。

install時に生成資源のSHA-384 SRIを要求し、状態の確認でも同じdigestを検査する。
HTTP200で別版の内容を返された場合を準備成功としない。worker応答後に登録と
active／waiting／controllerの同一性を再確認し、別窓での解除を見逃さない。
登録の存在と資源確認の成功は分け、確認失敗でも候補自身を解除できる表示を残す。
Project保存領域の初期化失敗でも、storageに依存しない準備／解除UIを保持する。

同じ版の登録更新だけでは欠落cacheのinstallが再実行されないため、明示的な再準備は
当該workerの正確なmanifestで欠落・digest不一致を調べる。不良の項目だけを元のURL・
SRIで再取得し、検証後に同じrevision付きキーへ置換する。正常な項目・別版・Projectは
消さない。任意URLのruntime cachingや、別版の配信内容による代替は行わない。
VitePWAが自動追加するmanifestの重複はURL・revision一致時だけ統合し、各一意資源に
SRIが存在することを必須とする。

既存の候補登録にはupdateを1回だけ要求し、呼出前から新しいworkerの参照を保持する。
install失敗でregistrationのinstallingが消えても、その失敗を正常な旧版の存在で
覆い隠さない。失敗表示は明示的な再試行・再確認、または新しいinstall／activateの
結果まで保つ。旧activeが正常に終了する場合と、準備中workerの失敗を区別する。

所有マークからローカル生成したアイコンだけを使い、manifestへfile/share handlersを
追加しない。通知文書を含む資源をprecacheし、容量による除外はbuildエラーにする。
この内部設計は新しい利用容量・描画・保存形式・公開権限を追加しない。
