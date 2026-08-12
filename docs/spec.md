# SNS長文AI知見 要約拡張機能 — Spec & 実装ハンドオフ

> このファイルが実装の正。変更する場合はここを先に更新する。

## 概要
X（旧Twitter）上の長文AI知見ポストを検知し、3行要約＋要点箇条書きをインライン表示するChrome拡張（Manifest V3）。
Phase 1はX専用。Note/LinkedInはPhase 2以降でセレクタ追加により対応。

## ゴール
- 500字以上の長文ポストに「要約」ボタンを自動表示
- クリックでClaude APIにより要約を生成し、ポスト直下に折りたたみカードとして挿入
- 原文は隠さない（要約は補助であり代替ではない）

## ユーザーフロー
1. Xのタイムラインを閲覧
2. 長文ポスト（本文500字以上、または「さらに表示」付き）の右下に「⚡要約」ボタンが出現
3. クリック → ローディング表示（1〜3秒）→ 要約カード展開
4. カードは「3行要約」「要点（3〜5個）」「⚠️注意フラグ（任意）」の3ブロック構成
5. 再クリックで折りたたみ。同一ポストの要約はセッション内キャッシュ

## アーキテクチャ
```
content script (x.com)
  ├─ MutationObserverでタイムライン監視
  ├─ 本文抽出（data-testid="tweetText"）
  ├─ 文字数判定 → ボタン注入
  └─ chrome.runtime.sendMessage → background
background service worker
  ├─ Claude API呼び出し（fetch）
  ├─ レスポンス整形（JSON）
  └─ content scriptへ返却
options page
  └─ APIキー設定（chrome.storage.local保存）
```

## ファイル構成
```
/extension
  manifest.json
  /content
    x.js          # X専用セレクタ・注入ロジック
    styles.css    # 要約カードのスタイル
  /background
    worker.js     # API呼び出し
  /options
    options.html
    options.js
  /shared
    platforms.js  # プラットフォーム定義（Phase 2拡張ポイント)
```

## manifest.json 要点
- manifest_version: 3
- permissions: ["storage"]
- host_permissions: ["https://x.com/*", "https://api.anthropic.com/*"]
- content_scripts: matches ["https://x.com/*"], run_at "document_idle"

## 本文抽出（X）
- ポストコンテナ: `article[data-testid="tweet"]`
- 本文: `div[data-testid="tweetText"]`
- 「さらに表示」リンクがある場合: 詳細ページ遷移せず、表示範囲のテキストで要約し「※全文の一部から要約」と注記
- 文字数カウントはtextContentベース。500字未満はボタン非表示

## Claude API呼び出し
- endpoint: https://api.anthropic.com/v1/messages
- model: claude-sonnet-4-6（optionsで変更可能にしておく）
- max_tokens: 1000
- ヘッダー: x-api-key（ユーザー設定値）, anthropic-version, anthropic-dangerous-direct-browser-access: true
- レスポンスはJSONのみ返すようシステムプロンプトで強制

## 要約プロンプト（system）
```
あなたはSNS上のAI・ビジネス知見ポストを要約する編集者です。
以下のJSON形式のみで回答してください。前置き・コードブロック記法は禁止。

{
  "summary_3lines": ["1行目", "2行目", "3行目"],
  "key_points": ["要点1", ..., "要点5まで"],
  "caution": "内容が一般論の言い換え・根拠不明・宣伝目的の場合のみ短く指摘。問題なければnull"
}

要約方針:
- 具体的な手法・数値・固有名詞を優先して残す
- 抽象的な精神論は要点に含めない
- 「結局何が新しいのか」を1行目に置く
```

※`caution`フィールドが差別化ポイント。「やってるつもり」系の中身のない投稿を検知して注意喚起する。

## 要約カードUI
- ポストのaction bar直下に挿入
- 背景: 薄いグレー、角丸12px、左ボーダーでアクセント
- 構成: 「📝 3行要約」→ 箇条書き要点 → cautionがあれば黄色帯で表示
- ダークモード対応（prefers-color-scheme + Xのテーマ検知）

## エラーハンドリング
- APIキー未設定: ボタンクリック時にoptionsページへの誘導トースト
- API失敗: カード内にリトライボタン付きエラー表示
- レートリミット: 連打防止で同時リクエスト1件まで

## キャッシュ
- ポストID（URLから抽出）をキーにsessionStorage相当（Map in content script）で保持
- 永続化はPhase 1では不要

## Phase 2以降（今回は実装しない）
- Note / LinkedIn対応（platforms.jsにセレクタ定義を追加するだけで動く設計にしておく）
- 要約スタイルの切り替え（1文抽出モード等）
- 要約履歴のエクスポート

## 動作確認手順
1. chrome://extensions → デベロッパーモード → 「パッケージ化されていない拡張機能を読み込む」
2. optionsでAPIキー設定
3. x.comで長文ポストを開き、ボタン表示 → 要約生成を確認
4. ダークモード・エラー系（キー未設定、無効キー）を確認

## 実装依頼（Claude Code / Cursor向け）
上記spec通りにChrome拡張一式を実装してください。
- 外部ライブラリ不使用（vanilla JS）
- platforms.jsは将来のマルチプラットフォーム対応を見据えたインターフェースで
- コードにはPhase 2拡張ポイントをコメントで明示
