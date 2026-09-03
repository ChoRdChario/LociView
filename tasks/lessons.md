# Lessons

## 2026-09-03: representative sampleの不在を製品scopeの不在とみなさない

- 一つのrepresentative sourceに動画・音声が含まれないことは、そのsourceでの
  回帰証拠に限られる。将来の通常利用で必要な製品機能を不要とする根拠には
  しない。
- 「初回public candidateでは延期する」と「製品scopeから外す」を分ける。
  Captionの動画・音声はpost-candidateの必須開発範囲として維持し、exact
  format／codec、schema／package version、viewer、privacy、iPhone acceptanceは
  実装前に別のbounded contractとして確定する。
- 段階実装でも、現在の対応形式を恒久的な情報設計へ焼き付けない。利用者には
  `添付メディア`という共通概念を示し、ID・順序・viewer stageはmedia-neutralに
  保つ一方、未実装の動画・音声controlや空の再生領域は先に表示しない。
- private representativeで確認できた形式は、その形式だけの実行証拠である。
  browser-native decode、特定dependency、orientationやphysical-iPhone対応は
  representativeを使った各targetの実行結果なしに一般対応と主張しない。

## 2026-09-01: LociMyuのCaption sheetとmaterialを別々に移行しない

- LociMyuではactive `sheetGid`がCaption群、material current-state、任意の
  viewを一緒に切り替える。DisplaySet受入では各recordの件数だけでなく、sheet
  切替時にこの連動がuser-visibleに復元されるところまで確認する。
- XLSXでexact GID registryが欠ける実データを、全件report-onlyのまま互換完了
  としない。一方で無言のordinal推測も行わず、複数source表が同じ完全な順序を
  示す場合だけ一括確認候補にし、不一致・未確認はfail closedにする。

## 2026-08-31: manual acceptanceでは正しい入力laneまで案内する

- `.lociview` backup restoreとLociMyu ZIP conversionは別入力である。単に
  「ZIPを入れる」と案内すると、native homeのbackup欄へ入れて失敗させる。
- acceptance手順には開始画面、押すlink、drop先の表示名まで書く。UIが旧画面
  を経由させる場合はP2へ記録し、変換失敗と誤診させない。

## 2026-08-31: legacyの意図された一対多を曖昧候補と誤認しない

- LociMyuのmaterialKeyはtrim後のマテリアル名であり、同名material全件へ
  意図的に適用される。複数一致をwinner選択が必要な曖昧さとして拒否しない。
- legacy名のfan-outは変換時だけに行い、各一致先をstableなnative slot record
  へ展開する。native/path aliasや曖昧一致を同じ索引へ混ぜない。
- converterが値を保存しても、sourceで有効な表示設定を強制OFFにすれば互換
  ではない。source-authority不足によるinactiveとreceiver側の欠落を分けて
  診断する。

## 2026-08-31: IDのないLociMyu Caption行を破損と決めつけない

- 実運用LociMyuでは、他セルに値が残っていても安定Caption IDが空の行が
  正当に存在し得る。これを自動的に「source修正が必要な破損」と分類しない。
- Product Ownerが空行扱いを批准したdirect adapterでは、trim後のIDセルが
  空の行だけをCaption生成・duplicate occurrence・digest計算から除外し、元
  sourceを変更せずreportへ残す。
- この例外を不正な非空ID、duplicate canonical key、digest collisionへ広げ
  ない。後続Captionと元rowの対応も同じfilterで維持し、行ずれによる画像・
  座標の誤所属を防ぐ。

## 2026-08-30: legacy conversion needs a usable native receiver first

- A conversion report is not a substitute for a native product capability when
  the source feature is an approved everyday workflow. For LociMyu/frozen-v1,
  DisplaySet material appearance must have a usable native destination before
  the converter is called complete.
- Rule: prove the missing destination with one representative input, then add
  only that receiver by reusing the existing product behavior. Do not turn the
  correction into a generalized appearance framework, renderer abstraction or
  DisplaySet/Asset-visibility coupling.

## 2026-07-16: 既存機能の廃止提案は運用ヒアリングを先にする

- 設計初版で「シート切替はタグで代替・廃止」と提案したが、実運用ではシート切替が「マテリアルの見え方（半透明/Unlit）× キャプション位置 × ビュー」を束ねた**見え方セット**として使われており、単なる分類機能ではなかった
- ルール: LociMyuの既存機能を削る・簡略化する提案をする前に、その機能が実運用でどう使われているかを必ず確認する。機能の表面的な形（シート）ではなく、運用上の役割（見え方の切替）を見る

## 2026-07-20: 依存追加時は脆弱性を確認し、用途に照らして判断する

- xlsx読取のためSheetJS(npm `xlsx`)を入れたところ、修正版が公開されていないPrototype Pollution/ReDoS（high）が検出された
- 本アプリは「他人が作ったZIPを解析する」用途であり、パーサの脆弱性は直接の攻撃面になる。→ 依存を外し、必要な機能（読み取り専用・セル値取得のみ）を自前実装した（`src/io/xlsx.ts`、依存ゼロ・線形時間の正規表現のみ）
- ルール: 依存を追加したら `npm audit` を必ず確認する。脆弱性がある場合、「機能のどこまでが本当に必要か」を問い直す。全機能ライブラリの一部だけが必要なら、自前実装が最も安全で軽いことが多い

## 2026-07-21: 移行機能は合成データではなく実データで検証する

ユーザーの実データ（LociMyu実プロジェクト）を投入したところ、合成テストでは全て通っていた移行機能に5件の不具合が見つかった。

1. **gidの正体を取り違えていた** — `__LM_MATERIALS.sheetGid` はGoogle Sheetsの内部ID（`617884617`）だが、xlsxにはこれが保存されない。私はxlsxのシート番号（1,2,3）をgidとして使っていたため、マテリアル・ビューが一切正しいセットに割り当たらなかった。→ `__LM_SHEET_NAMES`（LociMyuが記録している対応表）＋出現順の推定で解決
2. **xlsxの数値が指数表記** — `6.17884617E8`。合成データでは文字列で書いていたため露見しなかった
3. **`Number('') === 0` かつ `isFinite(0) === true`** — 空欄のfov列が0になり、平行投影のfrustumが潰れて画面が真っ暗になった。fallbackが効かない典型的な罠
4. **実運用では名前付きビューが存在しない** — 保存されていたのは `__last`（最後に見ていた視点）だけ。これを「内部用」としてスキップしていたため、視点が1つも移行されなかった
5. **バックアップファイルの同梱** — `LociMyu Save.xlsx` と `LociMyu Save backup.xlsx` の両方を読み、同一IDのキャプションが二重生成されて所属セットが壊れていた

- ルール: 変換・移行系の機能は、**必ず実データで一度通す**。合成テストは自分の理解を検証するだけで、他システムの実際の出力形式は検証できない。特に「他システムが書いたファイル」を読む機能では、仕様の推測が外れていても合成テストは全て通ってしまう
- ルール: 数値パースのfallbackは `Number.isFinite` だけでは不十分。空文字を明示的に弾く
- ルール: 元実装のバグを修正した場合、移行時に「当時の見え方」が変わる。修正が正しくても、移行では元の挙動を再現し、変更点を利用者に伝える

## 2026-06-29: 実証済みのZIP運用はUI/UXを含むシステムとして改善する

- ZIP方式を固定成果物の手作業配布だけと捉えず、生成、更新、差分確認、source folder導線まで含めて評価する。
- ユーザーが「ZIPでなければ成立しなかった」という実績を示した場合、理論上純粋な代替方式より、実証済み方式を安全で短い操作へ変える案を優先する。
- 編集元とruntime配布物を分離し、可搬containerを交換媒体として扱う。

## 2026-06-30: HTML parserの安全性は実際のsinkで検証する

- `innerHTML`、SVG、template、select等の挙動は、一般論や`script`の非実行だけでXSS可否を判断しない。
- 実コードと同じ挿入先・template・対象browserで、DOM注入、event属性残存、自動実行を分けた最小PoCを行う。

## 2026-08-16: GSとmeshの共存には同一空間の補修・交差を含める

- meshは別表示物だけでなく、GS欠損部を補うため同一領域で交差・重複し得る。
- `interactionProxy`、`visualPatch`、`splatExclusion`を異なるroleとして保存・描画し、interaction-only proxyをvisual/depthへ流用しない。通常`meshPrimary`をGSのraycast surfaceにする将来案は別の明示的なpolicyを要し、初回標準へ混ぜない。
- 不透明補修でも境界のちらつき、halo、二重表現を評価する。

## 2026-08-16: 半透明は数値ではなく合成意図としてモデル化する

- source material、user override、requested compositing policy、backendが選んだeffective modeを分離する。
- mask/ditherによるcoverageと、smooth blend/transmissionによる光学的透明を区別する。
- GSと交差するsmooth transparencyを保証できないbackendでは近似であることをUIへ示し、renderer固有の`depthWrite`や`renderOrder`を永続化しない。

## 2026-08-16: 閉じたmeshを前面・背面の一組へ単純化しない

- 航空機のような凹凸、翼、胴体を持つ形状では、一画素の視線上に多数のmesh面が並ぶ。
- 単純なfront/back depth二層を一般解として提案せず、Mesh、GS、Compareと、保証範囲を限定したIntegratedを分ける。
- 比較用途ではwipe、flicker、wireframe、dither等、厳密透明合成を要求しないUXも正式な解法として検討する。

## 2026-08-29: renderer種別を製品の表示単位へ昇格させない

- Mesh/GS合成の技術検討から、Mesh・GS・Compare・Integratedを独立した必須product modeとして仕様化したが、Product Ownerの本来の要求は、複数形式・複数Assetを共通Project座標内の独立レイヤーとして配置・表示・編集・保存することだった。
- ルール: ユーザーが表示／非表示を切り替える一次単位は読み込んだAssetであり、Mesh、通常点群、GS等はRepresentation／描画方式として扱う。技術的fallbackや診断案を、明示要求なしにMVP modeやrelease gateへ昇格させない。
- ルール: LociMyu由来のシート切替を単なるCaption分類とみなさず、Caption所属、set単位material appearance、任意のdefault viewを束ねる「見え方セット」として維持する。新しい表示設計で迷った場合は、正本を推測で置き換えずLociMyuの実際の操作を確認する。
- ルール: DisplaySetをgeometry layerやper-Asset visibility fieldへ拡張しない。visibilityの永続化位置はbounded implementationで既存presentation/snapshotとの差を確認してから決める。

## 2026-08-16: audit copyを現行実装だと仮定しない

- 製品名や世代が変わっている場合、最初にcanonical repository、entry point、git ref、build metadataを特定する。
- 現行コードが見つからない時は旧codeから断定せず、確認できた版、確認できない版、必要資料を明示する。

## 2026-08-18: 技術的G0より前にactive workspaceを一つにする

- 旧版展開物、添付ZIP、audit copy、現行repoが同じ探索範囲にあると、検索量だけでなく正本誤認が発生する。
- 設計・fixture固定・実装前にcanonical repository、baseline commit、active source root、archive root、generated/dependency exclusionsを固定する。
- ファイル数削減のために健全なmoduleを結合しない。削減対象は重複source、展開済みarchive、生成物、無効repo、raw researchである。
- 整理前にhash manifestと復元可能なbackupを作り、build/testが同等であることを確認する。

## 2026-08-19: 内部provenanceを常時UI警告へ直結させない

- GS/proxy由来という内部hit方式は再現・診断・将来の再バインドに有用だが、注釈ピンをユーザーがギズモで修正でき、測量精度を製品が主張しない場合、常時「概算」バッジを付ける必要はない。
- ルール: 安全性metadataの保存、製品全体の非測量保証、通常UIの表示を分離して判断する。技術的な不確実性を機械的に常時警告へ変換せず、ユーザーが取れる修正行動と警告疲れを考慮する。

## 2026-08-23: 自律開発ではslice間にgate基準のメタ監査を入れる

- characterizationを追加し続けるだけでは、失敗境界の理解は深まってもG0-Sのproduction defectは減らない。S0承認後はtests/fixturesの増分に対してproduction修正が大幅に遅れ、同じOP/BLOBリスクを複数sliceで細分化し過ぎた
- ルール: 3〜4 sliceごと、tests-only sliceを追加する前、またはproduction変更量がacceptance増分に比べて小さい時に、承認済みgate、未解消xfail、production/test差分、外部証拠、critical pathをゼロベースで再監査する
- ルール: 十分なacceptanceが既にある項目は新しいmatrixを増やさずroot fixへ移る。各sliceは少なくとも1つのrelease-blocking defectまたは外部gateを明確に閉じ、focused検証後にscope膨張と重複を再評価してからfull検証へ進む
- ルール: 実機・実データ・product-owner批准はcode workで代替しない。production laneと外部evidence laneを分け、待ち項目を明示的に並行管理する

## 2026-08-24: 長期プロジェクトと長期Codexセッションを分離する

- clean commit、task review、仕様、acceptanceがrepositoryへ外部化済みなら、長期gateを理由に長大化した同一セッションを維持しない。context圧縮、canonical workspaceの再確認、過去scopeの再読、stale diff監査が増えた時点でfresh sessionへ切り替える
- 1 branchのwriterは常に1つにする。並列化は原則2つまでのread-only監査に限定し、full test、build、fixture/evidence verifierなど同じworkspaceを使う重い処理は直列に実行する
- production待ちのtest writer、複数writerのshared-tree編集、長時間応答しないpatchを待ち続けない。full test/buildの正常な実行時間ではなく、5分を超えて進捗のないpatch/writer停滞、権限失敗、canonical repository不一致が起きたら中止してrootへ戻し、clean statusから再計画する
- writerの最終変更後にauditorはlatest treeを再読する。stage後はexact index、unstaged/untrackedゼロ、cached diff-checkを確認し、test/build/review実績をそのcached treeにだけ帰属させる
- 小さいexpected-failureを減らせることだけでは次sliceを正当化しない。外部evidence、実機、product/spec決定、lock/journal/typed issue APIがcritical pathなら、repository内micro-sliceより先にその依存を明示して停止する

## 2026-08-24: legacy product import and internal schema migration are different requirements

- Do not collapse LociMyu XLSX/model/image dataset conversion into LociView v1-package-to-v2 migration. They have different source shapes, user entry points and acceptance evidence even if they later share services.
- When the Product Owner reaffirms a foundational compatibility outcome, place it in the normative product contract in the same slice; a partly superseded vision note or chat history is not enough to preserve it.

## 2026-08-24: 非プログラマーPOには大きな仕組みを口語で説明して確認する

- 通常の実装詳細や可逆なプログラミング判断は自律的に進める。
- アーキテクチャ、security境界、運用process、Release手順など大きな仕組みを変える前には、利用者や運用に何が起きるか、何が許可され何がまだ許可されないかを口語で説明し、Product Ownerに確認する。
- 批准済みの仕組みの範囲内では細部ごとに再確認を求めず、批准範囲を越える時点で止まる。

## 2026-08-26: 幅広い利用者には安全な自動処理と後回し可能なレビューを優先する

- 技術的に安全で非損失な既定処理がある場合、一般利用者へ細かなID・移行・保存判断を連続して求めず、ツール側で全件を保持して進める。
- 自動確定できない関連付けや曖昧さは、黙って推測・削除・統合せず、通常作業を妨げない範囲でレビュー待ちとして蓄積し、詳しい利用者や支援者が後からまとめて解決できるようにする。
- 通常UIは短い結果と必要な行動だけを示し、技術的な根拠や個別問題は段階的に開けるようにする。継続がデータ損失・誤関連・不変条件違反を起こす場合だけ、影響単位を限定して止める。

## 2026-08-26: severityとdelivery priorityを分離する

- レビューで問題を発見した事実だけではactive scopeへ取り込まない。現sliceのacceptance、active gate exit、データ破壊・重大security・重大互換性、または大幅な後続手戻り防止のいずれにも該当しないP2は原則backlogとし、P1も同じ因果を確認する。
- reviewerは通常1名、security・storage・migration・wire compatibilityで独立したrisk classがある場合のみ最大2名とする。初回reviewと受け入れたP0/P1修正のtargeted確認後は探索を再開せず、P2ゼロを完了条件にしない。
- 既存acceptanceがroot defectを十分に拘束している場合は追加test・fixture・oracleを作らない。sliceはrelease blockerまたはgate exit rowを1つ閉じる単位とし、xfail/todo件数の削減だけで開始しない。
- full matrixは最終の実行系treeで原則1回とし、その後が結果記録だけなら静的確認に限定する。exact release-candidate treeの最終matrixは別に実行する。
- external evidenceは一括して「外部待ち」にせず、repository準備、Codex実行、物理端末操作、外部data、Product Owner批准、前項待ちへ分解する。実機runはfixed fixture/trace/instrumentationが揃ってから一度に実施し、code workで代替しない。
- monolithic gateが無関係な後続laneを止めている疑いがある場合も黙ってgateを緩めない。依存関係をread-onlyで示し、Product Ownerが批准するまでは現行gateを維持する。

## 2026-08-26: 承認済みAND関係をsliceでORへ弱めない

- 同一logical Asset内のMesh＋GSのような承認済み併存関係を、最小sliceの都合で「MeshまたはGS」へ変えない。Mesh-only／GS-onlyがschema-validでも、paired acceptanceの代替にはしない。
- 既存`AssetRevision`／`Representation`で表現できる構造に、別名のdomain model、representation set、revision frameworkを重ねない。不足が一つなら既存record間の最小relationだけを説明し、批准前にfieldやframeworkを実装しない。
- ユーザー体験上の操作対象と内部hit-test方式を分ける。GSを操作するUXでも、初回は明示的にbindされた同一asset内のproxy raycastでよく、normal-Mesh binding、direct splatや汎用collisionを自動的にscopeへ入れない。

## 2026-08-26: 表示パターンとinteraction representationを分離する

- simple Mesh+GS mixed、GS-only、Mesh-onlyは同じactive AssetRevisionの表示状態であり、新しい永続modeや別domain modelを作らない。
- `interactionProxy`がある場合、表示状態を切り替えても同じ非表示proxyをraycastし、proxyをcolor/depth/boundsへ出さない。GSが非表示でも同じactive revision内のtarget familyとの明示関係は維持する。
- proxy-less GS-onlyはview-onlyとし、穴を埋めるためにdirect splat pickingやproxy自動生成を初回scopeへ取り込まない。最初のmixed smokeは単純な不透明Mesh depth規則だけで閉じ、高度な透過・合成は後続へ送る。
- 「後続へ送る」と記すだけでは、上流gateのrequired fixtureに残っている限りcritical pathから外れない。初回base acceptanceと後続feature acceptanceの依存先を同時に直し、後続要件は削除せず対応feature controlを有効にする前へ移す。

## 2026-08-26: interaction hitとCaption位置の正本を分離する

- Proxy raycastはCaptionの概略初期位置を得る入力であり、GS表面を精密再現する位置正本ではない。配置後はユーザーが通常ギズモで調整できることを初回flowに含める。
- Caption位置の正本は対象GSが属するlogical Assetの`AssetFrame`上の`positionAsset`とする。ProxyのRepresentation IDやtriangle locatorは任意の弱い由来情報に留め、Proxyの欠落・交換・再openで保存位置を再計算・移動・無効化しない。
- mixed表示でも選択中GS familyへ`proxyForGsVariantFamilyId`で明示関係を持つProxyだけを初期配置に使う。近い、見えている、同じAssetにあるという理由で通常Meshや別Proxyを自動選択しない。
- 概略配置を採用したscopeで、精密な画面誤差をProxyの合格条件へ残さない。必要なのは有効な対象領域・奥行き、操作可能なギズモ、AssetFrame保存・再openであり、direct splatや精密Proxy自動生成で穴埋めしない。

## 2026-08-27: project open modeと書込みlockを権限概念へ混同しない

- View modeとEdit modeはユーザーが選ぶプロジェクトの開き方であり、user account、role、ACLや権限委譲ではない。書込みlockはEdit modeが現在安全にmutationできるかを示す別のruntime状態である。
- View modeは意図的にread-onlyで、Web Locksを要求・保持・自動再試行しない。Edit modeだけがproject-scoped write lockを要求し、取得不能・API不在・喪失時はread-onlyへ倒す。
- UIのボタン無効化だけを安全境界にせず、store dispatch/merge、service mutationとproject filesystem writeを同じlockで拒否する。lock取得後のEdit modeは古いin-memory stateを昇格させず、durable stateを開き直してから書込み可能にする。
- Product Ownerがmodeとlockを区別した場合、実装済みのsingle-writerを理由に完了扱いを維持しない。用語、初回open、fallbackと実ブラウザ証拠まで同じacceptanceへ戻して確認する。

## 2026-08-27: 候補harnessのfixture関係を製品identityへ一般化しない

- 初期技術harnessの独立Mesh Assetと部分GS Assetは、後続productionの標準paired Assetを否定・置換しない。candidate fixtureの都合をlogical identityやalignmentの証拠へ自己昇格させない。
- interactionは表示パターンだけで決めず、ユーザーが明示選択した対象Assetから解決する。独立Mesh対象ならそのMesh、GS対象なら同じGS Asset/revision内の専用Proxyだけをraycastし、別AssetのMeshを近接・可視性から推測利用しない。
- harness、PoC、production acceptanceのcreditを分離し、候補harnessのsave/reloadや描画成功をG1採用、production persistence、同一logical-Asset acceptanceとして再利用しない。

## 2026-08-28: 承認済み仕様recordとproduction実装済みschemaを混同しない

- 文書に`AssetRevision`／`Representation`が承認済みでも、production codeにvalidator・保存・再読込経路がなければ「既存schemaをそのまま利用できる」とは言わない。先にimplemented gapを明示する。
- Product Ownerがそのgapに対する限定snapshotを批准した場合だけ、既存record名・意味を再利用した最小wireを実装し、v1への便宜的field追加や汎用v2 frameworkへ拡張しない。

## 2026-08-28: offline-readyは非同期cacheの時間待ちから推定しない

- 大きなlazy chunkのruntime cachingはmodule初期化後にも継続し得る。固定時間pollで完了を推定せず、明示準備操作自身がexact URLをCache Storageへ保存・read-backし、その成功後だけoffline-readyを表示する。
- 初回登録直後の`navigator.serviceWorker.controller === null`はinstall失敗ではなく、現在のpageがまだ制御対象でないだけである。再open用の準備では`navigator.serviceWorker.ready`でactive workerとapp-shell install完了を待ち、不要な手動reloadを合格条件へ足さない。
- Service Worker登録をfire-and-forgetにして失敗を握り潰したまま`ready`だけを待つと、明示準備操作が永久待機し得る。登録結果のpromiseを利用側へ共有し、登録失敗と「active worker＋exact cache」の不足を明示的にfail closedにする。
- `navigator.serviceWorker.ready`はfirst installが失敗してもrejectしない。明示準備では返されたregistration自身のworker stateを監視し、`redundant`とbounded timeoutを操作可能なエラーへ変換してボタンを必ず復帰させる。
- 同じversion付きchunkでも、明示`fetch`とES module importではrequest modeが異なり、hostの`Vary: Origin`によってCache Storage照合が外れ得る。同一originのexact URLに限定して準備側とService Worker側の`ignoreVary`条件を一致させ、オンライン成功をoffline-readyへ誤認しない。

## 2026-08-28: interaction surface不在とCaption作成不能を恒久的に同一視しない

- ProxyなしGSではsurface hitを推測せず無効にする一方、後続UXとしてGS AssetFrame原点へ明示作成し、ギズモで最終`positionAsset`を決める経路は両立できる。現在sliceの固定degradationを無断変更せず、Product Ownerが示した正式版の改善としてbacklogへ分離する。

## 2026-08-29: custom package拡張子をmobile file pickerのaccept filterへ依存させない

- iOS Filesは未登録のcustom extensionを未知UTIとして扱い、HTML file inputへ拡張子/MIMEの`accept` filterがあると正しいfileまで一覧から隠すことがある。
- 選択後にcontainer version、entry path、size、hashを厳格検証するpackageでは、picker filterを安全境界にしない。mobile互換を優先して全fileを選択可能にし、不正fileはauthoritative parserで明示拒否する。

## 2026-08-29: 低リスクの実機再確認は明示的なPO判断でまとめられる

- Desktop実測、既存の同系統iPhone実績、自動acceptanceが揃い、残る差分がplatform非依存でデータを破壊しない場合、Product Ownerは個別sliceの実機再確認を後日の統合回帰runへ送れる。自動的には省略せず、残るmobile固有riskと後日確認項目を平易に示して明示判断を得る。
- この判断は「iPhone PASS」の捏造ではない。未実施を記録し、current sliceをblockしないというrisk acceptance、過去の実機evidence、release/device gateの新規creditを分離する。
- 実機runを延期した時点で一時公開tunnelを停止し、後日のrunでは同じ最小項目だけをまとめて確認する。延期を理由に追加fixture、instrumentationやmicro-hardeningを作らない。

## 2026-08-30: consolidated acceptanceでは内部状態と見える証拠を同期する

- format parserとround-trip用の1/8-splat fixtureは、rendererがユーザーに判別できる像を出したという視覚oracleではない。Product Ownerへvisual acceptanceを依頼する前に、fixtureが肉眼で判定可能かを確認し、必要なら既存の代表データを使う。fixture matrixを増やす理由にはしない。
- select要素が「現在編集対象」を示すUIでは、表示値とviewer内部のgizmo targetを同時に更新する。Caption選択等が内部targetをclearする場合、位置調整を開始・復帰する境界で明示的に再接続し、見た目だけ選択済みのfalse greenを作らない。
- Asset visibility件数はresource ready件数ではない。表示チェック、decoder/runtime readiness、描画結果とinteraction targetを別々に観測し、`4/4表示中`のようなmetadataだけからrenderer成功を推定しない。

## 2026-08-30: format判定をユーザー入力UIの分裂へ持ち込まない

- production UIではMesh/GS/Pointごとにfile pickerを選ばせず、一つの「モデルを追加」操作からcontentを検査して対応経路を決める。拡張子だけを権威にせず、未対応・曖昧な内容は明示拒否する。
- add、replace、delete、placementは内部serviceが別でもユーザーにとって同じモデル管理作業である。最終UI closureでは一つの分かりやすい管理領域へまとめ、technical sliceのsection構造をそのまま製品導線へ固定しない。
- consolidated acceptance中に得たこの種の操作性修正はP2として記録し、P0/P1の成立確認を終える前に別UI sliceへ展開しない。

## 2026-08-30: 低懸念の物理iPhone smokeをsliceごとに反復しない

- 既存iPhone経路と同じrenderer、storage、input方式を再利用し、差分が小さくDesktop・自動acceptance・独立reviewで拘束されている場合、各sliceで同じ人力smokeを要求するとcritical-path速度を大きく落とす。
- Product Ownerが明示的に延期した低懸念項目は未実施として記録し、mobile-sensitiveな複数sliceを一つの統合回帰runへまとめる。延期を個別iPhone PASS、release/device gate evidence、または恒久的な試験免除として扱わない。
- 物理端末を即時blockerにするのは、新しいmobile API、storage方式、renderer/input方式、大容量memory境界、またはDesktop evidenceで代替できないP0/P1 riskがある場合に絞る。既知経路の小さなUI wiringはまとめて確認する。

## 2026-08-30: release計測よりユーザー機能の完成を先にする

- Product Ownerがユーザー機能完成を優先した段階では、G0/E5の計測器、trace kit、evidence収集UIを次のproduction workstreamへ繰り上げない。これらはrelease前laneへ戻し、通常利用者が作成・編集・保存・交換するために不足する機能を先に閉じる。
- gate/evidence toolingがcritical path上に存在しても、それだけでuser-visible product workを中断しない。割り込ませるのは、未解決P0/P1がデータ損失・重大security・重大互換性を生む場合、または後続機能の実装を直接危険にする場合に限る。
- 次sliceは小さい件数を消せることではなく、Product Contract上の未成立なuser outcomeを最も大きく閉じるものから選ぶ。計測の延期をrelease PASSやevidence免除とは扱わず、最終候補treeの実機・gate laneとして明示的に残す。

## 2026-08-30: 技術acceptance用controlを本番のCaption導線へ昇格させない

- Caption target、Caption選択、新規作成、初期配置、位置調整、snapshot保存を別々のtechnical controlとして並べただけでは、各機能が動いても一般利用者には操作順が分からない。本番UXの成立を機能PASSから推定しない。
- Caption authoringの本番導線を閉じるときは、LociMyuの実際の操作を参照し、「Captionを選ぶ／追加する→モデル上へ置く→その場で内容と位置を編集する」というユーザー作業を中心に一本化する。内部のAsset／Proxy／snapshot手順をユーザーに組み立てさせない。
- 現在のnative画面はproduction wiringを検証するtechnical UIとして扱い、最終UIとしてordinary化しない。全体UI/UX closureまで、技術acceptanceと操作性acceptanceを別々に記録する。
## 2026-08-31: scope mechanisms must remain Product Owner choices

- Do not promote a proposed audit/review storage mechanism into product scope
  merely because later specifications reference it. When a separately retained
  source plus bounded exportable report satisfies the approved user outcome,
  keep sidecars, quarantine databases and portable review workflows out unless
  the Product Owner separately approves them.

## 2026-08-31: 変換済みfieldはuser-visibleな消費まで確認する

- schema、converter、snapshot/package round-tripが値を保持していても、rendererと編集UIがその値を使用しなければ製品上の互換性は成立していない。LociMyu受入ではCaption色のような見える意味を、source→native record→render→edit→save/reopenまで一続きで確認する。
- 3D authoring tool間の単位差を調整する倍率UIへ、1付近だけの狭い線形rangeを置かない。桁違いの値は数値入力と対数的なsliderを併用し、複数Assetでは既存のper-Asset意味を優先する。
- selection色や要再配置警告のために、ユーザーが選んだCaption色を固定色で上書きしない。選択状態はscale、発光、輪郭等の別の視覚channelで示す。

## 2026-08-31: legacy adapterの前にreceiver completenessを閉じる

- 代表ZIPが変換・保存できたことだけでlegacy受入完了としない。sourceのuser-visibleな保存項目を一度inventoryし、native側のrecord、renderer/editor、save/reopen、portable backupまで対応先があるかを表で確認する。
- receiverがない項目は、承認済みユーザー機能ならconverterのreport-only処理を既成事実にせず先に最小receiverを作る。timestamp等の非表示metadataや未承認機能は、理由を明記してsource/report保持のままbacklogへ送る。
- receiver auditを口実に一般化されたmedia、history、appearance、migration frameworkへ拡張しない。現存するLociMyu意味と最小native製品能力の交差だけをproduction scopeへ入れる。

## 2026-09-01: Caption overlayは内容が読める面積と一時調整を受入時に確認する

- データが表示されたことだけでCaption overlayの閲覧UXを完了扱いにしない。画像が固定小サイズで余白だけ残る場合は、元bytesやaspect ratioを変えず、利用可能なcard幅へresponsiveに拡縮する。
- 3D上のピンへ自動追従するcardでも、モデルや視点によって内容を隠し得る。Product Ownerが求めた場合はheader dragによる表示中だけの位置調整を優先し、Project schemaやSaved Viewへ永続位置を追加しない。
- 自動配置、手動の一時位置、durable project stateを区別する。小さな閲覧改善からdrag framework、複数window、永続layoutへscopeを広げない。

## 2026-09-01: 見えるCaptionピンと実際の選択領域を一致させる

- 小さな3DピンへMesh形状の厳密raycastだけを使うと、画面では見えていても少し外しただけで空画面クリックとして選択解除される。CaptionピンにはboundedなCSS-pixel選択許容を持たせ、モデル単位やカメラ距離で操作性を崩さない。
- overlayの画面内判定はピン中心だけで即座に切らず、ピンが一部見える範囲の小さな余白を許容してcard本体をstage内へclampする。完全に画面外のCaptionを表示する挙動へは広げない。

## 2026-09-01: PWA acceptanceではserver生存と表示buildを分けて確認する

- ローカルpreviewが停止していてもService Workerの旧cacheだけで画面が開くため、「URLが表示できた」ことを現在treeの証拠にしない。手動確認を依頼する直前にserverのHTTP応答と配信assetを確認する。
- prompt更新型Service Workerではhard reloadだけで待機中workerが必ず有効になるとは限らない。旧UIが見える場合は、serverを先に復旧し、全controlled tabを閉じて再openするか、承認済みの更新導線でworkerを切り替えてからvisual regressionを判定する。

## 2026-09-01: converter修正のacceptanceでは既存Projectを再利用しない

- import時だけ適用される変換修正は、既存Native Projectを後から書き換えない。修正後の確認で旧Projectを開くと、変換値の欠落がruntime不具合に見えるため、fresh originと一意なProject名で新規変換した結果を確認する。
- query stringや同名Projectだけでは、Service Worker cache・OPFS・変換世代を区別できない。source→confirmation→draft→generation-1 snapshot→表示値のprovenanceを明示し、既存Projectに対する手作業の再保存を回避策にしない。

## 2026-09-02: local previewのbase pathを配信URLと一致させる

- `/LociView/`用buildをroot mountの`vite preview`で配ると、HTMLはfallbackで200でも`/LociView/assets/*`へHTMLが返り、画面は真っ白になる。ページのHTTP 200だけで起動確認を終えず、entry JavaScriptのstatus、Content-Type、byte数まで確認する。
- local acceptanceはroot base + root URL、GitHub Pages確認は`BASE_PATH=/LociView/` +対応するmountとして分離する。queryやService Worker操作でbase不一致を回避しない。

## 2026-09-02: 保存済みrecordと製品上の切替pointerを一続きで確認する

- Saved View recordへ正しい`displaySetId`を保存しただけでは、シート切替時の視点復元は成立しない。authoring操作がそのDisplaySetの`defaultSavedViewId`まで更新し、切替側が同じpointerを消費するところまで確認する。
- converter由来のdefault linkageだけで受入を終えず、ユーザーが各シートで新しい視点を保存し、別シートへ切り替えて戻ったときにcamera/backgroundが変わるproduct flowをfocused acceptanceに含める。

## 2026-09-02: source byte健全性とruntime texture健全性を分ける

- GLBのsize/hash/read-back一致だけでは、埋め込み画像がbrowserでdecode・GPU確保できたことにならない。`GLTFLoader: Couldn't load texture blob:`はpath欠落ではなく、埋め込みbufferViewの実行時読込失敗として扱う。
- Three.jsの`Material.dispose()`は参照Textureを解放しない。モデルclose/reopenや変換時inspectionでは、共有Textureを重複なく列挙してgeometry/materialと一緒に解放する必要がある。
- 8K textureを複数含むモデルはmipmapと複数tabで資源使用量が急増する。原本破損や変換lossと決めつけずfresh single-tabで再現確認し、source bytesの再圧縮・軽量化へ勝手に広げない。
- Asset visibilityの件数をrenderer readinessとして表示しない。物理iPhoneでgridが一瞬描画された後canvas全体が消える場合は、cameraや保存状態ではなくWebGL context/resource failureを第一に扱い、成功文言でactivation errorを上書きしない。

## 2026-09-03: Product Owner向け選択肢はユーザー機能から説明する

- `legacy v1編集／merge`のような内部構造の短縮語だけでは、どの画面・操作が残るか判断できない。最初に「旧形式のプロジェクト」と「Nativeプロジェクト」を区別し、新規作成、編集、共同作業、閲覧、変換のどれが変わるかを平易に示す。
- 同じ「merge」でもlegacy ZIP mergeとNative Package ExchangeのCaption／画像mergeは別機能である。選択肢では、なくなる機能と残る機能をそれぞれ明記し、片方を止める判断がもう片方まで止めるように読めないようにする。
- A/Bのラベルやgate番号は説明の後に置く。完成速度や安全性だけでなく、利用者が実際にできること／できなくなることを先に比較してからProduct Owner判断を求める。

## 2026-09-03: 保存前のworking stateまで視覚acceptanceする

- Caption追加のacceptanceは保存・再open後だけで終えず、配置した直後にピン、選択、overlayがworking stateから表示されることを確認する。保存後だけ正常になる状態は、作業中snapshotとViewer snapshotの同期漏れとして扱う。
- DisplaySetのような表示filterに使う所属情報をUI callbackだけで補正しない。Viewerが未保存recordを先に保持する場合も、同じ正規化済み値を作成時点から共有し、durable snapshotの再投入を表示更新の代用にしない。

## 2026-09-03: stale wrapper待ちとlocal upstream buildを同じ判断にしない

- security修正版を含まない既存wrapperを却下しても、更新wrapperを無期限に待つことを自動的な結論にしない。Product Ownerがexact upstreamとbounded local buildを承認した場合は、公開wrapperの名前ではなくsource tag、toolchain、build recipe、bridge、Worker lifecycleと生成物digestを固定して再現可能性を作る。
- technical decode成立、LGPL配布要件、HEVC patent判断を別々のgateにする。PoCが動いたことをlicense採用やpublic distribution承認へ読み替えず、対応source/relink資料とbuilt-output notice候補まで準備してProduct Ownerへ返す。
- browser-native media supportはDesktop結果からiPhoneへ一般化しない。物理端末でnative経路をWASM build前に一度だけ測り、成功時はnative-first、失敗時だけfallback対象にする。native smokeと最終production acceptanceも分離する。

## 2026-09-03: exact dependency approvalもbuild直前に再検証する

- Product Ownerがexact versionを批准しても、untrusted-input parser／decoderはdownloadやbuildの直前にupstream releaseとsecurity advisoryを再確認する。批准直後に修正版が公開された場合、古いpinを惰性でbuildせず、影響、互換性、exact replacementを示して最小の再承認を得る。
- security releaseがABI/API-compatibleなfull replacementなら、個別patchの寄せ集めやprivate forkを優先しない。拒否版、replacement tag/commit/archive digestと承認時点を記録し、technical buildとdistribution/license判断は引き続き分離する。

## 2026-09-03: media smokeは失敗fixtureとresource authorityを分離する

- 元fileを一定割合で切っただけでは、先頭側にprimary imageのdecodeに必要なbytesが残り、malformed inputにならない場合がある。truncated拒否のsmokeは、container構造を保ちながらprimary payloadを欠落させる等、失敗理由を構造的に固定する。
- `URL.revokeObjectURL()`後もdecode済み`HTMLImageElement`が表示できることは、Blob URL registryの解放失敗を意味しない。解放確認は新しいconsumerから同じURLを再取得できないことを確認し、既にdecode済みの画像cacheやDOM参照の寿命とは分けて記録する。
- local smokeの一時serverは結果取得後すぐ停止し、port listenerが消えたことまで確認する。端末内の一時IndexedDB copy、Blob URL、repositoryへのsource混入も別々のauthorityとして扱う。
