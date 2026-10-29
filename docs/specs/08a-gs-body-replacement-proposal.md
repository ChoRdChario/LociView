# 08a: GS本体を更新して記録を引き継ぐ

Status: **PO承認済み2026-10-29 —限定PC実装・自動検証済み**。仕様08のCaption Undo／通常Point差し替えの
次工程として整理する。現在の作業・実行結果は[todo](../../tasks/todo.md)を参照。
独立仕様レビュー2026-10-29はPASS。POは「面を未設定にして進める」を選択し、下記の
同形式GS差し替えから共有・補正・返送・復元・再開までの一括実装・検証を承認した。
08チェックポイントに続いて実装・独立レビュー・必須チェックを完了。実行範囲はtodoが正本。
小規模の共有・復元フローと、所有50万点2世代の通常Project保存／coldを分けて確認しており、
50万点のバックアップ復元・一般採用・実機・公開の合格ではない。

## 利用者の結果

更新したGSファイルへ差し替え、同じモデルの配置・シーン所属・記録・メディアを保って
編集・共有・ピン補正・返送・復元・再開する。モデルの同一性や対応点を自動推測しない。

最初の接続は、承認済み01c source profileのGS→同じprofileのGS。SH0〜4の全係数と
原本を保持し、SH4を下げない。01e Desktopの既存上限（1本体／同時表示合計50万点、
原本合計512MiB）を変更しない。容量は過去のモデル・メディアも含む既存の数え方を使う。
01eの所有SH4検証入力は1世代178,002,206 bytes、2世代356,004,412 bytesなので、
他の本体が少なければ既存合計枠内で検証できる。これは任意のProjectや端末の保証ではない。
対象は保存済みprofileで決め、取込元による制限を追加しない。07kで既に01cへ変換したGSも
同じ規則に従う。旧Nativeファイルを差し替え入力として直接開くことや、Native Point／Proxyの
別profileをGS本体として扱うことは含めない。既存07k変換規則自体は変更しない。

## 承認されたProxy方針

[05 §2.3](05-project-scene-team-workflow.md#23-model-revision-boundary)は一般の差し替えと
ピン保持を定める。一方、[01c §5](01c-gs-sh4-proxy-workflow-proposal.md#5-proxyと保存座標)と
現在の`gsProxy.ts`は、GSの本体・familyを変えない面の追加／変更／解除だけを認める。
今回の承認前には、新しいGS familyへの以前のProxyの扱いが未決定だった。同じAssetや座標だけで
関係の証明やsurface equivalenceを成立させない。

**承認された方針：新しいrevisionでは位置指定用の面を未設定にする。**
以前のGS／Proxy本体・revision・記録・履歴は削除しない。必要なら既存の
「位置指定用の面を追加」から明示的に設定し直す。差し替え前の確認に、面が外れることと
ピンが要確認になることを併記する。面のないGSの閲覧・記録閲覧／文章編集は既存規則を保つ。

別案は、以前の面をfreshなProxy Representationとして新GS familyへ引き継ぐ扱い。
こちらを選ぶ場合は新しい関係付けの明示承認が必要。元bodyは共有できるが、
新しいgeometryへの一致を証明したとは扱わず、ピンは同様に要確認とする。
この別案は採用しない。自動引き継ぎを実装しない。

## 実装・保存の境界

- 元のAsset／AssetFrame／Project単位・全Scene所属・`assetToProject`を保持する。
  source→Asset変換も数値で保持し、その変換で新bodyのboundsを検証できない入力は
  拒否する。見た目・boundsから変換を推定せず、identityへ黙って戻さない。
- freshなGS Representation／RepresentationFrame／family／compatibility classと
  revision／bindingを追加し、期待した現在bindingを親にして最後にstatusを切り替える。
  同一bytesでも互換性を推測しない。ピン座標は変更せず、明示的な補正まで要確認とする。
- 推奨案のnew revisionはGS本体だけを含み、新しいProxy relationを作らない。
  原本・履歴、旧recipe、既存のprotected inventory／package規則は変更しない。
- binary I/Oは既存WorkspaceFS／CAS／file-backed GS入力、編集はtyped Session command。
  `ValidationContent.prepareModel`から`prepareValidationModel`へGS専用の任意context
  `{representationToAsset}`だけを渡す。await前に所有・検査し、GS以外への指定は拒否する。
  profile・IDs・旧bounds・Project配置はこのcontextに含めない。plannerは旧GS変換との
  完全一致を別に確認する。通常の新規追加はcontextなしの既存identity規則を保つ。
  新しい512MiB入力全体の`arrayBuffer()`を追加しない。token／Asset／bindingを捕捉し、
  全係数・digest・宣言・capacity・次状態を検査してから既存publication／readbackへ進む。
- 新旧の50万点を同時にdecode/displayして既存合計枠を超えない。既存の世代・資源解放・
  residency規則を使って表示を切り替え、準備中は対象モデルへloadingを表示する。
  GPU表示の準備中はCaption閲覧・検索を保ち、古いモデルを新しいrevisionとして表示しない。
  元ファイル検証・typed commandの確定中は既存のbusy／保存・公開fenceを保つ。
- 失敗時は、保存前なら既存の状態を保持する。保存済みの表示準備失敗なら既存の局所表示
  診断／再試行を使い、途中の別モデルや選択へ対象を読み替えない。中断後は元partを検証する。

Native変換由来の別profile、Point↔GS、形式間変換、自動Proxy生成／登録・座標推定、
GS直接pick／対応点推定、段階LOD、renderer採用・実機・offline・公開は含めない。
新しい依存・source profile・wire schema・容量保証も追加しない。

## 一括の受入れと次工程

今回のPO承認に従い、typed command／file service／モデル画面→自動検証まで
一つの工程として進める。helperや各操作でPO確認を繰り返さない。

1. 原本・全SH・配置／Frame／記録保持、fresh ID、面の有無と確認文、stale／異種profile／
   再利用ID／容量超過の原子的拒否を確認する。
2. 専用の独立した2ブラウザ環境で、GS差し替え→更新受信→手元の文章／添付保持→
   明示的な面の設定・ピン補正→返送→再開を通す。中断復旧と全5purposeのファイル不変条件は
   既存service testsで確認し、代表的な共有／backup／復元を実ファイルでつなぐ。
3. 同じDesktop50万点SH4の入力2世代で、上限内の表示切替・完全な原本保持・保存／再開を
   確認する。小さなfixtureの成功だけで50万点や実機を合格にしない。
4. 最終の必須直列チェック・成果物分離・独立レビューを経て、適切なg0開発checkpointにする。

この承認は既存Desktop候補内の実装・検証であり、一般採用・公開の承認ではない。
