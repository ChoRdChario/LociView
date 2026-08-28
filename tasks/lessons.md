# Lessons

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
