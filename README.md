# IonicFormula

高校「化学基礎・化学」のイオン式・イオン名、イオン結合性化合物の組成式・名称を練習する静的Webアプリです。

公開URL：<https://koichem.github.io/IonicFormula/>

## 学習と出題設定

- イオン／化合物、やさしめ／ややむず、10問／エンドレス／苦手復習
- 化学式専用キーボード、ヒント・パス・苦手履歴、効果音
- 初期OFFの錯イオントグル。錯イオン17種・錯塩36種を収録
- 管理画面の一覧・難易度ボタン・割合設定を IonicFormulaCompetition から移植

管理画面は `admin.html` です。「割合／イオン／化合物」の3タブで、イオン46件・化合物194件の出題設定を調整できます。名称・化学式、難易度、通常／錯イオンで絞り込めます。

各項目の「やさしめ」「ややむず」ボタンを独立にON/OFFします。両方ONは両方の難易度、両方OFFは出題しません。イオン単独をOFFにしても、化合物の構成イオンとしては参照できます。イオン単独で出題しない19件は一覧から除外し、教材マスターには保持しています。

通常問題は初期状態で各項目を均等に抽選します。ややむずの通常1対1化合物は初期除外され、一覧で明示的に難易度を指定すると出題対象にできます。カスタムカテゴリ重み0の除外は項目の下にも表示します。

錯イオンON時は10問単位で割合を適用し、端数を切り上げます。初期値はやさしめ10%、ややむず20%（下限20%）。エンドレスも10問単位で配分し、直近出題の回避・公平な選択・苦手優先を継続します。候補不足の場合は別カテゴリや通常／錯体の指定を勝手に変えず、調整が必要な理由を表示します。

出題設定の正本はGitHubの `data/question-profile.json` です。管理画面のパスワード解除後に編集し、「GitHubへ保存」でFine-grained personal access tokenを入力します。対象リポジトリはKoiChem/IonicFormula、Repository permissionsのContentsはRead and write、適切な有効期限を指定してください。トークンはメモリ内でのみ使用し、入力欄は送信時・ダイアログを閉じる時に消去します。localStorage・sessionStorage・JSON・ログへ保存しません。

保存はmainのJSONをコミットして既存のPages公開を開始します。公開完了後、学習開始時に新しいJSONを読みます。競合時には上書きせず、画面の変更を保全して書き出し・再読み込みを案内します。旧端末内の出題設定は適用しませんが削除せず残し、学習履歴と管理パスワードは引き続き端末内に保存します。オフラインでは最後に配信されたJSONを使用します。コンペ側の本番DBとは同期しません。

## 教材データ

- `data/ions.json`：通常イオンの式・電荷・名称・出題制約
- `data/compounds.json`：通常化合物の構成参照・式・名称・許容別表記・出題形式
- `data/complex-chemistry.json`：錯イオンと錯塩、電荷・配位子の検証情報
- `data/question-profile.json`：出題対象の難易度指定と割合・カテゴリ重み
- `data/chemistry-metadata.json`：ID別の固体色・色注記・根拠URL・evidence・課程区分
- `data/difficulty.json`：従来方式のカテゴリ既定値と解答形式・苦手問題数

教材の追加・削除・式や名称の編集はJSONファイルで行います。管理画面は出題設定専用です。教材の `enabled` と `difficulty` は初期設定を作るための既定値で、保存した出題プロファイルが項目ごとの出題対象を管理します。電荷・構成イオン・許容式・出題形式制約は出題や採点に必要な内部情報として保持します。

酢酸塩の保存式と陽イオン先頭式をともに正答登録し、Fe(OH)3の式は教材制約により生成・表示しません。旧錯酸2件は旧Importからも除外します。金(I)のK/Na塩の実在根拠は未確認として補足JSONと根拠台帳に保持しています。

## 旧保存データの移行

旧 `ionicFormula.adminData.v2` と `ionicFormula.questionProfile.v1` は残しますが、自動適用・再移行しません。旧教材は「旧教材バックアップを書き出す」で原本を取り出せます。設定JSONのImportは検証後に画面の下書きへ取り込み、「GitHubへ保存」で共通設定に反映します。旧教材BundleのImportは元のJSONをダウンロードしてから出題設定だけを抽出します。「読み込み時の設定に戻す」は画面の変更を取り消すだけで、GitHub・学習履歴・パスワードを変更しません。

管理ロックの解除状態はページ内だけです。パスワード変更はそのブラウザ内のみで、出題設定のリセットでは変更されません。パスワードを忘れた場合は `ionicFormula.adminPassword.v1` だけを削除して再読み込みすると初期値に戻ります。

## ローカル確認・公開

JSONをfetchするのでHTTPサーバー経由で開きます。

```sh
python3 -m http.server 8000
node --test tests/*.test.mjs
```

`http://localhost:8000/` が学習画面、`http://localhost:8000/admin.html` が管理画面です。Node.js 18以降を使用します。すべてのURLは相対パスで、`main` へのpushにより既存のGitHub ActionsがGitHub Pagesへ公開します。

- [移植仕様](docs/superpowers/specs/2026-10-04-question-profile-port.md)
- [教材の根拠台帳](docs/COMPLEX_IONS_EVIDENCE.md)

MIT License。詳細は [LICENSE](LICENSE) を参照してください。
