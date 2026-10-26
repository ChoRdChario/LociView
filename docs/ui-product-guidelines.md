# LociView UI/UX product guidelines

> Status: `PRODUCT-OWNER APPROVED UI/UX PRINCIPLES / IMPLEMENTATION AND
> ACCEPTANCE STATUS ARE SECTION-SPECIFIC`
>
> Consolidated: 2026-09-07. These guidelines preserve the interaction,
> information-architecture, writing and visual direction approved during the
> public-candidate UI/UX closure. They do not by themselves claim that the
> current worktree has passed rendered Desktop or physical-iPhone acceptance.
> Presentation amendment approved 2026-09-14: ordinary-workflow simplicity
> (§§2.1, 4.4–4.5, 6.1, 9.2). This approval is not implementation evidence.
> Comfort goals/reporting delegated 2026-10-26 (§2.2); development targets do not
> replace device/adoption gates or claim implemented performance.

## 1. Authority and scope

This document governs how LociView explains and presents already accepted
product behavior. It does not redefine storage, package, merge, renderer,
migration, media-format or access-control semantics.

When sources disagree, use the following order for the relevant purpose:

1. accepted product specifications and ADRs govern behavior and safety;
2. current code and executable tests govern observed implementation;
3. this document governs accepted interaction and presentation principles;
4. task audit files provide rationale and evidence, not a new product contract.

The labels used below are deliberate:

- **Accepted requirement:** Product Owner-approved direction. An implementation
  may still be missing or awaiting acceptance.
- **Current implementation:** behavior directly observable in current code and
  tests. A dirty worktree is not a release or candidate claim.
- **Evidence pending:** implemented or designed behavior whose rendered,
  assistive-technology or device acceptance is not complete.
- **Proposed:** a recommendation that needs a separate product decision before
  implementation.

## 2. Product experience and visual north star

> Classification: **Accepted requirement**. The quoted product sentence is also
> the **current implementation** wording pattern.

The current implementation and accepted wording pattern use a complete,
concrete statement:

> LociViewは、3Dデータにキャプションとメディアを添付するツールです。

The experience should be **readable like a research document and legible like
an instrument whose target and state are always clear**.

- The 3D subject and the user's record are primary. Branding and controls are
  quieter than the work.
- Calm document-like surfaces provide cleanliness and continuity. A small
  amount of instrument-like precision appears in selected states, dividers,
  measurements and active controls.
- Traditional does not mean ornamental. Do not add decorative grids, scan
  lines, distressed textures, oversized frames or game-like animation merely
  to create atmosphere.
- External visual references are inspiration only. Do not copy third-party
  artwork, typefaces, icons, patterns, sound or motion.
- UI color and 3D-stage background are independent systems. Changing the scene
  background must not recolor the application chrome.

### 2.1 日常操作を中心にする（PO承認 2026-09-14）

**設計の軸：開く → シーンを選ぶ → ピンと記録を扱う → ファイルに保存／相手に渡す。**

ユーザーが覚えるのは作業に必要な概念であり、内部のデータ構造や処理段階ではない。
初回の記録や通常の保存に、ファイル目的の一覧、履歴の仕組み、参照管理の理解を要求しない。
機能を削るのではなく、日常操作・必要時の判断・詳細設定を分ける（§6）。

- 判断材料がない選択を増やさない。画面上の内容と結果から選べるようにする。
- 正常時に内部状態の点検を求めない。処理はアプリが担い、進捗と結果を伝える。
- 複数キャプションウィンドウ、色フィルター、カメラプリセットは閲覧に直接役立つ。
  簡素化を理由に削除したり、日常の操作を詳細欄へ追いやったりしない。
- 現在の低彩度ウォームグレー、控えめな枠・ブランド、3Dと記録を優先するトーンを維持する。
  過密さを小さい文字、アイコンだけの表示、装飾や説明文の追加で解決しない。
- 短くしても、未反映の変更、失敗、破壊・共有の影響、回復の入口は隠さない。

この方針は表示と導線の改善であり、自動的な競合解消、対応関係の推測、参照の一括削除、
保存・ファイル形式の保証変更を承認するものではない。

### 2.2 快適さの開発目標と報告（PO方針 2026-10-26）

**分類：開発の優先順位を決める目標。実装済み・性能保証・採用済みを意味しない。**
POは、快適に使えることを全体の軸にし、定番のUI/UX指針を参考に目標値と報告方法を定める方針を委任した。
既存の仕様03の端末・データ別受入れ、保存・復旧・互換性の契約は維持する。

全体の判断には[NN/gのusability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)の
状態の可視性、一貫性、記憶に頼らない認識、ミスからの回復、必要な情報に絞る考え方を用いる。
新たな設定や確認を増やす前に、対象と結果が分かるか、同じ概念に同じ語を使うか、
不要な判断や再入力がないか、既存の安全な取消・復旧へ戻れるかを確認する。

[NN/gの応答時間の目安](https://www.nngroup.com/articles/response-times-3-important-limits/)では、
約0.1秒は直接操作の感覚、約1秒は思考の流れ、約10秒は注意を維持できる範囲に関係する。
これを参考にした次の値はLociViewの開発判断であり、任意の3Dデータの処理時間を保証する値ではない。
[web.devのINP](https://web.dev/articles/inp)は入力から次の描画までの応答性を扱い、200ms以下を良好の目安とする。
処理全体の完了時間とは別に評価する。正式なfield判定は端末別page-viewのp75であり、少数の自動操作からINP合格やp95を作らない。

| 体験 | 開発目標・確認方法 |
|---|---|
| 選択・入力に反応する | 受付・選択・押下など最初の見える反応は100ms以内を目指す。入力を失わず、選択・focus・処理中を区別する。 |
| 普段の作業が途切れない | タブ切替・検索・絞込みなど単純な表示操作は1秒以内を目指す。永続化の完了とローカル入力の反応を混同しない。 |
| 保存を待ち続けない | 所有する小規模の標準回帰入力では、通常のファイル生成と追加の保存ファイル照合を各10秒以内へ近づける。超過は未達としてtodoに記録する。大容量・別履歴・別端末へ値を一般化しない。 |
| 長い処理でも状況が分かる | 1秒級から処理状態を示す。10秒級は性能残件として扱い、実際に分かる段階や量を伝える。未計測の残時間・進捗率を作らず、取消は安全に実装済みの範囲だけで示す。 |
| 迷わず、安心して続ける | 「開く→記録→保存／渡す→再開」を内部形式・job一覧の理解なしで完了する。正常時の点検、同じ情報の再入力、意味のない選択を要求しない。未反映・外部保存未確認・失敗と安全な次操作は明示する。 |
| 入力方法を選べる | 既存の44 CSS px目標、keyboard/focus、320 CSS px、200% zoom、長い日本語／実IME、動きを減らす設定を維持する。 |

[W3Cのstatus message指針](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)に沿い、
処理状態と結果は作業のfocusを奪わず伝えられるようにする。
44pxは既存のLociView方針で、[WCAGの拡張target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)にも対応する。
これをAA適合や実機受入れの完了宣言にはしない。各操作の安全性・復旧可能性は速さと独立に確認する。

10秒目標の境界は、通常保存が最終「ファイルに保存」選択からdownload開始まで（同期の状態再表示も含む）、
任意照合がファイル選択確定から一致の通知までとする。OSでの保存完了や、人間のpicker／判断待ちは別に扱う。
内部の生成だけが速くなっても、再表示・受渡しを待たせていれば通常保存の達成にはしない。

計測は既存の実ファイルworkflowを使う。入力のbytes・履歴・出力件数、端末／browser、build、
trace／計測条件、回数nを添え、通常生成・任意の再選択照合・人間の判断待ちを区別する。
単回は観測値として残す。複数回なら生値とmin/median/maxを添え、少数値から保証や百分位を主張しない。
field INP、local Event Timing、描画待ちの代用測定、操作全体の時間を混同しない。
見える反応の改善だけで、長い完了待ちを解消した扱いにはしない。

報告の主語は利用者が終えられる作業にする。短い報告は次の4点に揃える。

1. 今回つながった／改善した利用者の作業。
2. 目標に対する同条件の実測と、未測定・未達の残件。
3. 残る使いづらさ・復旧上の制限・未受入れの端末／offline／通常入口。
4. 次に完了させる作業。

テスト・build・reviewは検証欄にまとめ、件数や部品数を完成度に置き換えない。
通常保存のたびにファイル再選択を要求する方針ではない。自動検証の再選択は正確な保存内容を確認するためで、
画面は引き続きdownload開始・端末への保存完了・内容照合をそれぞれ正しく区別する。

## 3. User-visible mental model and terminology

> Classification: **Accepted requirement**.

Use the smallest set of concepts needed to predict the result of an action.
Internal representation, schema and package terminology remains in diagnostics
or contextual details unless the user must decide something about it.

| User-visible concept | Meaning | Must not be confused with |
|---|---|---|
| プロジェクト | The logical workspace containing models, Captions, media, Scenes and named views; a Project file carries the content defined by its purpose | A temporary view, browser tab or browser recovery copy being a file backup |
| モデル | A logical 3D subject with one Project-wide active revision and alignment | A rendering mode, Scene or filename |
| キャプション | One Project record normally tied to an explicitly chosen model location and reusable in multiple Scenes | A copied per-Scene note, generic image caption or inferred model relation |
| メディア | Images and other content attached to a Caption | A separate model, surface material or an automatically inferred source relation |
| シーン | A named Project presentation selecting models and Captions, Scene appearance and an optional entry view | A model revision, renderer scene object or temporary filter |
| このシーンに含める／このシーンから外す | Shared Scene membership of a Project model or Caption | Temporary hiding, Project-wide deletion or copying the resource |
| 一時的に隠す | Local viewing aid that leaves Scene membership unchanged | Removing an item from the Scene or changing what another user receives |
| マテリアル | How a supported model surface is drawn | Model visibility or Caption color |
| 保存した視点 | A reusable camera and 3D-background state owned by one Scene | Project save, Scene membership or model placement |
| 完全バックアップ | A complete restore of the same Project | A merge contribution or independent copy |
| Team Workspace | A self-contained whole-Project starting point or same-lineage update | A thin change file, account access control or a backup promise |
| Contribution | The dependency-closed difference between current and verified-base history, including valid sibling changes, plus only newly required bytes | A hand-selected subset, standalone restore, filename-based merge or rewritten rebase |
| 閲覧共有用ファイル | One explicitly selected Scene closure that cannot merge back and opens in View first | Access control, permanent read-only enforcement, automatic privacy scrubbing or a backup |
| 編集用コピー | An independent editable Project with new identity | A branch that can later merge into the source |

`Team Workspace` and `Contribution` are contract names in this document; their
final short Japanese control labels require rendered copy review and are not
ratified by translating them mechanically.
The table is a vocabulary reference, not a menu to display at startup or on every
save. File-purpose distinctions belong under the user's intent (§4.4).

### 3.1 Asset and Representation language

> Classification: **Accepted requirement**.

One logical user model is an Asset. Mesh, ordinary points and Gaussian
Splatting are Representation kinds used to display that Asset. They are not
separate top-level work modes. An interaction Proxy is an explicitly related
same-Asset placement aid; it is not another visible model and must never be
chosen from proximity, filename or load order.

Ordinary UI says `モデル` or, at file selection, `3Dモデル`. It exposes a
Representation kind only when it changes a real capability or recovery step.

Model revision is supporting context, not a navigation mode. Every Scene that
contains a model uses the same Project-wide active revision and alignment.
Revision evidence appears when replacement, `要確認`, conflict or recovery
changes a user decision; the Scene selector never asks which revision to use.

### 3.2 Current media boundary

> Classification: **Accepted requirement** for the media-neutral concept;
> **current implementation** for the listed still-image formats.

`メディア` is the durable user concept because video and audio remain product
requirements. The current public-candidate path accepts PNG, JPEG, WebP and GIF
still images only. Do not expose unavailable video/audio controls or imply that
an original HEIC/HEIF file is retained when the user attached a separately
created JPEG.

## 4. Information architecture

> Classification: **Accepted requirement**.

### 4.1 One start surface

There is one normal home at `/`.

- Use one intent-based file entry, `ファイルを開く…`.
- Do not ask the user to choose Native, legacy, backup, GS, Point or Mesh before
  the selected content has been inspected.
- After selection, show only the detected purpose, what will happen, where the
  content will go, and any choice or warning that changes the decision. Browser
  retention does not mean the selected file has been updated (§9.1).
- A model selected through the same entry proceeds to new-Project creation.
- Legacy conversion is a one-time cutover (PO 2026-09-14; specification 07).
  Explain that the source stays unchanged and subsequent team work uses the
  converted Project's files. An old-format update cannot update that Project;
  do not expose a legacy-bridge mode or silently start a separate conversion.
- Existing on-device Projects remain a separate, scannable list with explicit
  View, Edit and file-operation results. Identify these as resumable work, not
  independently backed-up files.
- On successful last-Project resume, show its name with `最後のプロジェクトを再開しました`
  and an adjacent `別のプロジェクトを開く` action. The same action remains reachable
  in the workspace header/file area and leads to file opening and the resumable-
  Project list. An explicit Project choice takes precedence; missing/incomplete
  recovery data does not count as a successful resume.
- Rare device/offline preparation belongs in contextual disclosure after it is
  relevant; it is not a competing start mode.

### 4.2 Workspace structure

The PO-approved 2026-09-10 revision is recorded in §4.3 and spec 05 §13.4.
It supersedes the earlier header/owner-filter arrangement in the development host.

The normal Desktop workspace has three stable regions:

1. a shared header for Project identity, View/Edit state, external-file state
   distinct from internal pending/failure state (§9.1),
   and file/help actions;
2. the 3D stage, with frequent view recovery close to it;
3. a right-side task area with four purpose-based tabs.

The four tabs preserve LociMyu's useful function grouping while adding the
model-management responsibility required by LociView:

| Tab | User questions it answers | Contents |
|---|---|---|
| キャプション | What is recorded in this Scene? What should I add or correct? | Scene list, current-Scene search, pin-color filters, list, existing-Project Caption inclusion, add/place/move, title/body/color, attached media and secondary window tools |
| モデル | What Project models exist, and which belong to this Scene? | Model list/add and clearly separate Scene inclusion/local visibility; contextual placement, replacement, pin scale and supported format controls; Project deletion in secondary management |
| マテリアル | How should this surface look in this Scene? | Current target and common adjustments first; surface targeting, cross-Scene scope, sidedness, unlit and applicable chroma controls progressively disclosed (§4.5) |
| 視点 | From where and against what background should I inspect this Scene? | Fit, six directions, projection and Saved View recall first; view creation/management, entry view and background settings remain reachable but secondary (§4.5) |

Scene switching lives atop Caption; other tabs show the current Scene as context.
Project save state and file exchange stay outside the tabs. Frequent `全体表示` and
Saved View recall may also have a shortcut beside the 3D stage; the shortcut
must use the same state and must not create a second view system.

Tab changes move the UI only. They do not implicitly save, select a different
model, apply a view, change Scene, end a mode or discard unfinished input.
Scene selection itself is local session state: it changes the resolved
presentation and applies that Scene's valid entry view once, but it never changes
the Project-wide active model revision/alignment or silently changes the Project
default Scene.

### 4.3 Accepted Scene-first revision after manual acceptance (2026-09-10)

**Accepted requirement (PO confirmed 2026-09-10); implemented in the bounded synthetic development host, new rendered acceptance pending:** ordinary Caption work starts with
the Scene, then search and direct pin-color circles immediately above the list.
Move Scene selection from the shared-header dropdown to a visible Scene list at
the top of the Caption tab. Move window front/arrange tools out of the upper-left
stage into secondary Caption controls. The stage prioritizes content, view
recovery and contextual placement controls. Do not require everyday model-based
Caption organization. Make later pin adjustment discoverable from the selected
Caption, next to add, without requiring the user to select the owner model again.

**Accepted implementation direction:** retain one navigation state; Scene
changes still affect models, materials and entry views, not only Captions. Other
tabs show the current Scene as context. Tab changes never switch Scene or discard
drafts. Remove the normal owner filter and repeated owner subtitles; retain
contextual model details for hidden/missing models, review and deliberate model
management. Model-independent/unresolved records remain discoverable.

Previous color controls filter pins only. The approved change filters list rows and pins
together, preserving selected/editing records and open windows, with a visible
way to reveal filtered selection. Unknown/review colors need a recoverable path,
not omission or guessed defaults. Filters never delete or change Scene membership.

For new placement, use `ピンを追加` then selecting a visible surface, or
Shift+click directly. Use the exact hit Asset/frame as a visible provisional target
before gizmo adjustment and explicit confirmation. No normal preselection dropdown.
Spec 05 §13.4 records the approved input amendment. Ambiguous/unsupported hits require an
explicit choice or refusal; misses create nothing. Retain internal model-relative
anchors so model movement carries its pins; owner removal, automatic rebind and
new Project-space authoring are not implied by the request.

For later adjustment, select the Caption/pin → `位置を調整` → drag the current
position's gizmo → confirm/cancel. Current code already seeds compatible moves
from the existing position; audit the entry/discovery rather than inventing a
second move system. Preserve current owner/frame, Caption identity and other
Scene references. Only model-update incompatibility requires renewed surface
review. Failure retains the proposal; cancel restores the confirmed position.

### 4.4 保存・受け渡しは目的から始める

**Accepted presentation requirement (2026-09-14); implementation pending.**
Keep the five package purposes and their contracts; do not make them five equal
choices on every save. This organizes the existing intents in specification 06
§11.4 without ratifying a new wire format, sink or migration.

| ユーザーの目的 | 入口と必要時の選択 | 維持する内容・影響 |
|---|---|---|
| 自分の作業をファイルに残す | `ファイルに保存`。名前は任意 | 手動checkpointは同じProjectの完全backup。自動再開用データとは別。既存の手動ファイルを無断で上書きしない |
| 相手に作業を渡す | `相手に渡す`の中で、作業一式を渡すか変更を返すかを選ぶ | Workspaceは単独で開始できる。Contributionは検証済みの基準が必要。送信相手の受領は推測しない |
| 一つのシーンだけを渡す | シーンの共有操作から内容と共有範囲を確認 | reviewの範囲・プライバシー・統合不可を明示。単なる閲覧モード切替ではデータを転送しない |
| 別のProjectとして使う | Project管理のコピー操作から影響を確認 | cleanは独立した編集用コピー。元Projectへの変更返送はできない |

変更を返す際は、`元にする作業一式`だけではなく、どの共有ファイルへの変更を返すのかを
説明する。候補には識別可能な名前・日時など利用可能な文脈を表示し、選択後も対象を見せる。
名前・日時は識別の補助であり、系統や基準の証明ではない。最新らしいファイル、同名ファイル、
相手の推定状態から基準を選ばない。基準が失われた場合の回復は§7.2に従う。

生成は通常操作の内部工程とし、独立したジョブ管理を覚えさせない。ブラウザが許す範囲で
一つの保存／受け渡し操作から処理を進める。追加の明示操作が必要な環境では、現在の状態と
次の一手を示す。共有範囲の確認や保存先の許可は省かない。出力の完了表現は§9.1–9.2に従う。

### 4.5 設定・片付けは日常操作と分ける

**Accepted presentation requirement (2026-09-14); implementation pending.**

- モデルのシーン所属は`このシーンに含める`、一時表示は`一時的に隠す`と区別する。
  チェックや目のアイコンに同じ「表示」という意味を持たせない。共有する変更か一時操作かを示す。
- 通常の片付けは`このシーンから外す`。Project全体からの削除は詳細操作に置く。
  削除が参照によって止まる場合は、残っているシーン・記録・設定と、その確認先への導線を示す。
  ユーザーに参照先を探し回らせない。参照ゼロ条件の撤廃、連鎖削除、ピンの自動付け替えは別判断。
- マテリアルは現在の対象とよく使う調整を先に表示する。対象が既存の明示選択から一意なら
  名前を示し、同じ対象の再選択を要求しない。複数候補がある場合は選択を残す。
  全シーン共通設定や専門的な項目は段階表示とし、適用範囲と他シーンへの影響は隠さない。
  設定を開いただけでは編集・保存せず、確定／取消と下書き保護を維持する。
- 視点タブは全体表示・六方向・投影方式・保存した視点の呼び出しを中心にする。
  開始視点は視点管理、背景編集は詳細へ分ける。現在のカメラ操作、保存視点の更新、
  シーン開始設定は同じ操作にまとめず、背景をどこまで残すかも対象の操作で伝える。
- 詳細は対象の近くから戻れるようにする。折りたたむことを機能の削除や、
  iPhoneでの操作不可に置き換えない。

## 5. Caption-first interaction

> Classification: **Accepted requirement**.

Caption work is the ordinary center of the product.

1. Search or select an existing Caption, or use the Caption-add action.
2. For a new Caption, use a uniquely selected visible surface to establish the
   provisional target; show it before confirmation (§4.3), not as mandatory preselection.
3. Keep adding, moving and re-placing the pin adjacent in the action hierarchy.
4. Show title, body, color and media for the selected Caption without making
   the user leave the list context.
5. Preserve list position, selection and unfinished fields during nearby view
   and tab operations.

The ordinary list shows Captions included in the current Scene. A separate
progressively disclosed picker can add an existing Project Caption to this Scene
without copying it. Editing one Caption changes that shared Project record; when
it belongs to multiple Scenes, show the affected Scene count at the edit point.
`このシーンから外す` removes only membership. Project-wide deletion is a
separate destructive action that names the affected Scenes and attachments.
Existing/imported Project-space Captions remain visible in one explicit
model-independent list/filter bucket and can be re-anchored deliberately. New
Project-space Caption authoring is outside the current accepted slice. No surface
hit, empty Scene or missing model ever creates one or fabricates an owner model.

The Caption list stays in the right task area on Desktop. It must not live below
the page or behind a collapsed section that forces page travel to identify the
selected pin. Direct pin-color circles sit immediately above the list, below
Scene/search controls; filtering should take one action per color and must not
be hidden behind a generic menu.

Floating Caption windows are view aids on the 3D stage, connected to their pins
when a connector is meaningful. They do not replace the list as the selection
authority. Explicit selection opens and retains each window by default; selecting
the next Caption does not replace earlier windows. Re-selecting an open Caption
brings the same window forward without duplicates. No separate retain action is
required. Users close windows individually; refresh does not reopen a dismissed
window, but an explicit re-selection/open does. The user can bring one forward or
arrange them without altering Project data. Use the familiar
`×` for closing, with an accessible name. Do not repeat `選択中 01` when the list
highlight and window title already convey the same state.

The PO-specified Desktop camera uses Blender's basic mouse bindings: middle-button
drag orbits, Shift+middle pans, and wheel/Ctrl+middle zooms. Left-button input is
reserved for selection/placement, including Shift+left for pin addition. Keep
existing touch alternatives and explicit view controls; do not imply full Blender
keymap, frame conventions, fly/walk or input-emulation support. Reference:
[Blender navigation](https://docs.blender.org/manual/en/5.0/editors/3dview/navigate/navigation.html).

## 6. Decision-load policy

> Classification: **Accepted requirement**.

Every control and message belongs to one of three classes.

| Class | Treatment | Examples |
|---|---|---|
| The user must decide | Keep explicit, name the affected object and consequence | Caption meaning, the model on which to place a new Caption, what to do after a detected conflict, destructive action, source authority, external disclosure |
| A safe deterministic default exists | Perform it and report the result only when useful | Content-derived supported format routing, initial non-destructive view, fit-to-visible-bounds |
| Rare or state-specific | Hide initially and reveal at the relevant task/state | GS placement aid, advanced material controls, diagnostics, recovery details |

Reducing decisions never authorizes semantic guessing. The product must not:

- infer a source relation from filenames, proximity or ordering;
- choose a conflict winner without confirmation;
- silently remap a Caption to another surface or model;
- perform an unconfirmed destructive operation;
- infer a package purpose from its filename;
- hide failure, unsaved state, unsupported state or the recovery path.

If file content or purpose remains genuinely ambiguous after strict inspection,
stop and explain the needed evidence; do not turn ambiguity into a guessed role
choice. The current Native fixed-baseline path rejects an unsupported or
conflicting merge without writes. The accepted ProjectScene/team-history target
instead retains a completely verified causal batch atomically, blocks only the
affected authoritative projection and requires an explicit later resolution;
it never presents a library-selected value as the winner.

For a duplicate Scene membership conflict, show the named candidates with
keep-one and `両方残す` choices. Keep-both creates independently editable
Caption/model items, not two linked aliases. Confirm which continues the original
and which becomes a copy, disclose other-Scene effects and leave existing Caption
model ownership unchanged. Preview the actual result; do not automatically merge
equal-looking choices or choose an original candidate for the user. Other typed
conflicts expose only their implemented resolution actions.

### 6.1 人が判断できる比較を提示する

**Accepted presentation requirement (2026-09-14); implementation pending.**

`登録1／登録2`や`候補1を残す`だけでは、何が違い、結果がどう変わるかを判断できない。
対象の記録名、比較する内容、利用可能な出所の文脈、他シーンへの影響と適用結果を示す。
番号は補助には使えるが、判断材料の代わりにはならない。出所を証明できなければ推測しない。

ピン位置・色・カメラ・マテリアルは、見た目の比較を先に置く。座標、ラジアン、sRGB値、
内部IDは詳細情報とし、数値を読めることを解消の前提にしない。比較表示は一時的なものとし、
選んで確定するまで共有データや競合の勝者を変更しない。表示できない候補はその理由を示し、
表示できた候補だけが正しいように誘導しない。文章・名前など視覚以外の識別手段も併用する。

「元として残す登録」の選択自体を省けるかは、意味と他の参照への影響を確認する再検討事項。
今回の承認は説明・比較・導線の改善であり、既存の明示選択や独立した`両方残す`の意味を
変更してよいという承認ではない。通常の表示改善を、この別判断のために止めない。

## 7. Writing and labels

> Classification: **Accepted requirement**.

### 7.1 Core rules

- Start with the user's object and desired result: `ファイルを開く`,
  `3Dモデルを選択`, `メディアを追加`, `ファイルに保存` (external file only).
- Give the product a grammatical subject. Avoid unexplained fragments such as
  `3Dを見て、場所に記録する`.
- Use one stable term for one concept across home, preflight, workspace,
  confirmation, success and recovery.
- Prefer input-neutral `選択`. Mention dropping only as an additional route;
  do not make mouse or touch vocabulary part of the product model.
- Confirmation buttons name the result (`復元する`, `統合する`, `削除する`),
  not `OK`.
- Familiar symbols such as `×` and image arrows may replace words only when
  their accessible name remains explicit. Do not iconize the four tab names.

### 7.2 Helper text test

Helper text earns its place only if it changes the current decision, prevents a
likely error or supplies recovery. Remove it or move it to contextual help when
it merely paraphrases the label, narrates automatic inspection, advertises an
implementation detail or combines unrelated facts.

Brevity does not apply to a hidden consequence. Show the following beside the
affected action when relevant:

- whether work is only retained for browser recovery or reflected in a local file;
- which changes/scope a file-save action includes and what remains unreflected;
- whether a file can merge back, only open for review, or creates a new Project;
- the exact scope and prerequisites of collaboration;
- what original bytes, labels or metadata leave the device;
- what failed, what stayed unchanged and what the user can safely do next.

A team-file preflight first names the purpose and result. When the user needs
the evidence, it then reveals whether the file is whole-Project or base-dependent,
the verified base/head relation, every unsent change class, newly included byte
size, the generated change summary and any optional human memo. The ordinary
surface does not expose raw IDs or hashes, but it also cannot hide an unsent
model, Scene, material or view change behind a Caption-only description.
For a Contribution, the visible base means the exact Team Workspace expected at
the recipient. Importing a sibling Contribution or finishing an export does not
silently advance it. When no verified base record remains, the recovery is a new
Team Workspace rather than a guessed recent file.

## 8. Visual language

> Classification: **Accepted requirement**. Exact worktree token values below
> are a **current implementation snapshot / evidence pending**, not permanent
> brand constants.

### 8.1 Color

The accepted base is a low-chroma warm greige: cleaner and quieter than a green
interface, warmer than neutral office gray, and substantially less saturated
than tan. Current worktree reference tokens are:

| Role | Reference |
|---|---|
| application background | `#e6e4e2` |
| panel | `#f2f0ee` |
| field | `#faf9f8` |
| primary text | `#312f2d` |
| secondary text | `#504d4a` |
| structural line | `#817c78` |
| quiet divider | `#d2cfcb` |
| primary action | `#413d39` |
| destructive state | `#8b2c29` |

These are a controlled starting palette, not an irrevocable brand standard.
Rendered contrast, display variation and physical-device acceptance can tune a
token while preserving the semantic hierarchy and low-saturation direction.

Pin colors are user data. Never reuse them as success, warning, error or
selection colors. Status also needs text, shape or position; color alone is not
sufficient.

### 8.2 Typography and brand

- Use the platform system sans stack until a separately reviewed font decision.
- Body text is normally 14–16 CSS px; helper text may be 13 px when contrast and
  density remain comfortable.
- Use a restrained 400/500/600 weight ladder. Do not compensate for weak
  hierarchy with pervasive bold text.
- Until the Product Owner supplies a logo, `LociView` is a quiet 14 px,
  normal-weight wordmark. It must not compete with the Project name or task.
- Avoid decorative monospaced text, condensed display faces and runtime font
  downloads.

### 8.3 Geometry, borders and depth

- Use mostly rectangular controls and panels with approximately 2 px corners.
- Establish hierarchy with spacing, grouping, weight and border strength before
  adding fill or shadow.
- Use small, directional shadows only for real layers such as dialogs, popovers
  and floating Caption windows.
- Primary actions use a clear filled surface; secondary actions use a quieter
  field/panel surface and border; destructive actions are distinct but are not
  visually dominant until relevant.
- A pressed control must feel engaged through a changed fill, inset edge and/or
  approximately 1 px movement. Hover alone is not activation feedback.
- Selected, pressed and keyboard focus are different states and remain visually
  distinguishable when they coincide.

## 9. Components, state and recovery

> Classification: **Accepted requirement**. Individual recovery behaviors remain
> **implementation- and evidence-specific**.

- Interactive targets start from a 44 CSS px touch target unless the platform
  supplies a larger requirement. Dense visual marks may be smaller inside that
  target.
- Visible focus remains at least as clear as selection. Keyboard navigation
  follows visual order and does not require a pointer-only drag.
- Unknown icons keep text labels. Repeated familiar icons use one stroke family,
  one meaning and an accessible name.
- Disabled controls explain the reason and next available action nearby; do not
  rely on faded appearance alone.
- Modes such as pin placement, pin movement and model gizmo work show the active
  object, current mode and an always-reachable finish/cancel path close to the
  stage.
- External-file state and internal pending/failure state remain distinguishable
  across tabs. Internal acknowledgment alone must never show `保存済み`; see §9.1.
- Project identity and current Scene remain understandable across every tab.
  Local Scene selection, camera and filters are not shown as shared edits;
  membership, default Scene, Scene entry view and named Saved Views are.
- Long-running import/export/merge uses a perceivable status region. A cancel
  action appears only where cancellation is actually supported.
- A failed mutation keeps the last durable Project intact, preserves recoverable
  input where the accepted implementation supports it, and states the safe
  retry or rollback path.
- Collaboration, backup and share preflights describe the actual implemented
  contract. The current Native fixed-baseline path must not promise continuing
  co-editing. The future team path distinguishes self-contained Team Workspace,
  base-dependent Contribution, one-Scene review, same-Project backup and
  independent clean copy.

### 9.1 File save versus recovery data (PO approved 2026-09-13)

> Classification: **Accepted requirement**, governed by product contract 00 §2.1.
> **Current bounded implementation:** the Scene development/metadata/validation
> hosts no longer map internal acknowledgment to `保存済み`. Their header, mutation
> feedback, catalog and retention notice distinguish browser resume data from
> file output. Code/recorded-DOM checks are not rendered/device acceptance;
> bounded validation-file generation/download/optional verification now exists;
> this does not establish ordinary-home or device acceptance. Current connection
> coverage belongs in [the inventory](../tasks/implementation-inventory.md).

- Internal working-data retention is not announced as Project save success. Where
  necessary, say `ファイルに未反映の変更があります`; contextual help explains
  that browser-held work is for resume and can be lost with site data. Do not
  repeat storage-engine narration after each edit.
- Reserve `保存しました` for confirmed reflection of the stated content in the
  user's local file. Browser download handoff may say
  `ダウンロードを開始しました。保存先で完了を確認してください。`;
  generation/handoff/unknown completion never clears the external-file warning
  as if a file write had been confirmed.
- Successful resume identifies the actual Project and offers §4.1's other-Project
  path. A transient notice is not the sole navigation. Missing or failed recovery
  shows a concise failure and the file-open/recovery alternative, not a success.
- Switching retains existing draft, failure and unreflected-change protections.
  Do not silently discard them, infer a file write, or delete recovery data.
  Cancellation must leave the current work available.

Acceptance: internal acknowledgment without file success; scoped external-file
success without acknowledging later/unincluded edits; download/cancel/failure/
unknown completion; correct resumed identity and reachable other-Project path;
missing recovery; and switching without silent loss. Reuse the existing host/UI
tests and consolidated rendered/device batch when implementing this requirement.

The PO's game-like backup direction is in product contract 00 §2.2: named manual
checkpoints coexist with one latest automatic point per Project. Auto replaces
only its own point after successful output, never a manual checkpoint. Recovery
identifies the Project, time and manual/auto source; optional names are labels,
not identity. Routine triggers are coalesced rather than generating distracting
dialogs/downloads or heavy output per gesture. Browser-only resume data is not
labelled file-saved. The PO-approved fallback without an available external sink
is latest browser resume data plus explicit manual file saving, with a concise
capability/permission explanation and no invented download completion. Concrete
timing is delegated, not a new user decision at every edit.

### 9.2 正常な作業に内部点検を要求しない

**Accepted presentation requirement (2026-09-14); implementation pending.**

- 正常時の`状態を確認`や生成ジョブ一覧を、通常作業の必須手順にしない。
  通常は進捗・結果・現在使えるファイルを示し、処理履歴や技術情報は詳細へ置く。
- 中断や失敗では、対象、保持されている内容、次にできる操作をその場で示す。
  状況に応じた`再試行`、`元のファイルを選び直す`などを入口にし、
  ユーザーにjournalやreceiptの状態から復旧手順を組み立てさせない。
- 元の変更・既存の保存時点を保持し、取りやめる際は残る内容と影響を伝える。
  内部の安全確認は省略せず、途中状態を完了として表示しない。
- 同じ未確認メッセージを各所へ重ねず、ファイル操作の近くと共通状態欄に要点を集約する。
  現在の操作に必要な警告を詳細へ隠さず、生成後の新しい変更も区別する。
- ダウンロードしたファイルの再選択確認は、利用者が必要時に選べる詳細操作。
  日常の必須儀式にはしないが、未確認のまま`保存しました`とも表示しない。
  通常homeを含む旧経路の端末内データも、この保存表現の点検対象とする。

## 10. Responsive behavior

> Classification: **Accepted requirement / evidence pending**.

Desktop keeps the 3D stage and right task area simultaneously visible. Caption
list and details scroll within the task area so browser-page scrolling is not
required to confirm a selected pin.

On a narrow or short display, reflow the same concepts instead of shrinking the
Desktop layout. Preserve object names, action labels, save/failure state,
selection and mode exits. The list and detail may switch within one Caption tab,
but each provides a direct return to the other. Respect safe areas and the
onscreen keyboard, and never hide the only way to end a placement or gizmo mode.

Multiple floating windows may be arranged on a constrained stage, but that is
UI-only state. Responsive behavior must not silently close retained windows,
change selection, mutate Scene membership or lose the user's explicit
comparison intent. A separate one-window mode remains proposed, not approved.

Narrow layouts provide the same Project administration and decisions as
Desktop: Scene selection/authoring, Project-wide model replacement/alignment,
Caption reuse, material/view editing, team-file preflight, revision review and
conflict resolution. Device resource limits may reject an operation safely
before writes with a clear next step; they do not define a reduced contributor
role or silently hide a capability category.

## 11. Accessibility and evidence

> Classification: **Accepted requirement / evidence pending**.

Applicable WCAG 2.2 AA criteria are the verification target. Contrast checks
include 4.5:1 for normal text, 3:1 for large text and 3:1 for visual information
required to identify controls or states under SC 1.4.11. Focus visibility, order
and obscuration are checked under their applicable criteria. This is not a
conformance claim.

Acceptance checks include:

- keyboard-only traversal, visible focus and logical order;
- touch without hover, including 44 px targets and drag alternatives;
- 200% zoom and approximately 320 CSS px width;
- long Japanese labels, IME input, many Captions and empty/error states;
- reduced motion and non-color status cues;
- Scene A/B switching without cross-Scene leakage or an implicit Project edit;
- adding one existing Caption to another Scene without copying its content;
- Project-wide model replacement showing all affected Scenes and `要確認` state;
- temporary camera versus shared Saved View and separate entry-view assignment;
- all five file purposes with exact whole/base-dependent/one-Scene consequences;
- ordinary record/save work without choosing from five package purposes or doing
  healthy-state diagnostics; one understandable next action during output/recovery;
- meaningful conflict comparisons without requiring raw-coordinate or registration-ID
  interpretation, while retaining explicit choices and complete candidates;
- clearly different Scene-inclusion and temporary-visibility actions, with reachable
  references when Project deletion is blocked;
- daily material/view operations ahead of advanced settings, with scope, shared
  effects and narrow-screen access preserved;
- affected-only semantic conflict blocking and an explicit resolution/recovery path;
- feature-parity reachability on physical iPhone, not a contributor-only layout;
- Desktop rendered walkthrough and physical-iPhone checks where the change is
  mobile-sensitive.

DOM structure or CSS inspection proves neither visual quality nor physical
device acceptance. A development server is not offline/PWA evidence.
For the simplicity amendment, reuse the existing task walkthrough and record the
choices, repeated input and navigation needed for the affected workflow. Add no
separate audit matrix or test framework. A shorter flow is not a pass if it hides
an effect, removes a useful function or makes a recovery action unreachable.

## 12. Implementation snapshot and change control

> Classification: **Historical implementation snapshot / no new rendered acceptance**.

As inspected on 2026-09-07, branch `g0-baseline` at checkpoint
`21786771bdb39800a29f835fa4f25535cd01d5bc` contains the one-home composition,
four-tab workspace, Caption list/detail, pin-color controls, multiple
Caption-window comparison and the warm-greige visual system. The Native
implementation at that checkpoint persisted DisplaySets and used fixed-baseline
package exchange. ProjectScene, continuing causal Contribution and the five-purpose
v2 package contract were not implemented at that checkpoint. The inspected code was
under `src/ui` and `src/nativeGs`; task-specific historical evidence remains in
`tasks/uiux-implementation.md` and `tasks/uiux-parity-plan.md`.

Do not treat that 2026-09-07 snapshot as today's connection status. Read
[current work](../tasks/todo.md), [feature coverage](../tasks/implementation-inventory.md)
and the applicable route's code. The 2026-09-14 simplicity amendment is approved
guidance; it does not claim the current Native/home or ProjectScene UI satisfies it.

Automated checks can establish structure and state contracts; rendered Desktop
and any newly required physical-iPhone acceptance remain separately recorded
evidence. A changed interaction principle or product behavior requires the
applicable Product Owner and specification decision before implementation; this
document must not be used to conceal a behavior or architecture gap with copy or
layout alone.
