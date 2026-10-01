# IonicFormula 管理画面・錯イオン追加仕様（実装・移植契約）

作成日: 2026-10-01 / 調査基準: a436920

状態: **機能方針・全55種の採用・括弧フリックの追加要求を確認済み。2026-10-01に実装・公開を承認済み。** 本アプリの実装・ローカル検証済み。Competitionへの移植は今回行わない。

## 1. 目的と確認事項

高校化学の式・命名・電荷の理解を、短い反復ゲームで練習する。既存体験を維持し、錯イオンを任意で追加する。本アプリで検証後にCompetitionへ移植できるよう、教材・化学規則と画面／保存／通信を分離する。

ユーザー確認済み（2026-10-01）:

1. 管理画面は簡易ロック。変更パスワードはそのブラウザ内に保存する。
2. 化合物問題は既存の「陽・陰イオン→化合物の式／名」を維持する。添付の「化合物の式⇄名称」は今回追加しない。
3. 錯イオンONは通常問題との混合。トグル初期OFF。標準／発展は既存難易度と独立。標準レコード初期ON、発展レコード初期OFF。

追加確認済み（2026-10-01）:

4. **K[AuCl2]、Na[AuCl2]も採用する。錯イオン17種・化合物38種（標準6、発展32）すべてを収録する。** 金(I)の2塩も添付どおり発展・初期OFFとし、実行時マスターから除外しない。
5. アプリキーボードの既存 `(` `)` キーから上下フリックで `[` `]` を入力する。ON限定かどうかは実装の軽快さ・安定性を考慮して決定するよう委任されたため、本仕様では**錯イオンON/OFFにかかわらず常時有効、上・下どちらでも入力可能**とする。詳細は6節。

全38種を高校化学の式・命名を練習する教材として採用する。水和物・溶液の組成表記を含み、全38種の無水単離結晶を確認したという意味ではない。金(I)の2塩はユーザーの採用判断によるもので、今回の調査で個別の実在根拠を確認できなかったという記録は維持する。実験手順・結晶構造・固体色の教材には拡張しない。

## 2. 現行実装から分かったこと

- 静的サイト。admin.htmlはlocalStorageの `ionicFormula.adminData.v2` を編集する。公開JSONの書換え・全端末配布機能はない。
- 公開教材は47イオン・156化合物。現行validateDataは合格、既存酢酸塩の許容別表記警告3件。
- js/core.jsに正規化、式生成、判定、抽選、データ検証がある。
- イオンのformulaは電荷を含めず、chargeを別に保持する。添付の `[Cu(NH3)4]2+` をそのままformulaへ格納すると電荷が二重になる。
- js/app.jsの式入力チェックは角括弧を許していない。キーボード・入力検証・削除／カーソル操作を併せて拡張する。
- ローカル管理データは公開データ全体を置き換えるため、JSONへの単純追加だけでは編集済み端末に新教材が届かない。
- Competitionは `src/games/ionic-formula/` 内にJSON、server/question-generator.ts、shared/answer-evaluator.ts、React入力UIがある。既に別実装なので、単なるJSONコピーでは機能は移植できない。

## 3. 化学・教材レビュー

### 3.1 確認できた範囲

添付の錯イオン17種（標準10・発展7）と化合物38種（標準6・発展32）の全55行を読み、名称に記載された中心金属の酸化数とNH3=0、OH/CN/Cl=-1から電荷を計算した。錯イオン電荷と化合物の電気的中性に不整合はない。これは実在性・単離形態の全件確認とは異なる。

アンミン、シアニド、クロリド、ヒドロキシドに統一する方針は妥当。啓林館の教材検索結果でも新命名の配位子名を確認でき、同社の訂正表はシアノ→シアニドの訂正を明示する。旧名称を不正解とするのはこのアプリの教育方針として実施し、「化学的に存在しない名前」とは説明しない。「アミン」はアンミンの誤記として区別する。[啓林館の訂正表](https://www.shinko-keirin.co.jp/keirinkan/kou/science/info-teisei/fukukyouzai/pdf/shinpen_kagaku_kiso.pdf)

### 3.2 錯イオンの評価

| 群 | 添付の対象 | 推奨 |
|---|---|---|
| 高校化学の中核として扱いやすい | Agアンミン、Cuアンミン、Znアンミン、Alヒドロキシド、Znヒドロキシド、Fe(II)/Fe(III)シアニドの7種 | 標準・初期ONを維持 |
| 高校化学の関連・補足を広げる | Cuクロリド、Au(III)クロリド、Pt(IV)クロリドの3種 | 標準10種という希望は維持可能。ただし全教科書共通の必修10種とは表示しない |
| 発展 | Agシアニド、Niアンミン、Coアンミン、Au(I)クロリド、Pt(II)クロリド、Sn(II)/Sn(IV)ヒドロキシドの7種 | 発展・初期OFFを維持。規則を応用する追加教材として扱う |

上の中核／補足区分は教材設計上の提案で、教科書採用率を調査した結論ではない。追加の学習画面スイッチにはしない。

`[Sn(OH)3]-` は強アルカリ水溶液中の化学種として原著研究の裏づけがある。錯イオン採用・対応するNa塩の今回は除外という判断は妥当。ただし「単離化合物は存在しない」とは書かない。同研究は固体中の構造報告にも言及している。[Bajnócziら, Dalton Transactions (2014)](https://research.slu.se/en/publications/speciation-and-structure-of-tinii-in-hyper-alkaline-aqueous-solut/)

### 3.3 化合物38種の評価と根拠確認の範囲

| 添付の群 | 件数 | 教材評価・今回の根拠確認 |
|---|---:|---|
| 標準: Naアルミン酸、Na亜鉛酸、K鉄(II)/(III)酸、Au(III)/Pt(IV)の酸 | 6 | 高校で扱う反応・試薬とつながる採用候補。酸2種を塩と総称しない。水和数を問わない組成式問題に限定 |
| Agアンミンの硝酸塩・塩化物 | 2 | 規則適用教材に向く。塩化物のPubChem登録を確認。溶液中の組成表記と単離結晶の証拠は区別 |
| Cuアンミンの硫酸塩・硝酸塩 | 2 | 採用候補。硫酸塩は大学の実験資料で一水和物を確認。無水結晶を確認したとは扱わない。硝酸塩は原著研究の化合物記載を追加確認（後掲） |
| Znアンミン塩化物、K亜鉛酸 | 2 | Znアンミン塩化物は研究中の式を確認。K亜鉛酸はアルカリ電解液の組成表記として採用し、単離結晶とは説明しない |
| Fe(II)/(III)酸のNa塩・NH4塩 | 4 | 式練習として妥当。NH4鉄(II)酸は水和物の製品情報、Na鉄(II)/(III)酸とNH4鉄(III)酸はPubChem登録を確認 |
| AgシアニドNa/K塩 | 2 | 両塩を対象とした振動スペクトルの原著研究で組成を確認 |
| Niアンミン塩化物・硝酸塩 | 2 | 塩化物は和光製品、硝酸塩は三津和化学薬品の製品式を確認 |
| Coアンミン塩化物・硝酸塩・臭化物 | 3 | 対イオンによる係数の違いを練習できる。これらを扱う伝導度測定研究、硝酸塩メーカー情報を確認 |
| CuクロリドK/NH4塩 | 2 | 二水和物の結晶資料記載を確認。教材では水和を省いた組成式とし、離散した[CuCl4]2-だけからなる結晶構造とは説明しない |
| Au(I)クロリドK/Na塩 | 2 | **ユーザー指定により採用（発展・初期OFF）**。今回の調査でこの2塩の個別の実在根拠は未確認。錯陰イオンの実在と、裸のNa/Kを対イオンとするこの2塩の裏づけは別。クラウンエーテルでKを包んだ塩の論文を単純K塩の根拠に流用しない |
| Au(III)クロリドK/Na/NH4塩 | 3 | K/Na塩はメーカー情報（Na塩は水和物）、NH4塩はPubChem/CAS由来登録を確認 |
| Pt(II)クロリドK/Na/NH4塩 | 3 | 3種ともメーカー情報を確認。Na塩の参照製品は水和物 |
| Pt(IV)クロリドK/Na/NH4塩 | 3 | K塩のメーカー組成情報、Na/NH4塩の公的資料の組成を確認 |
| Sn(IV)ヒドロキシドNa/K塩 | 2 | Na塩の研究利用、K塩のメーカー製品資料を確認 |

公開前の根拠台帳には1件ずつID、URL、資料に載る化学種、溶液／結晶／水和物の別、教材で省略する内容を記す。検索不発だけで不存在としない。単なる式計算サイトや自動生成された商品説明を実在の証拠にしない。

水和物は「結晶水を含めない組成式を答える」と説明する。これはアクア錯体を新規採用することではない。結晶水と配位水を同一視しない。水和物の色を根拠なく無水塩のsolidColorへ転記しない。今回色は追加せず、根拠のない色データはnull。

### 3.4 学習とエンタメの両立

- 標準を入口、発展を任意追加にする方針は妥当。対イオンだけが違う大量の発展塩を初期ONにすると長い名前の反復に偏る。
- 出題は既存の公平抽選・最近出た項目の抑制を維持する。錯イオンONを「毎セット必ず錯イオンが出る」とは説明しない。一定数保証は追加要望として別設計にする。
- 錯イオンON時の名称入力には固定の語片ボタンを追加する案: ジ／トリ／テトラ／ヘキサ、アンミン／シアニド／クロリド／ヒドロキシド、酸、既存の酸化数・イオン。正解ごとに必要なボタンだけを出して答えを漏らさない。
- 新しい金属名は通常の日本語入力を利用する。長い入力欄は末尾・カーソルが見えるようにする。
- 誤答ヒントは電荷、配位子数、酸化数、角括弧の役割へ結びつける。旧名の場合は「このモードではシアニド表記を使います」等の具体的な案内にする。
- 酸化数・配位数だけを答える新ゲーム、中心イオン＋配位子からの生成問題、色当ては今回含めない。

## 4. 推奨する構成

比較した選択肢:

1. 既存JSONと巨大なapp.jsへ直接追加: 初期差分は小さいが、移植時にルールが二重化しやすい。
2. **推奨: 錯イオンの教材パック＋純粋な共通関数＋既存UIへのアダプター。** 現行の全抽選器を書き直さず、新しい規則だけ共有可能にする。
3. 今回両アプリをモノレポ／共通パッケージへ全面移行: 本アプリで試してから移植する順序に合わず、範囲が大きい。

共通ファイルは `data/complex-chemistry.json`、`js/chemistry/complex-policy.js`、`js/chemistry/formula-syntax.js`、`js/data-migrations.js`。DOM、localStorage、fetch、Date.now、ネットワークを純粋な化学関数へ入れない。

パックはschemaVersionとcontentVersionを持ち、ions/compounds配列に既存スキーマ互換のレコードを格納する。ロード時に既存教材と合成してから管理データの移行を適用する。IDは添付のものを維持する。添付の全55種を実行時パックへ入れる。金(I)の2塩の根拠確認状況は、採用可否やenabledとは別の調査記録として保持する。

錯イオンの追加属性例:

```json
{
  "id": "complex_cu_nh3_4",
  "formula": "[Cu(NH3)4]",
  "charge": 2,
  "name": "テトラアンミン銅(II)イオン",
  "type": "cation",
  "atomicity": "polyatomic",
  "requiresOxidationNumeral": true,
  "enabled": true,
  "ionQuestionEnabled": true,
  "chemistryClass": "complex",
  "curriculumLevel": "standard",
  "complex": {
    "centralElement": "Cu",
    "oxidationState": 2,
    "ligands": [{ "formula": "NH3", "charge": 0, "count": 4, "denticity": 1 }],
    "coordinationNumber": 4
  }
}
```

ここでのcoordinationNumberは登録された高校教材の表記上の値。Cuアンミンの実際の水溶液構造を完全に記述する目的ではない。将来配位数問題を追加するときは水和・配位水を再検討する。

化合物は既存cation/anion参照、formula、name、questionModesを使用し、同じchemistryClass/curriculumLevelを持たせる。正規式は明記し、自動組合せで錯塩を増やさない。参照イオンの酸化数別IDを維持し、`[Fe(CN)6]` の本体式だけをキーにしない。

## 5. 学習画面・抽選・保存の契約（機能方針確認済み）

- 難易度行の右端に「錯イオン」の独立トグル。aria-pressedまたはswitchのchecked状態を付け、色以外でもON/OFFを示す。
- 初回complexEnabled=false。既存やさしめ／ややむずのラジオは変更しない。320px幅でも横スクロール・文字切れ・タップ領域の重なりを起こさない。
- 標準／発展はcurriculumLevel。既存difficultyのnormal/hardへ置換しない。新項目のdifficultyは原則未指定（両難易度対象）。標準enabled=true、発展enabled=false。
- 出題候補は既存条件 AND（通常項目 OR complexEnabled）。化合物については、参照先に錯イオンがあれば自己タグが欠けても錯イオン対象と判定する。
- OFF時は苦手履歴・エンドレス継続・再挑戦からも錯イオンを除外する。ただし過去履歴は削除しない。過去結果の表示は可能。
- セッション開始時に設定を固定し、進行中の設定変更はその問題列へ反映しない。再挑戦は元の設定を保持する。
- 出題中・結果に「錯イオンあり」を併記する。既存のモード・難易度・式＆名情報を残す。
- enabledとionQuestionEnabledの現行意味を維持する。発展イオンを参照する化合物をONにする場合、参照先もenabledが必要。勝手に関連項目をONにせず、対象IDと修正方法を検証エラーで示す。
- 候補0件は開始不可として説明する。件数不足・重複の扱いは既存契約を維持し、無効教材を補充しない。

移行:

- 既存localStorageの全置換をやめるためだけの全面設計変更はしない。新規パックIDの明示的な追加移行を導入する。
- 移行前の元データを別キーへバックアップし、既存IDの編集値・無効化・削除を維持する。今回の新IDだけ一度追加する。
- migrationVersionを保存し、再読込でユーザーが削除した新IDを復活させない。ID衝突は上書きせず、開始前に解消可能なエラーとして示す。
- 旧Bundle Importでも同じ移行を通す。新版ExportにはschemaVersion/contentVersion/migrationVersionを保持する。
- ローカル保存失敗時は永続化成功と表示せず、既存保存値を破壊しない。リセットは公開教材へ戻す操作として維持し、学習履歴やパスワードを巻き込まない。

## 6. 化学式・名称入力と判定

- イオンの本体と電荷を分離し、既存の電荷専用キー由来チェックを維持する。
- 独立した角括弧キーは増設しない。既存 `(` キーはタップで `(`、上または下フリックで `[`。既存 `)` キーはタップで `)`、上または下フリックで `]`。1操作で1文字だけ挿入し、括弧の自動補完はしない。
- この括弧フリックは錯イオンON/OFFを問わず、式入力キーボードで常時有効。キーの配置・操作とイベント登録を固定し、設定変更によるイベント付替えや入力挙動の分岐を増やさない。これは設計上の簡素化であり、性能測定による速度改善の主張ではない。出題対象は従来どおりcomplexEnabledで制御し、OFFでも角括弧を入力できることと区別する。
- 上下の方向を覚える負担を避け、括弧キーだけは両方向で同じ角括弧にする。大文字／小文字の状態に依存させない。既存の文字キーの大小フリック規則は変更しない。
- 現行formula-keyboard-gesture.jsの距離18px・縦横比1.25という基準を共有する。移動距離18px未満はタップ、縦移動18px以上かつ縦成分が横成分の1.25倍以上なら上下ともフリック。それ以外の大きな移動はキャンセル。境界値をテストする。
- 現在文字キーだけを扱うPointer Events処理を、文字キーと括弧キーを識別できる形に最小限拡張する。数字キー等のクリック処理は維持する。括弧のpointerupで確定した後のブラウザ生成clickを重複処理しない。pointercancel／lostpointercapture／入力無効化は無入力で終了する。
- 括弧キーに小さな `↕ [` / `↕ ]` の補助表示を付け、アクセシブル名にも「タップで丸括弧、上下フリックで角括弧」を含める。補助表示のタップも同じキーとして扱う。キーボードフォーカス時のEnter／Spaceは丸括弧、Shift+Enter／Shift+Spaceは対応する角括弧とし、フリックなしでも入力できるようにする。後続clickの二重入力を防ぐ。
- `[]` のカーソル移動、1文字削除、クリアに対応。`()`と`[]`の入れ子をスタックで検証し、交差括弧・空括弧を拒否する。受理・表示・採点の規則も錯イオンON/OFFで切り替えず共通化する。
- 錯イオンが複数になる一般的な式生成で `[錯イオン]2` と表記できるようにし、`([錯イオン])2`を自動生成しない。NH4等の通常多原子イオンは従来どおり `(NH4)2`。
- 角括弧の省略や丸括弧との置換を正解にしない。大文字小文字を一律小文字化しない。
- 表示は本体の個数を下付き、chargeだけを上付き。名称の酸化数はローマ数字。全角ASCII互換文字・Unicodeローマ数字は既存NFKCで正規化する。
- 名称の酸化数は添付の正規名どおり必須。旧名や酸化数省略の自動許容はしない。アルミン酸のように添付で省略されている箇所に一律酸化数を足さない。
- H[AuCl4]等の名称ヒントは酸専用にする。既存の「陰イオン名＋陽イオン名」だけでは「酸水素」という誤学習を招くため、一般ヒントをそのまま流用しない。
- アクア・チオスルファト錯体は禁止。明示パックと検証で除外し、自動候補生成・Importを経由して収録しない。通常イオンの水素や酸素等まで文字列一致で除外しない。

## 7. 管理画面（機能方針確認済み）

### 簡易ロック

- 初期パスワードはユーザーが本チャットで指定した値。仕様書／URL／ログに複製しない。
- admin.htmlへ直接アクセスしても最初は認証フォームのみ表示し、編集操作を初期化しない。Enter送信、誤入力、キャンセル／学習画面へ戻るに対応。
- 解錠はページのメモリ内だけで保持し、再読込・画面を閉じると再入力。明示的な「ロック」ボタンを用意する。
- 「パスワード変更」で現在値・新値・新値確認を要求する。初期値も変更可能。大文字小文字を区別し、勝手なtrimをしない。変更成功後に再ロックする。
- 保存は教材とは別キー。平文保存せず、salt付きPBKDF2等で照合する。公開側の初期値照合データも別設定にする。Web Crypto／保存が使えなければ、変更成功と表示しない。
- これはブラウザ内の操作制限。JSONの秘匿・悪意ある編集者の排除・公開データの保護を保証しない。
- ブラウザ内変更は他端末へ同期しない。公開初期パスワードの変更は設定更新・再配布。端末での変更値は勝手に初期値へ戻さない。
- 忘れたときはパスワード用キーだけを消して初期値へ戻す運用をREADMEに説明する。教材・苦手履歴・全サイトデータの削除を回復手順にしない。

### 検索

- 検索対象ボタンは `id` `式` `名称`。単一選択、初期id。選択状態をaria-pressedで示す。
- idはidのみ、式はformula（イオンでは電荷込みの表示式も）、名称はnameのみ。JSON全体検索を廃止する。
- 式検索は下付き・上付き・全角の互換表記を正規化するが、大文字小文字を保持する。部分一致。名称も既存Unicode正規化＋部分一致。
- 空文字は全件。有効／無効フィルターとAND条件。タブ移動で検索語と選択を保持する。名称やURL等の別フィールドで偶然一致しない。
- 錯イオン／標準・発展の識別列を追加し、enabledを既存編集UIから変更可能にする。

## 8. Competition移植契約

今回Competitionのファイル・DB・公開サイトを変更しない。

- 移植単位は教材パック、純粋な正規化／括弧検証／対象判定関数、共通の入出力テストfixture、schema/contentVersion。
- JSONパックを単一原本とし、当面はバージョン固定のコピー＋ハッシュ照合でもよい。共有npmパッケージ化を今回の前提にしない。
- 将来settingsにcomplexEnabledを追加し、未指定=false。サーバーでboolean検証し、ルーム作成時に教材バージョンと共に固定する。
- 生成と正誤判定はサーバーを正本にする。クライアントから送られた正解・難易度・有効フラグを信用しない。
- 公開問題には現在どおり必要なpromptと入力フィールドのみ含める。内部の正解仕様を語片ボタン生成等のために配信しない。
- 出題順の公平性、即時／後から答え合わせ、再接続、結果表示、既存ルーム互換を移植時に確認する。
- 両アプリで同じfixtureから同じ正規化・判定・適格性が得られることを検証する。UIと抽選方式そのものを無理に共通化しない。

## 9. 実装時の受入条件

1. 錯イオンOFFで既存問題・保存値・履歴・出題順バランスが退行しない。
2. ONで登録済み有効錯イオン／化合物だけが出る。発展OFF、参照整合、苦手抽選、再挑戦を含む。
3. `[Ag(NH3)2]+`、`[Fe(CN)6]4-`、`K4[Fe(CN)6]`、`(NH4)2[PtCl6]`を入力・表示・判定できる。Fe(II)/(III)を区別する。
4. 欠けた角括弧、交差括弧、違う配位子数／酸化数／電荷、シアノ／クロロ／ヒドロキソ／アミンは不正解。Unicode互換表記は正解。
5. 全採用レコードに式・電荷・参照・命名・除外種・根拠情報のデータ検証を行う。金(I)の2塩を含む17＋38件のID・件数・初期ON/OFFを確認し、根拠未確認を確認済みと記録しない。
6. 初回移行・再移行・旧Import・編集／削除済みID・ID衝突・保存失敗を検証し、既存データを失わない。
7. 管理画面直アクセス、誤パスワード、変更、再ロック、リロード、教材リセットと認証設定の独立を確認する。
8. 検索対象の切替、式正規化、0件、全件、有効フィルター、検索後の編集行IDを検証する。
9. 括弧キーそれぞれについてタップ／上フリック／下フリック／横移動キャンセル／pointercancel／lostpointercapture／後続clickを確認する。錯イオンON/OFFと文字の大文字／小文字の全組合せで同じ結果になること、1操作1文字、文字キー・数字キーの非退行、Shift付きキーボード操作を検証する。
10. Playwright MCPで320px、iPhone相当幅、iPad、デスクトップの表示と操作、console・networkを確認する。長い名称、キーボード、式＆名、入力フォーカスを含む。
11. 実機SafariのOSキーボード表示とタッチ操作はブラウザ自動化と別に記録する。
12. 公開承認後にHTMLクエリ版、JS import、Service Worker APP_SHELL／cache名を同期し、新パックをオフラインキャッシュへ追加。GitHub MCPのCI/Pages状況と公開ページを別々に確認する。

## 10. 今回の調査証跡と限界

- GitHub MCP: 認証とKoiChem/IonicFormulaの参照成功。
- Playwright MCP: 接続成功、ローカル学習画面と管理画面の読込・現在の構成を確認。観測したconsoleエラー0、教材JSON3件は200。
- 未実装の新機能の画面・動作試験は行っていない。全自動テストの再実行、実機試験、公開操作は今回の対象外。
- 添付全55行の電荷整合はスクリプトで検証。化合物は資料に記載された組成・化学種と教材表記の対応を検討した。無水単離形態・結晶構造・色の全件確認はしていない。金(I)の2塩は個別根拠未確認だが、ユーザーの明示指定により採用へ変更した。

主な個別参照（全件を代表して保証するものではない）:

- Agアンミン塩化物の登録: https://pubchem.ncbi.nlm.nih.gov/compound/Diamminesilver-chloride
- Cuアンミン硫酸塩一水和物の大学実験資料: https://kingsborough.edu/academicdepartments/physci/documents/chemistry/CHM12_Experiment_9_Synthesis.pdf
- NH4鉄(II)酸水和物の製品情報: https://www.fishersci.fi/shop/products/ammonium-hexacyanoferrate-ii-hydrate-92-0-anhydrous-basis-rt-honeywell-fluka-2/15620910
- Coアンミンの塩化物・臭化物・硝酸塩を含む測定研究: https://avesis.istanbul.edu.tr/yayin/cb1c94ef-4323-4836-89da-6b9e9ff10231/conductometric-study-of-ion-association-of-hexaamminecobalt-iii-complexes-in-ethanol-plus-water
- K白金(IV)クロリド塩: https://www.sigmaaldrich.com/EE/en/product/aldrich/206067
- Naスズ(IV)ヒドロキシドの研究利用: https://www.rsc.org/suppdata/c7/qm/c7qm00395a/c7qm00395a1.pdf
- クラウンエーテルK・Au(I)クロリド塩の論文掲載号（単純K塩の根拠ではない）: https://journals.iucr.org/e/issues/2003/02/00/

追加調査で確認した組成・化学種の参照（名称の旧表記は教材正答へ取り込まない）:

| 対象 | 根拠 |
|---|---|
| Na[Al(OH)4] | [新居浜高専の反応式](https://www.sci.niihama-nct.ac.jp/PeriodicTable/elements/13.html) |
| Na2[Zn(OH)4] | [学校配布の高校化学教材](https://www.hiragaku.ac.jp/challenges/kakonokadai_515-529/pdf/5_15/5%E6%9C%8815%E6%97%A5%E9%85%8D%E4%BF%A13%E5%B9%B4%E9%80%B2%E5%AD%A6%E7%90%86%E7%B3%BB%E5%8C%96%E5%AD%A6%284%E7%B5%84%29.pdf) |
| K4[Fe(CN)6] / K3[Fe(CN)6] | [米国国際貿易委員会の化合物資料](https://www.usitc.gov/publications/safeguards/pub188.pdf) |
| H[AuCl4] | [和光の四水和物組成資料](https://labchem-wako.fujifilm.com/sds/W01W0108-0532JGHEEN.pdf) |
| H2[PtCl6] | [和光の六水和物製品](https://labchem-wako.fujifilm.com/jp/product/detail/W01W0116-0286.html) |
| [Ag(NH3)2]NO3 | [PubChem CID 62774](https://pubchem.ncbi.nlm.nih.gov/compound/62774) |
| [Cu(NH3)4](NO3)2 | [化合物を対象とした原著研究](https://www.tandfonline.com/doi/abs/10.1080/07370652.2022.2061089)（教材では式・名称のみ扱う） |
| [Zn(NH3)4]Cl2 | [MATECの原著研究中の式](https://www.matec-conferences.org/articles/matecconf/pdf/2021/15/matecconf_icmtmte2021_02008.pdf) |
| K2[Zn(OH)4] | [Lawrence Berkeley研究資料の電解液組成](https://escholarship.org/content/qt17n2v3k6/qt17n2v3k6.pdf)、[ECSのKOH中錯陰イオン報告](https://ecs.confex.com/ecs/228/webprogram/Paper57996.html) |
| Na4[Fe(CN)6] | [PubChem CID 26129](https://pubchem.ncbi.nlm.nih.gov/compound/Sodium-ferrocyanide) |
| Na3[Fe(CN)6] | [PubChem CID 159728](https://pubchem.ncbi.nlm.nih.gov/compound/Sodium-ferricyanide) |
| (NH4)3[Fe(CN)6] | [PubChem CID 161038](https://pubchem.ncbi.nlm.nih.gov/compound/Ammonium-ferricyanide) |
| K[Ag(CN)2] / Na[Ag(CN)2] | [両塩の振動スペクトル原著研究](https://www.sciencedirect.com/science/article/pii/0022286068800201) |
| [Ni(NH3)6]Cl2 | [和光製品](https://labchem-wako.fujifilm.com/jp/product/detail/W01SRM93-2823.html) |
| [Ni(NH3)6](NO3)2 | [三津和化学薬品の製品式](https://www.eonet.ne.jp/~mitsuwa-chem/EN/products/EN_N.html) |
| K2[CuCl4] / (NH4)2[CuCl4] | [二水和物の結晶資料を含むPubChem登録](https://pubchem.ncbi.nlm.nih.gov/compound/139036503) |
| K[AuCl4] | [Sigma-Aldrich製品資料](https://www.sigmaaldrich.com/sds/aldrich/450235) |
| Na[AuCl4] | [Sigma-Aldrich二水和物製品](https://www.sigmaaldrich.com/US/en/product/aldrich/298174) |
| NH4[AuCl4] | [PubChem CID 56845482 / CAS由来登録](https://pubchem.ncbi.nlm.nih.gov/compound/Ammonium-tetrachloroaurate) |
| K2[PtCl4] | [Sigma-Aldrich製品](https://www.sigmaaldrich.com/GB/en/product/aldrich/206075) |
| Na2[PtCl4] | [Sigma-Aldrich水和物製品](https://www.sigmaaldrich.com/US/en/product/aldrich/432857) |
| (NH4)2[PtCl4] | [Sigma-Aldrich製品](https://www.sigmaaldrich.com/US/en/substance/ammoniumtetrachloroplatinateii3729713820412) |
| Na2[PtCl6] / (NH4)2[PtCl6] | [IPCSの組成資料](https://www.inchem.org/documents/ehc/ehc125.htm) |
| K2[Sn(OH)6] | [TMG製品資料](https://www.tmg-chemicals.com.tw/en/pdf/e3-9.pdf) |

添付原文のID・式・名称一覧は同ディレクトリのCOMPLEX_IONS_USER_CATALOG.mdに保存する。原文は候補資料であり、本文の確定した採用範囲・出題形式・追加仕様を優先する。

## 実装補足

酸2種の陽イオン参照には、元教材にないH+を `supportIons` の `hydrogen` として追加した。単独イオン問題は `ionQuestionEnabled=false` で出題しない。既存H3O+のややむず限定条件は維持した。

実装のAPIと移植手順は `COMPLEX_IONS_PORTING.md`、55件の資料対応・水和などの留意点は `COMPLEX_IONS_EVIDENCE.md` を参照。
