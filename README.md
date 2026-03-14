# ScoreManager

演奏用の PDF 楽譜を、本棚 UI と全画面リーダーで扱うブラウザアプリのプロトタイプです。

## できること

- フォルダ構成をそのまま本棚表示
- PDF の 1 ページ目サムネイル表示
- 単ページ / 見開き / スクロール表示
- 左右タッチゾーンとキーボードでのページ送り
- スクロールモード専用の自動スクロール
- 楽譜ごとの関連動画 URL を JSON に保存
- 現在カテゴリの復元

## 保存先

- 楽譜ごとのデータ: ルートフォルダ内の `.score-manager-data.json`
- 現在カテゴリなどの軽量状態: ブラウザの `localStorage`
- ルートフォルダ再接続用: ブラウザの `IndexedDB`

## 起動方法

```powershell
Set-Location "D:\My\Productions\AI\ScoreManager"
node server.js
```

ブラウザで `http://127.0.0.1:8123` を開いてください。

## 補足

- Chromium 系ブラウザが必要です
- ルートフォルダには読み書き権限が必要です
- `pdf.js` は CDN から読み込んでいます
- 詳細仕様は [docs/specification.md](./docs/specification.md) を参照してください
