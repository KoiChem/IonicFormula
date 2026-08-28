# Ionic Formula

日本の高校「化学基礎・化学」で扱うイオン式、イオン名、イオン結合性化合物の組成式・名称を学ぶ静的Webアプリです。陽イオンと陰イオンの電荷が打ち消し合う最簡整数比を考えることを中心にしています。

## 主な機能

- 「イオン」「化合物」の2モードと、モード内で混在する出題タイプ
- 10問セット／重複のないエンドレス周回
- カテゴリ比率による3段階の難易度
- スマートフォン向け化学式専用キーボード
- ヒント、パス、モード・出題タイプ別の苦手履歴
- Unicode正規化、IME変換中のEnter対策
- Fe(OH)3を生成・表示しない教材データ制約
- 酢酸塩の保存式と陽イオン先頭式の両方を明示的に正答登録
- ローカル編集、検証、JSON Import／Exportができる管理画面
- 効果音・画面演出の個別設定と`prefers-reduced-motion`対応

## ローカル確認

`fetch()`でJSONを読むため、ファイルを直接開かずHTTPサーバーを使います。

```sh
python3 -m http.server 8000
```

その後、`http://localhost:8000/`を開きます。管理画面は`http://localhost:8000/admin.html`です。

自動テストはNode.js 18以降で実行します。

```sh
node --test tests/core.test.mjs
```

## データ運用

公開データは次の3ファイルです。

- `data/ions.json`
- `data/compounds.json`
- `data/difficulty.json`

`admin.html`での編集はブラウザの`localStorage`にだけ保存され、GitHub上のファイルは変更しません。公開データを更新するときはJSON Export後に該当ファイルを置き換え、テストと管理画面のデータ検証を実行してください。

## GitHub Pages

すべてのURLはリポジトリ配下でも動く相対パスです。`main`へのpush時にGitHub ActionsがGitHub Pagesへデプロイします。

公開URL：<https://koichem.github.io/IonicFormula/>

## ライセンス

MIT License。詳細は[LICENSE](LICENSE)を参照してください。
