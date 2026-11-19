# 06l — 未確定編集の復旧適格性検査の読取集約

**Status: PROPOSED — PO未承認・製品未接続・効果未測定。**

## 1. 目的と判断点

最後の保存内容と全データが一致すると証明してから再開する06j／06kの意味を維持し、
1回の読取検査内で反復する復元管理情報の監査を、その開始・終了へ集約する。
原本・履歴・保存後の照合、閉鎖記録の書込みと読戻し、通常の厳密な再開は減らさない。

正しい計測フラグで、合成NativeのPC復旧は適格性確定9.444秒・正常再開5.428秒を要し、
タッチの同経路は14.791秒で完了した。元の15秒条件は変更しない。
復旧区間では管理ファイル読取1,379回と一覧走査106回が増加した。
内側の時間は重なるため加算しない。低層探索だけの候補は実時間の改善を確認できず不採用。
正確な入力・実行証拠・条件・残件は[作業記録](../../tasks/todo.md)に集約する。

判断が必要なのは、[06j §2](06j-interrupted-local-edit-resolution-proposal.md)／
[06k §1](06k-autosave-interruption-admission-proposal.md)の個別I/O監査と
[06e §4](06e-selected-generation-output-read-proposal.md)の例外範囲に、次の純読取consumerを1種類だけ追加する点。
公開Session.read、slot／CAS検査と復元先の厳密な照合を、この名前付き検査の外へ広げて変更しない。
途中の管理情報変更を終了時に検出する場合があり、終了監査までは結果を採用しない。
変更後に元へ戻る外部ABAを常時検出できるとは保証しない。

## 2. 限定する操作と所有

- 名前は`localEditRecovery.inspect`。元の保存領域、または復元完了済みの選択先だけ。
  未完了のStagingReadConsumer、別の復旧・保存・共有読取へ一般化しない。
- 案内用の適格性検査、閉鎖記録直前、書込み・読戻し後の検査を、**それぞれ独立した操作**とする。
  別の操作や各検査結果を共有しない。復旧全体を1つのscopeへ囲まない。
- 既存のread-operation機構を使い、開始・終了ともstrictな保存先・管理情報・lease監査を行う。
  `requireStrictChecks()`を解除せず、通常操作用の軽い監査へ切り替えない。
- callback内では同一操作のreadonly FS／factoryからJournalとRepositoryを構成する。
  受信・出力slotとScene追加状態の確認も、この同じ組へ結び付ける。
  公開`Session.read()`による採用は行わず、`readCandidate(requireReadyPublished=true)`の結果を
  終了監査後だけ採用する。callback内からticket・Session状態・成功表示を更新しない。
- 物理DBはfreshな`loadRange([])`から全行を照合する。公開済みheadsだけの読取で代用しない。
  未確定partの実bytes、全変更、原本・履歴・各slotの検査と予算を維持する。
  constructorに結び付いたcontent／CASは既存のreadonly検査を保ち、自動的に置き換えない。
- 閉鎖記録の書込み・fresh読戻し、dispose、通常Hostの厳密な再開は操作の外に残す。
  新しい内容cache、directory保持、並列JSON読取、公開形式・ID・依存は追加しない。

## 3. 例外と期限

callbackが失敗しても終了監査を必ず完了し、その後に失敗を返す。
既存機構の通常分岐がcallback例外時に終了監査へ進まないことを、そのまま流用しない。
私的な成功／失敗結果をcallback内へ留める等、このconsumerだけの最小の処理とする。
終了監査の拒否、lease喪失、dispose、別FS／factory、期限切れreaderから成功を返さない。
読み取り専用facadeからの書込みは引き続き拒否する。
内側の読取と終了監査がともに失敗した場合は、終了監査の拒否を優先する。
開始したnative読取とstreamの取消・解放がすべて完了してからscopeを終了する。
FS／factory／Journal／Job／遅延readerをscopeの外へ持ち出さない。

## 4. 実装・接続の条件

既存サービス試験で、管理情報・選択先の途中変更、余計なDB行／変更、partの同長改変・欠損・
追加ファイル、owner／factory混入、期限切れ・write拒否、閉鎖記録前後の中断と再実行を確認する。
元のPC／touch実復旧で、原本保持・二重反映なし・次の編集・実ファイル保存・別環境再開を通す。
同じ入力・履歴・ブラウザ条件で各3回の前後比較と、詳細計測なしの対照を行う。
既存の15秒・600秒条件や再試行・assertionを緩和しない。

PO承認後の限定評価で効果と安全性が確認できた場合だけ、このconsumerへ接続する。
効果がなければ撤回し、証拠を保持する。実機iPhone、通常公開、他のscope追加は含めない。
