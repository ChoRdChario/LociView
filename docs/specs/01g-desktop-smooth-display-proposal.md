# PC候補の透過表示と描画解像度

Status: **APPROVED — PO2026-10-28「進めてください」により本案の一括実装を承認。PC候補限定。一般採用・公開は含まない。**

## 利用者が得る結果と今回の判断

半透明のモデルとGSを、別々の完成画像を重ねず一つの3D表示で確認できるようにする。
[01f](01f-desktop-smooth-composition-evaluation.md)の公開APIによる技術評価では、
SH4・50万点／1080pの描画・回転・順序変更・GPU復旧が動作した。一方、GPU処理には
余裕の低下があり、同じ方式の1440pでは追加バッファが暫定64MiBを超える。
単に実装へ進む前に、描画解像度と候補接続の方針を確定する必要がある。
正確な実行値・ブラウザ・失敗・未実行項目は[todo](../../tasks/todo.md)を参照する。

**推奨案は、PC候補では滑らかな透過表示を優先し、必要時だけ3D表示の内部解像度を
自動調整する。** 初回の内部画素数上限は検証した1080p相当（2,073,600画素）かつ
追加バッファ64MiB未満。画面の縦横比を保ち、拡大時の3D像は少し柔らかくなる。
文字・一覧・編集操作は画面本来の解像度を保つ。原本、SH全係数、位置と記録は変えない。
この上限は採用済みの性能保証ではなく、今回判断するPC候補の最初の範囲とする。

代案は全解像度を保ち、容量超過時は07nと同じ説明付き非表示を続けること。
暫定予算の増額、元モデルの簡略化、SH次数の削減は提案しない。

また、[03 §7](03-gates-and-delivery.md#7-optional-g1-d--smooth-transparency-feasibility)
のcore／実機条件を満たす前に**01e静的PC候補だけ**へ実装・接続する例外を求める。
実装は新たな独立production reviewと下記検証を経る。通常PWA・公開・deployment、
G1-D採用、iOS合格を含めない。01fの評価開始の例外だけでは、この接続は許可されない。
POはこの二点と追加表示policyを含む方針を承認した。通常の実装・検証・修正は
再承認を挟まず進める。実装・検証状態はtodoが管理する。

## 実装境界

- Three0.186／GSL1.4.3固定。公開root APIと所有material／targetだけを使い、
  fork・deep import・private field・新依存・CDNを追加しない。
- PoCを製品へ移植しない。viewerの中立的な表示資源port、GS coordinatorの所有者、
  typed provider由来のmaterial effectsを先に定義し、独立レビュー後に製品実装する。
  viewerにProject、storage、package、UIを持ち込まない。
- 対象は01eのtyped ProjectScene表示だけ。旧形式／Nativeの通常経路は変更しない。
  map1のBLEND入力／編集制限とmap2の意味を保持し、recipe番号やRepresentationの
  profileからProjectのsemantic profileを推定しない。
- 元のmaterialとtextureは変更せず、派生materialとrender targetを表示所有者が破棄する。
  opaque depthを共有し、透過passがそのdepthを書き換えたりclearしたりしない。
  線形で蓄積・光学厚を合成し、表示色への変換は最後に一度だけ行う。
- 追加バッファは実formatと実寸法で計算する。上限内に収まるよう内部寸法を等比縮小し、
  deviceの最大寸法も検査する。大きなtargetを確保してから縮小判定する順序にはしない。
  framebuffer／float blend／HDR精度を実描画probeで確認する。
  64MiBはdocument全体の追加targetの合計とし、同時view、確保中、resizeで入れ替える
  新旧targetも実際の解放まで計上する。viewごとに64MiBを割り当てない。
  予約できない場合は既存の有効な表示を保ち、上限内の寸法または局所fallbackを使う。
- 画面上の選択位置は実canvasと内部描画寸法から対応付ける。既存opaque／maskの
  Boolean判定、smoothのpick拒否、明示GS Proxyの規則を保持する。
  smooth描画の成功を新しいpinや遮蔽閾値の根拠にせず、既存の拒否を緩めない。
  保存済み位置はreraycastせず、通常の手動位置補正を保持する。
  丸めた実寸法・renderScale・世代をRenderPlan、表示、coverage、pointer／Proxy
  probeで共有する。点径のCSS pxと近傍6pxを保ち、縮小によって既存のDPR上限を
  緩めない。特にDPR>2を対応済みとして扱わない。
- 非対応・確保失敗・context lossは局所的に説明し、原本とsmooth意図を保持する。
  既存の再試行・不透明／切り抜き表示・Caption操作を再利用する。
  「非表示」から「対応済み」へ説明だけを先に変えない。
- 表示には近似であることと、内部解像度調整が起きた場合の結果を短く伝える。
  内部エンジンや透過方式を選ぶカード、通常時の手動解像度設定は増やさない。
- カメラ／sortの通知で既に有効な健全rendererを再度有効にするときは、その保持だけで
  寸法を再取得しない。実寸法の変更はResizeObserver、DPR変更は既存の描画ループで
  検出し、初回・無効状態からの復帰・未生成renderer・明示再試行は従来どおり準備する。
  inactive時のGS予定の取消、操作／視点のguard、一覧・状態通知やSession契約は変えない。
- viewportの描画・sort通知によるUI再描画は、次のanimation frameで一度にまとめ、
  その時点のprovider／viewportを読み直す。UI操作・command・ピン／モデル提案の
  直接renderは即時のままとし、待機中の通知を取り消す。unmountは予約と遅延callbackを
  無効にする。RAFのない記録用DOMでは従来の同期通知を保つ。表示の投影・状態・
  View capture／pickの鮮度、操作時guard、保存／復旧のfenceを省略する仕組みにしない。
- metadata／既存profile／recipe／wire、source保存、Session command、保存・共有・復旧の
  fenceを変更しない。評価のGPU計測とProjectの保存性能を混同しない。

## 追加の表示policy

既存の`gs-gsl-webgl2-packed-linear-1`はsorted premultiplied GS／RGBA16Fを明示する。
そのbyte・digest・goldenとfallbackを保持し、WBOITを同じpolicyの合格として扱わない。
今回の判断には、**viewport限定の追加compositor policy**の定義を含める。
保存profile／source解釈の変更や既存dataへの書戻しは行わない。

公開GS shaderのkernel／discard後のpremultiplied線形RGBと最終alpha、
07n Meshの最終alphaに、次の共通の閉じた数式を適用する。
`a=clamp(finalAlpha,0,1)`、
`w=clamp((min(1,10*a)+0.01)^3 * 1000 * (1-0.9*z)^3,0.01,30)`。
RGBA32Fへ`(premultipliedRGB*w,a*w)`、RG32Fへ光学厚とalpha1の件数を加算する。
alpha1では`(tau,count)=(0,1)`、それ以外は`(-log(1-a),0)`。
`a<0.001`では桁落ちを防ぐ`a+a*a/2+a*a*a/3`を用いる。
count>0ならrevealage0、それ以外は`exp(-sumTau)`。
合成色は重み付き平均RGB×(1-revealage)＋opaqueRGB×revealage。
alpha0でaccumが0の場合は平均RGBを0とする。原色／HDRをclampしない。

policyの正確なJSON／digestとalpha端点・HDR・順序のgoldensは、製品実装前に
この数式と一致する形で固定し、独立レビューする。未知policyや公開shaderの形状不一致は
明示的に拒否する。評価コードをそのまま登録・有効化しない。

## 接続portと資源所有

- `desktopEntry`だけがdocument内の共有target予算を作り、`BrowserWorkspaceComposition`
  の任意の表示portを通じて編集・Review・モデル候補のviewportへ渡す。DEV／URLでは有効化しない。
- `validationRender`は既存semantic profileで解釈済みの効果から、所有Mesh材質へ
  source coverage→appearance→final alphaのhookを適用する。viewerには確認済み数値と
  THREE資源だけを渡す。map1の入力／編集権限を変えない。
- `gsRender`はdecode／sort／ready／取消・解放を一元所有し、任意の中立的な描画callbackに
  準備済みGS object／元ShaderMaterial／既存linear base targetを渡す。材質交換は
  try/finallyで戻し、合成完了後にreadyを進める。従来呼出しの01c経路は維持する。
- `smoothComposite`はMeshの派生材質とMRT／resolve資源を所有する。GS baseは借用し、
  Mesh-only時はbaseとdepthも所有する。保守的な予算では両経路ともbase8＋depth4＋
  accumulation16＋optical depth8の**36bytes/pixel**を計上する。1080p相当は最大値であり、
  この実費・同時view・device上限によってさらに縮小してよい。既存01c予算を借りて
  新しいMesh-only baseを無料扱いしない。
  GS借用時はGS ownerが12bytes/pixel、compositorが24bytes/pixelを個別に保有し、
  既存baseの世代・寸法を確認してclaimしてからMRTを確保する。compositorだけを閉じても
  baseの計上を戻さず、その実targetの破棄／resize完了時にGS ownerが解放する。
- viewportは共通scaleから丸めたRenderPlanを確定し、canvasのCSS寸法を保ってdrawing
  bufferだけを変更する。同じsnapshotを点とcoverage/pointerへ渡し、変更時にpick世代を進める。
  resizeは旧targetを解放してから新しい確保を行い、解放前に予算を戻さない。
  予約不可なら既存の有効表示を保持し、確保失敗なら説明付きの既存base fallbackに戻る。
- sceneの全transparent材質を推測分類しない。実モデルのsmooth descriptorを列挙して
  GSと合成する。操作helperはその対象に含めず、既存の操作表示を維持する。
- 位置確認では、確認済みsmooth markerと交差する各canonical probe rayを、alphaや
  前後の閾値で受理せず`unknown`にする。クリック画素と近傍6pxの各候補画素へ同じ
  規則を適用し、材質slot・clip範囲・平行投影を保持する。交差しないrayは既存の
  Boolean判定を使う。旧来の未分類透明材質の全体拒否は変更しない。
  準備中・fallbackで実際に非表示のsmooth面は、その表示世代のpickからも除く。
- conversion noticeと材質panelへ同じtrusted表示能力を渡す。PC候補の事前説明は
  近似表示と条件付き非表示を伝え、viewportはprobe／描画後の実際の状態を伝える。

## 一つの完了条件

実際のPC候補で、変換前説明→07n材質の編集→Mesh／点／GS・Proxyとの表示→
保存・受渡し→復旧・再開まで、見た目の変更とデータ保持が整合することを確認する。
既存のファイル不変条件テストを再利用し、表示の変更境界に代表的な接続flowを加える。

alpha0・1直下・1、元MASK／BLEND、factor・texture・RGBA頂点色、chroma、陰影と両面、
HDRの実画素を確認する。透過対象の欠落や順序反転、既存pickの不整合を残さない。
小画面／1080p／1440p／4K相当とDPR変更、複数view、resize、失敗・再試行、
live context loss、連続load／unloadを確認し、実target bytesと解放を記録する。
高解像度の縮小で位置選択やUIの文字がずれないことを検証する。

同じ120秒のcamera traceによるp95 frame間隔、CPU送出、GPU query、sort処理を分けて
測る。rAFが保たれることだけでGPU負荷増を隠さず、30%／64MiBの現行基準は維持する。
より弱いPCの未実行結果を推測しない。physical iOS・background・offline／PWA・
core hardening・一般採用・公開の未達項目は、そのまま残す。

承認後は、port／受入れ条件の独立レビュー→製品実装→接続ブラウザ検証→
最終checkと独立diff review→適切なg0 checkpointへ続ける。新しい材質／選択方式、
容量の増額、依存追加、一般採用／公開が必要になった場合だけ該当作業を止める。
