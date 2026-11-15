# Reviewから編集用コピーを直接作る

Status: **PO APPROVED — 実装・自動検証を一括承認**（2026-11-15）。
独立設計レビュー後、POが原本保持・直接初期化・既存作業の復旧を含む本案を承認した。
実装・実測の現在地は[todo](../../tasks/todo.md)で管理する。
今回のCRC／GS行処理の改善と組み合わせる設計判断。小出力の集約サイズ変更は不採用。
原本・画質・手動保存の完全性を保ち、内部処理を簡素化したいというPO方針を、
編集用コピーの復旧方式へ具体化する案である。

## 利用者の結果と現在の問題

「編集コピーを作る」という操作は変えない。独立したProjectと固定された新IDを作り、
全SH係数・モデル・写真・記録を保持する。保存したファイルの全量照合も維持する。

現在はReview原本に加え、内部だけで使うClean ZIPを生成・検査し、親のcopy.zipへ保存し、
同じZIPを子のinput.zipへもう一度保存する。親子の検査でもこれらを繰り返し開く。
[仕様06のhandoff契約](06-project-package-wire.md#isolated-review-to-edit-handoff-implementation-contract)
がこの手順を定めているため、通常のhelper整理として省略してはならない。

b4c1521の50万点SH4診断では、コピー開始から編集可能まで187.826秒、3Dまで202.637秒。
CPU samplingを有効にした別cohortであり、通常時間や本案の短縮量を意味しない。
対策前後の通常3回ずつの比較は既存todoへ集約する。

## 提案する一つの内部処理

新しいコピーは、**Review原本1つと、固定済みの再構成情報から直接初期化する1つのJob**
にする。中間Clean ZIP、その親子の重複保存、Clean入力への変換は作らない。
架空のCleanArchiveや検査済みフラグで既存検査を迂回する方法は使わない。

- 原本の完全なZIP検査、snapshot、既存の再構成規則を使う。recipe・新ID・実際の
  Automerge metadata bytes／proof・初期変更bytesを一度固定する。再試行でactorやIDを作り直さない。
- 既存の新規runの空確認・Project lease・DB作成順を守る。単一Jobに原本、recipe、
  metadataとそれぞれの厳密な参照、index、Start、完了記録を保存する。新しい閉じた内部schema
  で既存の親子形式と識別する。公開ZIP形式・semantic profile・容量枠は変えない。
- 保存した原本を新しく開いて全量照合し、recipeから再構成した記録と保存済みmetadataを
  照合してからStartを認める。元のProjectの履歴や共有関係を新Projectへ捏造しない。
- 検証したReview entriesを既存のモデル／メディア検査とCAS stagingへ渡す。保存後の
  CAS全量照合、モデルfactとmedia inventory、Journal parts、本体保存・読み戻し、
  publication前後の検査は保つ。単に入力が同じという理由で別の検査結果を貸さない。
- typed Sessionの専用初期化commandを通す。既存初期化の共通部分を使い、UIから
  保存領域へ書かない。専用の閉じたlocal Journal目的／bindingで単一Jobを検証する。
  公開API・内部portとimport境界は実装前の独立レビューで確定する。
- 完了は固定した初期Journal／publicationと厳密に対応付ける。完了後に加えた本文や写真を、
  再試行・確認で初期状態へ戻さない。原本ZIPと実際の初期化情報は保持する。
  初期化共通部は同じwrite lease内のresumeが返す公開後照合済みのSession readを返す。
  Job完了receipt自体を独立照合した後に、表示のためだけに同じ本体をもう一度読まない。

## 中断時と既存データ

Start前の未保持原本だけは、同じhash・長さの原本選び直しで続行する。
Startで認めた原本・metadata・recipeや、Prepared以降のJournal partsが失われていたら、
従来同様に修復が必要とする。確認済み資料を新しく生成して埋め直さない。
復旧は同じJob・新Project・初期変更を一度だけ反映し、二重のProjectを作らない。

Job directory、独立index、Journal／publication参照を合わせて未完了処理を発見する。
directory全体が失われても中断を隠せないようにし、孤立Journal、Job／namespaceの衝突、
矛盾する識別情報、確認済み資料の欠損を拒否する。未完了／不整合Jobがある間は、
無関係な編集・取り込み・書き出しを認めない。旧形式の探索・保護との共存も確認する。

既存Projectと実在する旧方式の未完了Jobは保持し、従来の復旧を続けられるようにする。
旧方式の完了済み資料も探索・保護で引き続き解釈する。
これは未公開版どうしの任意な巻き戻し互換ではなく、手元の未完了作業の保全である。
旧方式はその読取／復旧だけに限定し、新しいコピーは直接方式で作る。
既存のファイル画面と再選択・再試行を使い、別の管理画面や選択肢を増やさない。

## 実装するportと境界

- `projectPackage/reviewCopyInput.ts`に、固定済みのPreparedと単一Jobの閉じた記録・
  原本検査・再構成照合・発見・保存／復旧を置く。新しいnamespaceはreview-copyと
  独立review-copy-index。旧review-edit／clean-inputとは識別し、ID衝突を拒否する。
- `MetadataProjectSession.initializeReviewCopy`を追加する。CleanInputJobと直接Jobという
  具体的な権限だけから作るprivateな初期化共通部を使う。Source、厳密なbody取得、inventory、
  persist、fresh Journal検査、完了とowner確認に閉じ、任意recordsを受け取る公開汎用portは作らない。
- local Journalの目的copyReviewを閉じた型へ加え、Startにdescriptor参照を必須で結び、
  sealにも含める。新規2変更・batch body・fresh初期化の規則と復旧権限を明示的に適用する。
  Metadataの公開形式・新規Projectの記録・輸出ZIPのpurposeは増やさない。
- Sessionのread／resume／edit／receive／outputReadyは新Jobの有無と整合性を確認する。
  既存の同じSession内の本文確定は、承認済みの本文先行確定方針を維持する。検証済みの
  publication列と新しく読んだdescriptor／index／Start／完了の参照を照合し、その直後に
  既存のJournal全列一致と本文本体の確認を行う。変更していない原本・recipe・初期metadataの
  全量再検査は開く／復旧／出力で維持し、本文確定のたびに大容量原本を読み直さない。
  汎用ReceiveJobに偽のarchiveを追加しない。ReviewEditJobと既存Host／Catalogのコピー復旧表示で
  旧方式・直接方式を集約し、旧子のcompletion観測は旧方式だけに使う。
- 同じ入力照合内で既存OutputIntegrityReadを使う場合は、新Jobの厳密なoriginal.zipだけを
  path allowlistへ追加する。descriptor／Start／hash／長さとowner寿命を保ち、別書込へ貸さない。

## 採用条件と承認された判断

全体回帰で確認した開始順序の補足（2026-11-15）。新しいHostを開く際も、元の
package-operationの排他を**端末DBの作成・新Projectの有効化より前**に取得し、
同じ排他を初回コピーの完了まで保持する。事前確認して解放し、後で取り直す方式にはしない。
公開Host入口とEntry経由の両方で守る。初回だけprivateな有効期間付きの実行closureを渡し、
内側から同じ排他を取り直さない。Hostの公開optionsや戻り値へ権限・確認済みflagを増やさず、
closureは外側の終了時に失効させる。後の再試行・再選択・中止は従来どおり新しく取得する。
拒否時は元のViewと固定済みの作成情報を保ち、DB・原本・Journalを作らない。
Entryが先に取得したProjectの編集権は既存の失敗処理で解放する。後からDBを削除して
副作用を隠す方法は採らない。これは既承認の開始順序の修正であり、新しい保存方針ではない。

判断対象は**親子Clean ZIP方式を単一の直接初期化Jobへ置き換えること**。
上記port・閉じた記録とJournal検査を独立レビューし、実装・試験までまとめて進める。
細かな実装手順ごとに再承認を求めない。新依存・公開・renderer採用は含まない。

同じ50万点SH4で通常条件の前後3回、原本検査、保存、初期化、編集可能、3D、ファイル出力、
cold再開を測る。原本・全係数・写真のhashと記録・位置・新しいProject識別情報を照合する。
PC／スマホ相当の小規模Mesh／Point／GS、完全終了offline、改変・欠損・quota／権限失効・
各中断段階・原本再選択・重複retry・完了後編集の保全と、旧未完了Jobの復旧を確認する。
既存の安全性試験・最終checkpoint・隔離検査と独立差分レビューを再利用する。
実測前に速度の保証を作らず、iPhone実機の合格へ読み替えない。
