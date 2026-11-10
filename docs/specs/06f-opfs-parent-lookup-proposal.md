# OPFSの親フォルダ探索を短くする案

Status: **ACCEPTED —PO承認2026-11-10・限定実装とWindows自動検証完了2026-11-11**。
固定Ki-84／50万点SH4で実時間の効果と安全性を確認し、下記4読取へ接続した。
一般的なPC・iPhoneの速度保証、他の採用gateや一般公開の合格は含まない。

## 1. 結果と根拠

本文編集→保存→再開の待ちを、検査を減らさず短くする。
[06e §10](06e-selected-generation-output-read-proposal.md#10-管理記録1件の読取を独立した単位にする)
のreceipt単位は、Ki-84／50万点SH4各3+3の安全な往復を完了したが、実時間の改善条件を満たさず不採用。
管理情報監査の回数減少を速度改善へ読み替えない。全比較値は[todo](../../tasks/todo.md)に保持する。

既存のnative診断では、Ki-84保存のwrite58回／close10回に対し、getDirectoryHandleは31722回だった。
累積時間は重なるため加算せず、一般的な端末の性能保証や削減時間の見積りにはしない。
次の候補は、深い親パスを毎回先頭からたどる作業を対象とする。

## 2. 提案する内部変更と判断点

- 既存`OpfsFS`の読み取りだけに、直近の親フォルダを示すhandleを最大1個保持する。
  rootの識別・既存と同じ正規化をした親パス・directory handleだけを持ち、File／file handle／bytes／
  digest／管理記録／検査済み結果／権限の判定は保持しない。新しい依存・保存形式・公開API・UI設定を追加しない。
- `readText`／`readBytes`／`readBytesFrom`／`readStream`だけを対象にする。
  `list`、write、append、remove、exists、writeTextの排他的作成・後片付けは元の探索を使う。
  OpfsFS自身のwrite／append／remove開始時にhintを破棄する。
  並行readが残っていても古いhintを再公開しない所有条件を検証する。
- hintを使う場合も、既存のrootと親パスが一致することを確認する。
  `resolve`はlocatorの相対パス比較にだけ使い、存在・権限・置換・ABAの検査証拠にはしない。
  **各読取で新しい`getFileHandle({create:false})`と`getFile()`を必ず実行する。**
  検査に使うFileや内容を前回から再利用しない。namespace／lease／Selectionの全監査、SHA／CRC、
  個々の書込・確定・fresh読戻し・生成物照合・ダウンロード検査・中断復旧の境界は維持する。
- 未対応API、root／パスの不一致、失効したhintは破棄し、元のrootからの探索へ戻す。
  `resolve`だけのNotSupportedErrorは元経路を使い、当該instanceでは追加のhint利用を止める。
  `getFileHandle`のNotSupportedErrorや権限エラーを、任意APIの未対応として扱わない。
  hint経由でのNotFound fallbackは、親／`getFileHandle`の探索段階だけに限定する。
  hint破棄後に元の探索で確認し、以後の再試行はしない。
  取得後の`getFile()`・text／arrayBuffer／streamなど内容読取の失敗は、再openせず従来どおり拒否する。
  権限・I/O・型不整合などのエラーは握り潰さず拒否する。検査を成功扱いするfallbackを追加しない。
- これはbytesや検査結果のcacheではないが、directory handleの保持を複数の読取へ広げる。
  現行[06e §5](06e-selected-generation-output-read-proposal.md#5-通常保存の低層io改善2026-11-08)の
  list内に限定したhandle寿命とは別の方針であるため、独立レビュー後にPOが本案を追加承認した。
  §10の不採用読取集約や他の非採用候補は接続しない。

## 3. 標準と観測の区別

[File System Standard：getFileHandle](https://fs.spec.whatwg.org/#api-filesystemdirectoryhandle-getfilehandle)
はdirectory locatorを使ってentryとアクセスを確認する。
[resolve](https://fs.spec.whatwg.org/#api-filesystemdirectoryhandle-resolve)はlocator相対のパスを返し、
対象の存在を確かめる手順ではない。locator同一性を物理entryの不変性と同一視しない。

Windows専用Chromium156の一時領域で、既存handleとrootからのfresh探索を比較した。
同じ親の内容更新、親の削除／同名再作成、祖先の削除／同名再作成の5状態では結果が一致し、
削除中はNotFound、再作成後は新しい内容になった。`resolve`は削除中も同じパスを返した。
directory移動APIは利用できず未確認。初回の検証スクリプトはURL指定誤りでnative操作前に失敗し、
修正後の別出力へ実結果を保持した。この1環境の観測は全ブラウザの保証・性能合格・実装合格ではない。
元Project・原本・利用者のブラウザ領域は使っていない。

## 4. 実装後の受入れと採否

1. 実装は既存OpfsFS内のprivateな探索へ限定する。新しいport／registry／汎用cacheのframeworkは作らない。
   既存単体試験で、毎回のFile取得、更新・欠損・親／祖先の置換・型不整合、root／パス分離、
   権限／読取失敗、並行read／writeとhint失効、unsupported時の元経路を確認する。
2. 排他的作成・torn receipt・書込失敗・保存後改変拒否・中断復旧は既存試験を再利用し、変更しない。
   native一時領域に加え実OPFSの元の再現手順でも、古い木の内容を成功採用しないことを確認する。
   移動は対応環境だけで実施し、未確認を合格扱いにしない。
3. 同じKi-84／50万点SH4の本文編集→検査済み外部ファイル→ブラウザ終了後再開を各3回比較する。
   管理監査やfresh file取得は省略せず、native探索の診断を主測定から分ける。低層call数だけで採用しない。
4. 実時間の効果と安全性が確認できた場合だけ、独立最終レビュー、checkpoint、HEIC隔離、
   完全なPC／touch・専用offline・既存Edge／Chromeの代表操作を通し、g0-baselineへ保存してCIを確認する。
   効果がなければhintを撤去し、比較記録を保持する。新しい許容遅延・自動再試行で合格させない。

実機Safariのメモリ・IME・保存・発熱・offline受入れと、一般公開は別途に残る。

## 5. 実装と接続済み範囲

既存OpfsFSのprivateな探索だけを変更し、§2の4読取へ接続した。各回のfresh file取得と
全量照合、write／公開／保存後照合／復旧の独立した検査は維持する。
1個の親locator以外のcache、依存、公開API、保存形式、変換ID、UI設定は追加していない。
06e §10の不採用receipt読取集約は接続していない。

同じ入力・同じ専用Chromiumで各3回の本文編集→外部保存→完全終了後再開と、
Windows PC／touch・専用offline・既存Edge／Chromeの検証を完了した。
Ki-84のcold本文表示には改善を確認していない。実測の全値、比較準備の修正と元の失敗、
合格範囲・残件は[todo](../../tasks/todo.md)に集約する。
