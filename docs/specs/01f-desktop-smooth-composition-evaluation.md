# PC向け滑らかな透過の先行評価

Status: **APPROVED — PO2026-10-28が先行技術評価を承認。問題がなければ後続実装へ継続する。採用・製品表示の既存条件は維持。**

## 利用者の課題と判断点

[07n](07n-standard-alpha-chroma-conversion.md)は、半透明・色の透過設定を変換し、
編集・共有・復旧・再開できる。ただし滑らかな透過の面はG1-D未達のため非表示にし、
理由と明示的な切り抜きへの変更を案内する。残る課題は保存方法ではなく実際の表示。

[03 §7](03-gates-and-delivery.md#7-optional-g1-d--smooth-transparency-feasibility)
は「base renderer通過後」のshared-context WBOIT評価を定めている。base／実機iOSの
条件が未完のままPC評価を先行することは、その開始条件に対する新しい例外となる。
本案では**PCの独立した技術評価だけを先行**し、G1-Dの合格条件や製品化条件を保つ。
PO2026-10-28は「技術評価で問題がなければそのまま進めてください」と承認した。
開始順の例外と、問題がなければ後続の仕様整理・独立レビュー・実装へ進む権限を記録する。
07nを再承認する必要はない。物理iOS・core hardening・製品表示の既存条件を
この承認によって合格済みにはしない。

推奨は、この先行評価で既存依存だけの実現性を確かめ、結果から製品接続案を作ること。
もう一つの選択は現03の順序を保ち、base／実機条件を満たしてから着手すること。
Meshのみを通常の透明キューで表示する近道は、GS等との重なりや順序問題を解決せず、
現契約でもG1-Dを迂回できないため本案に含めない。

## 一つの評価対象と変更境界

既存07n材質の不透明／切り抜き／滑らかな透過とGSを、同じカメラ・同じWebGL2
context・同じopaque depthで合成し、カメラを回して重なりを比較する。
線形色空間の蓄積・revealageを用いるWBOIT方式の技術評価に限定する。
CSSで完成canvasを重ねる方式、暗黙の二値化、SH次数の低下は使わない。

- 既存のThree0.186.0／GSL1.4.3を固定し、新しい依存・CDN・ライブラリforkを追加しない。
- 既存の非通常評価経路から隔離して開く。通常版・Desktop候補の表示やfeature flag、
  metadata／profile／wire／変換recipe、既存データは変更しない。
- 評価用の派生material・render targetは評価側が所有し、元のmaterial／textureを変更しない。
  viewerへ保存形式・Project storage・UIを持ち込まない。
- 評価画面は読取専用。既存のopaque／maskのBoolean判定とGSの明示Proxy規則を変えず、
  smooth面の新しいピン閾値・遮蔽規則を発明しない。製品への接続時に別途確定する。
- 07n製品経路は従来どおり、smooth意図を保持し該当面を説明付きで非表示にする。

既存GSLの公開material surface／Three hooksだけで両者を蓄積・revealageへ接続できるかは
未確認。最初にここを確かめる。内部モジュールの変更・deep import・private field依存・
fork・新依存が必要なら、そこで
止めて具体的な不足を記録する。先行評価承認を別方式への白紙委任にしない。

## 検証と終了条件

03の上限である**10 focused workdays以内**を維持する。これは作業上限であり、
暦日や性能の新たな保証ではない。既存fixture／自動ブラウザ基盤を再利用し、
closed aircraft、6層以上、Mesh／GS交差、360度カメラ、draw-order入替を確認する。
原本や私的入力の配布は追加しない。

opaque／maskの既存描画・深度を保ち、主要な消失・順序反転を記録し、同じ解像度・
同じシーンのbaseとのp95 frame time、実format／解像度による追加target bytes、
unload／再作成時の解放を測る。03の30%／暫定64MiBを診断上の比較基準に使い、
新たな製品保証や緩和値は決めない。unsupported拡張やcontext復旧失敗は明示する。

終了時には `PC EVALUATION: FEASIBLE`、`PC EVALUATION: NOT FEASIBLE`、または
`PC EVALUATION: INCOMPLETE — TIMEBOX` と、実行したブラウザ／GPU・失敗・未実行事項を
記録する。主要な消失・順序反転、30%／64MiB超過、復旧・解放の失敗が残ればFEASIBLEと
しない。時間上限の未完を技術不成立と混同せず、結果を得るためだけに上限を延ばさない。
物理iOS・background復旧・
core hardening・POの近似画質判断がなければ、G1-Dの`ADOPT`や製品化を主張しない。
技術的に成立した場合もPoCをそのまま製品へ移さず、表示の説明、smooth面／点／Proxyの
位置指定・遮蔽方針、対応外時の動作を含む一つの製品接続仕様を独立レビューへ回す。
成立しない場合は07nの現動作を維持して理由を報告する。front-K／統合rasterizer／
transmission／WebGPU研究へ自動で拡張しない。

通常表示への有効化、G1-D採用、iOS／offline合格、公開・deploymentは本案の範囲外。
現在の実行状態と次の判断は[todo](../../tasks/todo.md)だけで管理する。
