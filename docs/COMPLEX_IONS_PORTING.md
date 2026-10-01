# 錯イオン教材の移植契約

対象原本は [`data/complex-chemistry.json`](../data/complex-chemistry.json)。`schemaVersion: 3`、`contentVersion: "complex-ions-2026-10-02"`、`migrationVersion: 2` を持つ。錯イオン17件、化合物36件（標準4・発展32）。初版の錯酸2件は `retiredCompoundIds` に記録し、旧保存・Importから除外する。補助水素イオンは互換性のため保持するが、単独では出題しない。

イオンの `formula` は `[Fe(CN)6]` のように電荷を含めず、`charge` に符号付き整数を置く。Fe(II)とFe(III)は本体式が同じでもIDと電荷が異なる。化合物は `cation` / `anion` でIDを参照し、正規式を `formula` に明記する。`chemistryClass: "complex"` と `curriculumLevel: "standard" | "advanced"` は既存の問題難易度 `normal` / `hard` とは独立。標準は初期 `enabled: true`、発展は `false`。金(I)のK/Na塩も発展教材に残すが、`evidence.status: "unverified"` を維持する。根拠の限界は[台帳](COMPLEX_IONS_EVIDENCE.md)を参照する。

ブラウザのDOM、保存領域、通信に依存しない移植対象APIは次のとおり。

| モジュール | API | 契約 |
|---|---|---|
| `js/chemistry/complex-policy.js` | `isComplexItem(item, ionById = new Map())` | タグ、角括弧付き式、または参照イオンから錯体対象を判定する。 |
| 同上 | `complexItemAllowed(item, enabled, ionById)` | 通常項目を通し、錯体対象は `enabled === true` の時だけ通す。教材自体の `item.enabled` は呼び出し側で別途確認する。 |
| 同上 | `validateComplexIon(ion)` | 電荷・酸化数・配位子数と本体式の整合、アクア／チオスルファト除外を診断文字列配列で返す。空配列は当該検査を通過したことを示す。 |
| `js/chemistry/formula-syntax.js` | `formulaSyntaxValid(value, { allowCharge = false } = {})` | `()` と `[]` の対応、空括弧、文字集合と末尾電荷の構文を検査する。正答比較や化学的同値判定は行わない。 |
| `js/data-migrations.js` | `composePublishedBundle(base, pack)` | 既存の `ions` / `compounds` / `difficulty` に `supportIons`、`ions`、`compounds` を追加し、版を付ける。ID重複は例外。 |
| 同上 | `migrateBundle(bundle, pack)` | 旧保存・Importへ今回のIDを一度追加する。版1以上へパックは再追加せず、削除された新IDを復活させない。版に関係なく対象の錯酸IDは除外する。未移行データのID衝突は例外。 |

新しい環境では、まず既存マスターを `composePublishedBundle` で合成する。既存の利用者データはバックアップしてから `migrateBundle` を通し、その後に参照・中性・有効状態を含む全データ検証を行う。例外や検証失敗時は保存値を上書きしない。複数の錯イオン単位の組成式では `[錯イオン]2` とし、追加の丸括弧で包まない。通常多原子イオンの `(NH4)2` は維持する。

Competitionへ移植する場合、JSONパックと上記純粋関数の入力・出力を同じfixtureで照合する。部屋作成時の `complexEnabled` と教材版はサーバー側で固定し、出題・正誤判定もサーバーを正本にする。現在のCompetitionアプリへの組込み、DB移行、ライブ対戦での検証はこの文書の対象外。

2026-10-02変更: 錯酸 `acid_h_au_cl_4`／`acid_h2_pt_cl_6` は削除。`retiredCompoundIds` を旧保存・Importから除外する。版1の保存へパックを再追加せず、編集・削除済み項目を保持する。水素イオン補助データは既存参照の互換性のため保持するが、単独では出題しない。名称語片はやさしめ・錯イオンONで4列2行、酸ボタンなし。シフトで括弧切替。
