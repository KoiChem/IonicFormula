# IonicFormula

日本の高校「化学基礎・化学」で扱うイオン式、イオン名、イオン結合性化合物の組成式・名称を学ぶ静的Webアプリです。陽イオンと陰イオンの電荷が打ち消し合う最簡整数比を考えることを中心にしています。

## 主な機能

- 「イオン」「化合物」の2種類のゲームと、化合物内の出題・解答形式切り替え
- 10問セット／重複のないエンドレス周回
- ノーマル／ハードの2難易度と、管理画面で変更できるカテゴリ比率
- スマートフォン向け化学式専用キーボード
- ヒント、パス、実際の出題形式別の苦手履歴
- Unicode正規化、IME変換中のEnter対策
- Fe(OH)3を生成・表示しない教材データ制約
- 酢酸塩の保存式と陽イオン先頭式の両方を明示的に正答登録
- パスワード簡易ロック、id／式／名称検索、ローカル編集、検証、JSON Import／Exportができる管理画面
- 初期OFFの錯イオントグル。錯イオン17種・化合物36種を通常問題に混ぜて練習
- シフトで丸括弧／角括弧の切替、やさしめ・錯イオンON時の固定名称語片ボタン
- 上部の効果音トグル、連続正解VFX、`prefers-reduced-motion`対応
- Li+、N3−、H3O+、リチウム塩・窒化物を含む教材データ
- ややむず限定イオン・化合物と、実在確認URLを保持できる教材データ
- ややむずの化合物比率は simple11：simpleRatio：polyatomic：variableOx = 0：1：5：4

## ローカル確認

`fetch()`でJSONを読むため、ファイルを直接開かずHTTPサーバーを使います。

```sh
python3 -m http.server 8000
```

その後、`http://localhost:8000/`を開きます。管理画面は`http://localhost:8000/admin.html`です。
SEの聴き比べは`http://localhost:8000/soundtest.html`です。iPhone実機で「Crisp Ion」「Pure Keyboard」「Puzzle Pop」を切り替えて試せます。

自動テストはNode.js 18以降で実行します。

```sh
node --test tests/*.test.mjs
```

## データ運用

公開データは次の4ファイルです。

- `data/ions.json`
- `data/compounds.json`
- `data/difficulty.json`
- `data/complex-chemistry.json`（錯イオンパック）

`admin.html`での編集はブラウザの`localStorage`にだけ保存され、GitHub上のファイルは変更しません。公開データを更新するときはJSON Export後に該当ファイルを置き換え、テストと管理画面のデータ検証を実行してください。

## GitHub Pages

すべてのURLはリポジトリ配下でも動く相対パスです。`main`へのpush時にGitHub ActionsがGitHub Pagesへデプロイします。

公開URL：<https://koichem.github.io/IonicFormula/>

スマホ向けパズル体験を調整した最新版を、公開URLに反映しています。

## ライセンス

MIT License。詳細は[LICENSE](LICENSE)を参照してください。

## 錯イオンと管理画面

標準は登録時ON、発展はOFFです。管理画面で各項目を有効化できます。化合物を有効にする場合は参照イオンも有効にしてください。錯塩の解答は結晶水を含めない組成式です。K/Naのジクロリド金(I)酸塩も採用していますが、個別の実在根拠は未確認として記録しています。

管理画面の解除状態はページ内だけで保持します。パスワード変更はそのブラウザ内のみです。教材のリセットはパスワードをリセットしません。忘れた場合は開発者ツールで `ionicFormula.adminPassword.v1` だけを削除して再読み込みすると初期パスワードに戻ります。教材・学習履歴のキーを削除する必要はありません。

旧ローカル教材は一度だけ移行し、元データを `ionicFormula.adminData.v2.preComplexBackup` に保存します。ID衝突や参照エラー時は保存内容を上書きせず、管理画面で修正を求めます。

- [実装仕様](docs/COMPLEX_IONS_SPEC_SOL_DRAFT.md)
- [教材の根拠台帳](docs/COMPLEX_IONS_EVIDENCE.md)
- [Competition移植ガイド](docs/COMPLEX_IONS_PORTING.md)

2026-10-02: 錯酸2件を教材から削除。旧保存・Importからも対象IDを除外し、その他の編集内容と履歴は維持します。
