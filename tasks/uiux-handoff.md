# Public candidate UI/UX監査 handoff

> Status: `AUTHORIZED AUDIT/DESIGN INPUT / NO PRODUCTION AUTHORIZATION`。
> 製品挙動の受入れ済みcheckpointは、このhandoff準備開始時点で
> `87a249d4ab85308c0486366c5516bc82dd7ff139`。最新production実装は
> `6b2a28a0e5983676c9dc5d97534d916e3288f40d`。利用前に必ず現在の
> `g0-baseline`がcleanで`origin/g0-baseline`と一致することを再確認する。

この文書は次セッションの開始情報を外部化するもので、コード、実行可能test、
承認済みspecificationの代わりではない。

## 1. 最初に説明する製品状態

LociViewは、3Dデータを見て、空間上へCaptionを記録し、そのProjectを
やり取りするためのlocal-first／offline対応workspaceである。次セッションは
UIを触る前に、以下を自身の平易な日本語で説明する。

- LociView Native Projectが、閲覧、編集、保存、交換を行う作業用の正本。
- LociMyu ZIPは、別のNative Projectを作るためのread-only互換入力。
  legacy LociView v1も、安全なopen／viewと非破壊Native変換のための互換入力。
  どちらの原本にも書き戻さない。
- 初回public candidateで書込み可能なのはNative Projectだけ。
- Nativeを正本にするのは、受入れ済みの複数Asset、Caption、DisplaySet、保存・交換を
  一つの検証済みdata modelで更新しながら、互換原本のbytesと意味を変えないため。
- ユーザーが選択・表示・編集する単位はAsset。Mesh、通常Point、Gaussian
  Splatting（GS）はRepresentation形式。Projectには互いに独立した複数Assetを
  置けて、Assetごとに選択、表示／非表示、位置、回転、uniform scaleを持つ。
  MeshとGSが同じ対象や同じ範囲を表す必要はない。
- Interaction Proxyは対応するGS Assetの操作を助けるもの。別の論理Assetや
  layerとして通常ユーザーへ見せない。

表示・記録に関する次の役割を混同しない。

| 概念 | 利用者にとっての役割 |
|---|---|
| Caption | 対象Assetへtitle／body／colorと任意のmediaを記録する |
| 3D配置／gizmo | Captionを対象Assetの空間へ置き、位置を調整する |
| 添付メディア | Captionに属する記録を追加・確認する |
| DisplaySet | Caption群、material appearance、任意の既定Saved Viewを一緒に切り替える |
| material appearance | DisplaySet内で対応するMesh Assetのmaterialの見え方を変える |
| Saved View | camera／view状態を呼び戻し、任意でDisplaySetの既定にする |
| Asset visibility | Assetを個別に表示／非表示にする |

DisplaySetはvisibility、layer hierarchy、Asset groupの別名ではない。labelや
navigationでも一つの概念へ潰さない。

4種類のpackage出力も目的が異なる。

| 出力 | 目的 |
|---|---|
| 完全バックアップ | 同じ完全なProjectを復元する |
| 共同編集用package | 同じProject lineageへ対応変更をmergeする |
| 閲覧共有用package | merge不能なcopyを原則View modeで開く |
| 編集用コピー | 新しいidentity／lineageの独立した編集用Projectを始める |

filenameを変えてもpackageの目的は変わらず、目的の証明にもならない。検証済みの
package内容から判定し、結果を利用者へ説明する。

candidateのmedia境界は次のとおり。

- Native Caption添付はPNG、JPEG、WebP、GIFに対応済み。
- HEIC／HEIFは端末上で別のJPEGを書き出して添付する承認済みフローを使う。
  original-byte HEICはcandidate後の必須開発。
- 動画と音声もcandidate後の必須開発で、candidate機能ではない。
- 製品概念と表示名は`添付メディア`。candidateで利用できる追加操作は画像だけで、
  使えない動画／音声controlを表示しない。
- 後続の動画／音声presenterは同じmedia stageへ加えられる境界にするが、今は
  大規模frameworkへ書き換えない。

受入れ済み範囲は、複数AssetのMesh／Point／GS、Asset単位のvisibility／
alignment、GS Proxy操作、Caption authoring／overlay／画像、DisplaySet／
material／Saved View、Native save／offline reopen、完全backup、目的別Package
Exchange、非破壊v1変換、direct LociMyu変換、端末側HEIC→JPEGフロー。現時点で
未解決P0／P1はない。

## 2. 監査の目的と停止境界

通常ユーザーとして現行製品を操作し、受入れ済み機能が一つの理解可能な
public-candidate workflowになっているかを判断する。LociMyuの有用な
mental model／task順と、機能が増えたLociViewを比較する。単独controlや見た目を
眺めるだけでなく、task完了までの操作量と判断量を測る。

問題の記録、information architecture設計、低忠実度wireframe作成まではよい。
production変更またはimplementation sliceを始める前にProduct Owner承認で止まる。

## 3. 正本のread order

1. `AGENTS.md`
2. `PROJECT_MAP.md`
3. `docs/README.md`
4. `tasks/handoff.md`
5. このファイル
6. `tasks/todo.md`先頭のcurrent boundaryとnext decision
7. `tasks/critical-path.md` §7、§8、§12
8. `tasks/lessons.md`の「長期プロジェクトと長期Codexセッションを分離する」
9. `docs/specs/00-product-contract.md`の`PROD-13`〜`PROD-16`、§4〜§8、§10、続いて
   `docs/specs/02-storage-package-migration.md` §29.3、§30、§31と
   `docs/specs/04-locimyu-conversion.md`
10. 現行UI挙動として`src/ui/home.ts`、`src/ui/app.ts`、
    `src/nativeGs/app.ts`。観測挙動の確認が必要な場合だけ対応testを読む

chat history、`docs/07-roadmap.md`、古いunchecked gate、PROPOSED文書からscopeを
再構築しない。`docs/05-ui-ux.md`は現行意図とsuperseded draftが混在するため、
LociMyu／UX参考に限定し、観測挙動はcurrent codeを優先する。

walkthrough前に、LociViewの製品目的、LociMyuとの関係、Nativeが正本である理由、
完了済み機能、現在のmedia境界、今回の監査目的、判断を減らしても自動推測しては
ならない安全／authority境界をteach-backする。

## 4. LociMyuの参照境界

LociMyuは、開始地点、Captionへ至るtask順、DisplaySet／sheetのmental model、
画像確認の手順、保存／共有時の判断量、定着した普通の用語、反復作業の効率、
役立つ既定値を理解するためだけに使う。

Google account／API依存、内部sheet構造、単一model前提、旧storage、現在の
LociViewを表現できない制約、曖昧なrelationを推測する挙動は継承しない。

利用可能な参照先：

- `docs/05-ui-ux.md`：記録済みinteraction pattern。混在／superseded statusを維持。
- `docs/09-locimyu-migration.md`：legacy operator flow。
- `docs/specs/04-locimyu-conversion.md`：承認済みconversion境界。
- `docs/mockups/ui-mock-v1.html`：過去のLociView mock。現行製品の証拠ではない。
- `docs/history/legacy-locimyu-alpha.md`：Product Ownerが許可したlocal legacy
  evidenceを探すprovenance indexとしてのみ使う。

handoff準備時のread-only inventoryでは、そのprovenanceが指すlocal archiveに
UI implementation sourceと文書資料があり、独立したscreenshot画像は見つからなかった。
正確なlocal locationやentry名はtracked文書へ複製しない。

許可されたlocal UI source、screenshot、runbookを開く場合もread-onlyとし、tracked
outputにはtask patternだけを書く。legacy artifactをactive repositoryへ展開せず、
private path、filename、hash、内部名、運用データを転記しない。

## 5. 実際のcurrent UIを起動する

1. cleanな`g0-baseline`、origin一致、一時service停止を確認する。
2. 既存dependency installationを再利用する。存在しない場合はlocal環境を変える前に
   停止して説明する。
3. Desktopの通常UI監査では`npm run dev -- --host 127.0.0.1`を実行し、Viteが
   表示した正確なURLを使う。このdev serverをoffline／PWA PASSの証拠にしない。
4. 通常homeの`/`から始め、`開く／新しく作る`でNativeへ進む。発見性も監査対象
   なので`?mode=native-gs`から開始しない。再現問題の切分け時だけdirect URLを使う。
5. `dev.html`、`?mode=spark`、HEIC PoC page、現在は古い`main`を配信するpublic
   Pagesをcandidate UIの証拠にしない。
6. 破棄可能なbrowser-local Projectと非private入力を使う。既存のユーザーProjectを
   削除せず、互換入力の原本を上書きしない。
7. task 35／41は既存の受入れ済みoffline証拠と現在の導線を監査し、新しい実機
   PASSをdev serverから主張しない。新しいiPhone実測がUX closureに必要なら、
   exact candidate buildと一時HTTPS経路を一件だけ提案し、Product Owner承認を得て
   から実行する。終了後はserver／tunnelを停止する。

このhandoff準備sessionではtypecheck、full test、buildを実行していない。次の監査で
fresh offline実測を行う場合も、必要な一回のbuild以外へ検証を広げない。

## 6. 現在利用できる非private入力

- Mesh：`public/samples/cube.obj`、`cube.stl`、`tri.glb`。
- 通常Point：`public/samples/points.ply`（GSではない）。
- 小さいsynthetic GS：`fixtures/gs/profile-golden-sh3-v1.ply`。characterizationで
  あって代表loadや広いrenderer証拠ではない。
- synthetic LociMyu：`fixtures/v1-migration/locimyu-drive-exact-v1.zip`。
- synthetic legacy lineage：`fixtures/v1-migration/native-v1-base.lociview`、
  `native-v1-branch-a.lociview`、`native-v1-branch-b.lociview`。
- project-owned画像：`public/icons/icon-192.png`または`icon-512.png`。

backup／collaboration／review／clean-copy入力は、破棄可能なNative Projectから
UIを通して生成し、package purposeを正しく成立させる。小さいfixtureを代表性能や
release supportの証拠へ昇格しない。

## 7. 固定task inventory

| 分類 | task |
|---|---|
| 開始・取込 | 1. 新しいNative Projectを始める、2. LociMyu ZIPから変換する、3. 従来形式を閲覧してNativeへ変換する、4. 完全backupをrestoreする、5. collaboration／review／clean copyを開く |
| 3Dデータ | 6. Mesh追加、7. 通常Point追加、8. GS追加、9. Asset選択、10. visibility、11. 移動／回転／uniform scale、12. 差替え、13. 削除、14. GS Proxyを別Assetと誤認せず状態確認 |
| Caption | 15. 作成、16. 対象Asset選択、17. 初期3D配置、18. gizmo調整、19. title／body／color編集、20. media追加／確認、21. 検索／選択、22. unplaced処理、23. 削除 |
| 表示状態 | 24. DisplaySet切替、25. 対応するMeshのmaterial appearance確認／変更、26. Saved View保存／切替、27. Asset visibilityとの関係を理解 |
| 保存・交換・復旧 | 28. 通常save、29. 完全backup、30. collaboration export、31. merge、32. conflict理解／対処、33. review/share export、34. clean copy、35. offline close／reopen、36. corrupt／unsupported入力から回復 |
| mobile | 37. iPhoneでopen、38. 3D操作、39. Caption閲覧／編集、40. DisplaySet／Saved View操作、41. saveして完全offline reopen |

## 8. 操作量と判断量の測定

各taskで、開始地点、目に入る主要action、完了の合図、click／tap数、file dialog数、
screen／panel移動、mode切替、同じ情報の再入力、drag／gizmo前の準備、undo／retry、
大まかな所要時間を記録する。click数が少なければ常に良いとは扱わず、一つのactionへ
無関係な危険な意味を詰め込まない。

判断は、総数、不明瞭な選択、技術知識が必要な選択、安全な既定値で処理できる選択、
destructive／irreversible、source authority、conflict、画面から結果を予測できない
選択を記録し、(1) 利用者が決める、(2) 安全な既定値で自動化、(3) 通常は隠して
必要時だけ段階表示、の三つに分類する。

判断削減のために、source relation推測、conflict winner自動選択、無確認の破壊操作、
filenameによるpackage purpose推測、failure／unsaved stateの隠蔽を行わない。

## 9. 確認するUX原則

- 各screenに明確な主要actionを一つ置き、technical acceptance controlを隠す。
- 普通のtask languageを使い、重複入口と再入力を減らす。
- 安全な既定値とprogressive disclosureを使う。
- system state、save state、選択対象を見せる。
- 操作前に結果を予測でき、失敗時は次の安全な行動を示す。
- Desktop／iPhoneで概念と用語を揃え、mobileを単なる縮小Desktopにしない。
- keyboard／mouseとtouchの双方で主要taskを完遂する。
- LociMyu経験者と初見ユーザー双方のmental modelを試す。

## 10. 実装前の必須成果物

1. current UIのtask-based walkthrough。
2. 操作量／判断量table。
3. UX上の不整合と行き止まり。
4. 露出した内部用語。
5. LociMyuから維持する操作pattern。
6. LociMyuから変更する操作pattern。
7. 推奨information architecture。
8. 推奨screen構成。
9. 主要user flow。
10. state transitionとerror／recovery flow。
11. Desktop／iPhoneの低忠実度wireframe。
12. public candidate前の必須変更。
13. candidate後polish。
14. 最大3件のbounded implementation slice。
15. 各sliceのacceptanceと明示的非対象。

すべての提案をtaskへ結び付け、どの操作／判断をなぜどう変えるかを書く。提示後、
Product Owner承認で停止する。

## 11. 禁止事項とProduct Owner判断待ち

監査／設計sessionではproduction UI、機能、dependency、schema／package version、
HEIC／video／audio、license、application version、`main`、tag、Pages、Service
Workerを変更しない。新機能追加、既存機能削除、大規模rename／refactor、UI
framework導入も行わない。新しいPoC、fixture matrix、evidence system、広い
reviewer loopを作らない。

次にProduct Ownerが、candidate必須項目、candidate後polish、最大3 sliceの開始可否を
承認する。正式license／notice、exact version／release SHA、`main`統合／rollback、
Pages deployment、advertised POST share-target削除、既にpublicなprivate-source由来
metadataの扱いは、UX closure後も別のrelease判断として残る。
