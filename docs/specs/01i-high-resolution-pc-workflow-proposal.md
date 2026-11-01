# 高画素素材の逐次取込みと表示資源の所有

Status: **DIRECTION ACCEPTED —2026-10-31 PO「その方針で改善してください」。具体境界を独立レビューし接続済み。最終検証と残件はtodo。**

通常の負荷は、圧縮ファイル容量の一律拒否ではなく、項目単位の取込み、実際の縮小
プレビュー、原寸表示の所有、非表示資源の解放と同時保持量で制御する。原本を保持する。
これは旧128MiB／2GiB／3GiB案の批准ではなく、新しい容量・速度・全PC成功の保証でもない。
専用PC候補の同じ品質改善unitとして実装する。公開・iPhone合格・新wireは含まない。
通常修正の既存実行証拠は差分資格を残して再利用し、必須最終チェックは統合後に1回行う。

## 1. 利用者の結果と不変条件

代表的な私的Ki84を、変換→記録と模型を読む→画像の原寸確認→編集→ファイル保存→
別環境への受渡し・返送→復元・cold／オフライン再開まで通す。原ZIPと、選ばれた模型・
画像のbytes、座標、記録、既存recipe／ID／receipt／履歴と用途別の共有範囲を保持する。
縮小画像はUI専用であり、元画像の置換、保存事実、受入れ証明、共有payloadに使用しない。

Caption先行閲覧と準備済みの3D操作を維持する。準備中・待機・失敗は対象の近くへ出し、
既存の再試行を使う。新しい管理画面・容量設定・起動モードは追加しない。編集command、
保存・publication・復旧の安全fenceを表示cacheで代替しない。全原本のcanonical検査を省かない。

## 2. 実データと、容量を分ける理由

原ZIP94,063,937B、82通常entry、展開97,537,289B、最大entry38,100,952B。
GLBは8192² JPEG2枚と4096² PNG1枚、4texture宣言（PNGを2宣言が参照）。
固有RGBA8の算術576MiB、4宣言のmip込み要求量894,784,848B。geometry検査量は約2.95M。
専用Chromium156／RTX5080の隔離実測では原寸decodeとuploadに成功したが、製品経路や
一般端末の合格ではない。原本hash・詳細な私的監査は公開物へ含めない。

圧縮ZIP、展開byte数、parser work、native decode、一時buffer、保持bitmap、GPU texture、
thumbnail cache、保存先の余裕は別の条件である。窓数だけでは単体巨大画像／GLBを制御
できず、thumbnail初回生成にも原寸decodeが必要な場合がある。残RAM／VRAMを正確に
取得できる前提を置かない。資源intentの予約はブラウザ内部全RAMの測定・保証ではない。

## 3. 変更するportsとimport境界

| 境界 | 役割・所有 | 変えないもの |
|---|---|---|
| assets/zipioのverified catalog | immutable Blob＋順序付きdescriptor、全entryの逐次CRC/hash/sniff、再open、AbortSignal、冪等dispose | 既存のnative STORE＋manifest reader、旧readZipEntries callers |
| projectFilesのLociMyu専用catalog adapter | descriptorから既存XLSX／CSV／LociMyu解析へ接続。本文配列を保持しない | legacy ImportPlanへ空／偽bytesを渡さない。source順・候補順・diagnostics・basename規則 |
| LociMyuSource／Conversion／Mapping | 原本Blob、compact facts、restartable body handle。選択entryだけを一時buffer化して解放 | receipt／sourcePath／mapping／preimage／recipe／ID／再評価の意味 |
| PC raster条件のtyped数値projection | PNG/JPEG単体・model画像work・JPEG scanをgeometry／animationから分離。既存FileValidationLimitsへ任意のflat正整数として渡す | nested object／runtime ownerをlimitsへ入れない。旧caller未指定のexact defaults |
| viewerのresource port | package／storage／UIを知らない予約・native作業queue・所有lease・解放 | core/platform/viewerからuiへimportしない。資源予約をdata authorityにしない |
| validationRenderのresident port | canonical全検査と、可視template／GPU residencyを分離。非表示・未使用templateを退避し再読込 | 未検査のmodelをreadyと偽らない。現在の必要なpreparation／保存fence |
| UIのMediaPreviewResources | workspace1個。immutable display identityで共有thumb、原寸modal1個 | 元画像・native動画音声・原寸GIF/WebP・zoom状態・本文／窓の配置 |

新module/import境界を作った時点でsceneCore.testを早期実行する。既存assets/io cycleを
広げず、LociMyu adapterから既存のreadonly解析を使う。新依存は追加しない。

2026-11-01具体化：runtime ownerは既存のcallable `PngDecoder` portに任意のreadonly
`rasterResources`として明示注入する。hostが検査decoder、変換proof、render／preview、UIへ
同じworkspace ownerを渡す。limits／source metadata／proof入力keyにはownerを含めない。
未指定の旧callerは既存動作を維持する。viewerの`rasterLoadScope`は実loaderの
`begin(done,error)` callbackだけをqueueし、180／186のengine objectやURL、画像optionsを
作り替えない。各loaderの既存bitmap trackerが保持を所有する。scope取消／失敗では
そのscopeのqueued／native jobをdrainしてからmodel予約を返し、workspace全queueを
閉じない。native permitとmodel-stage FIFOを別にし、外側stageから同じpermitを再取得しない。

## 4. 逐次ZIPとLociMyuの所有

原本は入力時にcaptureしたBlobとする。catalog descriptorはentry index/path、検査済み
actual byteLength／SHA、必要なsniff事実のみ。全model/image bytes、ImportedFile.data、
LociMyuBody.bytes、ValidatedGlb.bytes、mapped.blobs配列を計画の寿命へ残さない。

catalogの例示portは `withEntry(path, consumer, signal)` とrestartable body source。
zip.jsのstrict read＋checkSignatureがEOFまで完了して初めて成功とする。streamを返した
だけで検査済みとは扱わない。実byte数をchunk転送より先に計上し、宣言sizeとEOFの一致、
CRC、expected SHAを確認する。prefixがchunk境界で分かれてもsniffし、source-only／未選択
entryも最後まで検査する。中止したscanは不完全であり、再利用しない。

圧縮総容量に新しい128MiB枠を作らない。既存DEFAULT_ZIP_LIMITSの20k項目・展開2GiB・
単一entry1GiBを実展開の安全条件として使う。LociMyuがmaxFileBytes64MiBをZIP総量へ
流用していた狭枠を外す。選択payloadのparser条件、既存Project原本合計512MiB、保存先と
publication条件は別に維持する。メタデータの単一read64MiBはZIP総容量制限ではない。

| 実行条件 | 今回置換する範囲／残る範囲 |
|---|---|
| 外国形式ZIPの圧縮容量64MiB | 廃止してBlob/catalog＋全entry逐次検査へ。保存済み原ZIPの再検査にも同じ方式を使う |
| 実展開2GiB／entry1GiB／20k | 既存ZIP安全条件を維持。圧縮容量やRAMの保証には読み替えない |
| 非GS単体64MiB | 今回は既存parserのbuffer処理条件として残る。別のZIP総量制限へ移すものではない。Ki84の最大38,100,952Bはこの条件内 |
| Project原本合計512MiB | 現行の実行契約として残る。私的原ZIPをここへ移設／加算して別経路で拒否する変更はしない |
| PNG/JPEG画素／画像work | PC向けの下記raster条件へ分離し、新規／変換／再開／受信／出力／復元へ同じpolicyを渡す |

したがって「すべてのファイル容量制限をなくした」とは報告しない。まず同じKi84を一連で
扱う範囲を閉じる。単体parserやProject枠を越える資料の追加対応は、窓数の保証にせず、
別の段階読込／保存先条件として残す。一方向だけ通り再開・共有で拒否する差異を作らない。

既存path traversal、NFC/case／file-directory衝突、entry type、nested archive等を保持する。
現在のzipioに明示的なratio／encrypted／overlap app guardがあるとは記載しない。暗号化は
未対応として明示拒否。strict zip.jsのheader整合・全entry CRCを使い、新しいratio閾値を
容量保証として追加しない。実展開・処理work・取消・Quotaの失敗を区別する。

workbook候補順、preflight失敗candidateのappend順、selectedSourceIndex、raw analyzer
 diagnostics、fingerprints順、CSV mapとpath/basenameの意味を小規模の旧／新oracleで一致
させる。bodyのinspectionは必要entry1件ずつ。再評価・作成retryでは新しい一時所有を得る。
取消・再選択・画面終了はgenerationとAbortSignalで古い結果を破棄し、codec作業をdrain／
cancelしてからreaderを閉じる。解放済みhandleや失敗Promiseからpublishしない。

persistの順序とlease範囲を保持する。project underWriteLeaseはreceipt→既存private原本の
exact比較、またはstream保存→保存原本とのexact比較→initial記録までで解放する。
解放後にreceipt/initialを再readしてretained semantic検査を行い、CAS putはorigin-store自身の
 authority、Session初期化／recoverはSession自身のproject境界を使う。外側の同Project leaseを
保持したままSessionをawaitしない。両streamのchunk境界が違ってもbyte-for-byteで両EOFまで
照合し、SHAだけに置換しない。既存receiptや作成先が違えば、既存作業を変更しない。

cold再開／変換説明出力でも、保存原本のhash・size、全entry CRC/hash、選択した表・模型・
画像のsemantic検査とreport/mapping/initial proofの照合をやり直す。OPFS/native Blobと
MemoryFSの全copy fallbackを区別し、後者へ同じ省メモリ効果を主張しない。

## 5. workbook補助部品の限定受入れ

全XML/.relsをfatal UTF-8で読み、DTD/ENTITY・合計XML bytesの既存guardを維持する。
workbook/sharedStrings、全.rels、resolved sheet targetを拡張子や配置場所に関係なく厳密検査
する。既存xl/worksheetsも維持。sheetの列重複・範囲・行・shared-string参照を省かない。

消費先ではない `xl/drawings/drawing[0-9]+.xml`、`xl/theme/theme[0-9]+.xml`、
`xl/persons/person.xml` だけ、解釈しないsource-only部品としてnamespace prefixを許す。
未知部品の例外は増やさず、外部relsやnamespace付きRelationshipで参照検査を抜けない。
原本は保持し、補助部品をcanonical tableや描画への指示として解釈しない。

## 6. PC raster検査とruntime資源

PNG/JPEG専用の単体guardは実測済8192²＝67,108,864画素。単一GLB画像検査workはその3倍、
201,326,592画素を初期内部条件とする。これはresident RAMとは別で、各画像の構造検査と
実decodeは順次closeする。geometry maxValues8M／JSON4MiB／items100kと、WebP/GIFの
既存animation/frame workを広げない。JPEG scanはencoded byte処理として独立した有限
条件へ移し、geometry8Mを流用しない。初期scan条件はencoded byteLengthの2倍＋64KiBとし、
実コードのchargeと境界試験で過少・過剰計上を確認する。これは新codecの受入れ保証ではない。
旧callerは旧maxPixels/maxValuesの挙動をexactに維持する。

具体projectionは `maxStaticPixels`／`maxModelImagePixels`／`jpegScanBytesPerByte`／
`jpegScanAllowanceBytes` の4つの任意正整数。PC builderが4つ揃えて設定し、部分bundleは拒否。
PNG/JPEGだけが読み、他codecのmaxPixels／geometry maxValuesは変えない。全入口が同じ
limitsを伝播し、scan計算のsafe-integer overflowも拒否する。runtime資源ownerは別port。

modelの一時factsに、各source画像の寸法、raw RGBA8、loader bitmapのmultiplicityと
texture宣言／sampler／役割variantのmip intentを持つ。wireやprofileへ保存しない。同じbytes
や画像sourceだからという理由で別texture／bitmapのコストを0にしない。dedupは実loader
provenanceとobject identityで証明できた場合だけ行う。
全画像の構造・安全な寸法、GLB画像合算work、保守的multiplicity／mip factsはnative decoder／
Three proofを呼ぶ前に集めて計上する。拡張policyでdecode後に初めてpixelsをchargeする順序は
残さない。拒否した入力でnative decodeやGPU uploadが始まらないことを境界試験で確認する。

初期review用runtime設定は、256MiB（上の単体RGBA8）を1単位として、共有CPU raster／
一時encoded buffer intentを10単位、source texture＋既知合成target intentを8単位とする。
これは開いているworkspaceとpreview／検証／staged／原寸写真の**現在の所有**の調整値で、
Project受付cap・全RAM/VRAM保証・旧2/3GiB案の採用ではない。実装前reviewと計測で所有
見積りを確認する。geometry／SDK自身の既存work・500k・合成64MiB等は別の既存条件。

予約はnative decode／buffer materialize／texture uploadより前に取る。native作業queueと
live予約を分離し、decode完了でqueue permitが戻っても返却bitmapの予約は所有者へ移す。
bitmap.close／template.dispose／GPU disposalまでlive予約を返さない。非abortable decodeも
終了までpermitを保持し、late結果を閉じてから解放する。proof180の全CPU画像解放を終えて
から186表示decodeへ進む。in-flight1だけで全ProjectのRAM保持が解決するとはしない。
model-stageの逐次化とnative-image permitは別にする。GLTF proof/parse stageが内側の各画像
 decodeで取得するものと同じ非再入permitを保持したままawaitしない。自己stageの予約が
空くまで永久待機せず、退避しても不足する場合は局所的失敗／再試行に戻す。

非表示／未参照templateを先に退避する。全Projectに必要なcanonical検査と現在のpreparation
証明は保ち、hidden modelを検査省略でreadyにしない。保持する検査factsと、再作成できる
描画templateの寿命を分ける。可視Sceneを再開するときは同じbodyを再読込する。表示中や
staged所有が残って予約できなければ対象の表示準備だけを失敗／再試行にし、原本・記録・
前の安全な表示を捨てたり、黙ってsource画質を落としたりしない。保存を見た目だけで通さない。

初期canonical巡回で未検査modelが残る間は、画像を持つtemplateをproof値capture後に解放する。
次の検査用領域を先行表示が使い切らないためで、このraster表示は準備中のままとする。
Captionと画像なしの小Mesh／点／GSの先行利用は維持する。canonical完了後は可視demandだけ
再構築し、最後の可視templateは安全に引き継げる。本文／説明／選択だけの変更では既存
checked事実とtemplateを維持し、3Dの解放・再decodeを行わない。
表示更新が新しいresidentを待つ間、同じactive状態の再通知はpendingの表示需要を維持する。
保持中の旧表示へ需要を戻して新しいモデル／Proxyを飢餓状態にしない。実deactivationは
従来どおり需要を解放する。

compact作業パネルでCSS上3Dが非表示のときも、`WorkspaceViewportState.visible`を明示して
bridgeからruntimeをdeactivateする。`available`はSceneのmetadata解決可否として保持し、
Caption本文・検索・編集・保存の可否と3Dの表示寿命を混ぜない。省略した旧callerは可視を
維持する。初回の明示deactivateでもseed需要とtemplateを解放する一方、wide初回の
inactive update→activateでは従来どおりseedを保持する。再表示は同じposeと記録で再準備する。

非表示時の一覧の位置調整・親変更・座標追加は、Scene内のmetadata上の候補を示し、操作開始で
3Dを表示して準備する。実際の`WorkspaceSurface`は既存の可視・ready・同じSourceToken／Scene／
モデルの照合後だけ取得する。準備待ちの意図はUI内だけに保持し、取消・選択切替・更新・閉じるで
古い後着操作を捨てる。本文draftとfocusは保持し、自動確定や追加確認dialogを導入しない。
小画面で準備待ちの位置タスク自体にfocusを置いた場合は、同じ操作の座標が表示・有効になった
次の描画でX入力へ移す。取消ボタン等へ移動済みのfocusは奪わず、取消・対象変更・終了後は
後着focusも破棄する。既に準備済みの入口のfocusとIME保護は維持する。

main／previewの各actual WebGLRendererで、upload/render/initTextureの前に元画像辺と
capabilities.maxTextureSizeを照合する。context／renderer再作成後も最終guardを行う。
Threeの暗黙resizeやresize helperを原寸成功の代用にしない。通常写真の受付へ3D GPU辺の
条件を流用しない。GPU解放はsource Texture.dispose→renderer.disposeで、CPU画像の解放は
そのtemplate ownerの寿命で行う。過去Sceneのsource GPU所有も残さない。

## 7. 実thumbnailと原寸modal

MediaPreviewResourcesをworkspaceに1個置く。keyはProject/resource scopeとimmutable
表示Blobのalgorithm/digest/byteLength/MIME。HEICはportableDisplay側を含める。attachment IDや
毎renderのload closure identityだけをkeyにしない。同じ写真の多窓は共有し、本文・説明・
metadata tokenだけの変更で再decodeしない。source変更時は古い結果を表示しない。

source read／ports.imageより前にthumbnail jobをqueueする。初期UI調整値は最長辺320px、
UI portは表示BlobのbyteLengthを渡し、source取得の前にencoded一時量（4倍）を予約する。
これは読み込み中の検査／copyの所有で、取得後に返却し、native bitmapの別予約へ進む。
modelも検証済BlobRefのbyteLengthから読込前予約し、同じmodel-stageでfacts／templateへ
移す。file-backed GSはこの配列化を追加せず、既存stream所有を維持する。
同時生成1、縮小表示cacheのdecoded-intent16MiB。原本の変更・新容量保証ではない。
160CSSpx／DPR2のcardを想定した内部値で、実画面の品質確認で調整する。
既存検証を通ったsourceをnative decode→小canvas→derived Blobにし、finallyでbitmap.close、
canvas寸法reset、source URL revoke、一時source参照の解放を行う。成功した原本Blob／Promiseを
projectMedia／Reviewへ永続memoしない。in-flight coalescingだけを保持する。

可視・mounted cardだけがleaseを要求する。panel非表示、picker折畳み、ページ変更、窓close、
scope変更で解放する。本文・窓の重なり順・位置・draftは保持する。独自の背面occlusion推定は
行わず、軽いderived thumbnailを共有する。cacheが埋まった場合も原寸へ自動fallbackしない。
未参照LRUを退避しても全entryがleasedで空かない場合はnative permitを持って待ち続けず、
該当cardの局所的な準備失敗と既存retryへ戻す。原寸を開く操作は残す。active originalと
利用者の明示retryを未開始thumbnailより優先し、非表示／解放済jobをqueueから除く。
実行中のnonabortable decodeは終了・cleanupまで所有し、割り込んで多重decodeしない。
既存の画像を開く操作は残し、待機／準備失敗／再試行を該当cardで区別する。

原寸modalは1つの原本sourceを所有する。thumbnail引伸ばしを原寸としない。全体／原寸／
zoom／panは同じ原本を使い、通常render／resizeではzoom保持、source切替／closeでreset。
原寸GIF/WebP再生・動画音声native controls・Exif向き・HEIC portable displayを維持する。
UI job queueがports.image内の同じnative queueを保持したまま再取得してdeadlockしないよう、
source-read admissionとnative decode permitを分ける。GLB／検証／原寸画像と共有予約を使う。

既存のWebP/GIF検査とnative-only HEICにも、`createRasterDecoders`から既存`PhotoDecoder`／
`MediaDecoders.heic`を注入する。codec・構造・animation・work条件を変更せず、同じworkspaceの
native queueとpixel／encoded intentを使い、返bitmap.closeまで所有する。HEICのtimeout／取消で
外側が先に戻っても、実native終了・late bitmap解放までpermitと予約を保持する。
HEICのowned decoder返値は、canvasへ渡す実native sourceを明示の一時portとして保持する。
width／height／closeだけのDTOやProxyをCanvasImageSourceとして渡さず、encoder終了まで
同じbitmap ownerを保持する。このnative参照はwire／record／証明へ入れない。
共通canvas encoderの任意runtime所有optionは既定を旧動作（取消時の即時cleanup）にし、
PCの資源owner付きcompositionだけ実callbackまでの保持を明示選択する。codec処理や
利用者向けの操作経路は分けず、既存standalone callerの取消契約を維持する。
HEIC構造読取には任意のruntime ownerを明示注入し、`maxValues`により制約される入力＋item本文
copyの保守的上界をparse前に予約する。重複extentを入力size一倍と見なさない。portable原本の
構造検査にも適用し、資源不足／取消を未対応codec案内へ変えない。旧owner省略時は従来動作。

画像UIは中立の`dimensions(bytes,mime)` callbackを受け、PNG/JPEG/GIF/WebP以外の既存HEICの
寸法をhost側の同じbounded parserから得る。blob.arrayBuffer用のUI予約とparserのitem-copy予約を
分け、viewerへpackage形式の依存を加えない。新codec・永続PNGの自動生成は行わない。
native成功を注入した旧unpaired HEICのthumbnail／原寸／close／取消とWebP/GIFの共有所有を
focusedで確認する。これを実HEIC対応端末での表示合格と混同しない。

## 8. 受入れと実行順

- 旧／新小規模LociMyuでreport、receipt、ID、fingerprints、diagnostics、選択順をexact比較。
- CRCの末尾source-only破損、宣言sizeと実展開、暗号、path/type、UTF8/DTD/.rels、未知XMLを拒否。
  消費先を補助pathや.dataへ移した場合も厳密検査。正常な未消費補助XMLは原本に保持。
- 原本stream比較は異なるchunk境界、先頭／中間／末尾破損、short/extra/empty chunk、両EOF。
  取消／再選択／Quota／lock loss／部分保存／cold再検査と後の編集保持を既存service試験で補う。
- PNG/JPEG境界、geometry／animation不変、queueと予約の取消／late-result／返却をfocused検査。
- 少なくとも2model／Sceneの切替、hidden退避と再開、preview排他、180→186、context復旧、
  原寸画像の切替／close、資源不足→回復を小規模実renderer経路で確認。容量probeを一般保証にしない。
- wide初回seed、compact初回／切替の実deactivate、再表示時のpose保持、準備中の位置操作取消と
  target照合を確認する。FileのTab／Shift+Tabは720×500CSS／DPR2でもsticky header／footerに
  入力本文を隠さない。これはlayout倍率相当で、実ブラウザzoomの合格とは区別する。
- 高さ640px以下ではCaption一覧の最小内容高で詳細が0pxに潰れないよう、詳細行の最低高を
  240pxとしCaption task自身を縦scroll可能にする。通常高さの43%配分・一覧/詳細の同時DOM・
  内部本文scrollは保持し、Tab/Shift+Tabと適用/取消の実hit、IME/draftを確認する。
- 既存image-inspectionを拡張して本物の縮小decode、共有key、多窓／非表示解放、原寸細部、
  focus／IME／zoom保持と原本hash不変を確認。巨大往復をfieldごとに複製しない。
- 私的exact Ki84で1本の変換→閲覧／原寸→編集→外部保存→別環境→返送→復元／offlineを接続。
  原表由来4Scene／103Caption／IDなし6行／重複legacy ID4件を照合する。mediaはmapping上の
  27attachments／26unique候補と15HEIC未添付／22未解決を出発点とし、構造・実decodeで確定する。
  旧Nativeの24mediaを正解にしない。透視投影近似や07nの見た目変更は既承認規則と説明で確認。
- 最終差分の独立review、必要なDesktop／offline、frozen source/testのcheckpointと隔離検査を
  直列実行する。中断・収集のみ・旧routeを合格に加算しない。通常公開／iOSは別境界。

## 9. 旧案の位置付け

当初の圧縮ZIP128MiB／Project全template GPU2GiB／共有bitmap+scratch3GiB案は採用しない。
POはファイル容量と同時負荷を分離する方向を明示承認した。旧案と隔離probeは比較資料で、
現在の所有別runtime調整値の承認根拠や保存形式ではない。具体値の同じ数字が現れても、
旧案の自動批准とは扱わず、本書の所有・検査・実行条件を独立reviewする。
