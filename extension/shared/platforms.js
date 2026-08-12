// プラットフォーム定義。content script はこの定義だけを頼りにDOMを触る。
//
// 【Phase 2 拡張ポイント】
// Note / LinkedIn 対応はこの配列にエントリを1つ足すだけでよい。
// 注入ロジック(content/x.js)はこのインターフェース経由でしかDOMに触れないため、
// セレクタとID抽出さえ正しければ他プラットフォームでもそのまま動く。
//
// インターフェース:
//   id            プラットフォーム識別子
//   matches(host) このプラットフォームのページか
//   postSelector      ポストのコンテナ要素
//   textSelector      本文要素(コンテナ内)
//   showMoreSelector  「さらに表示」相当(コンテナ内。無ければnull)
//   actionBarSelector ボタンを差し込むアクションバー(コンテナ内)
//   getPostId(post)   キャッシュキーになる安定ID。取れなければnull

const AIQ_PLATFORMS = [
  {
    id: "x",
    matches: (host) => host === "x.com" || host === "twitter.com",
    postSelector: 'article[data-testid="tweet"]',
    textSelector: 'div[data-testid="tweetText"]',
    showMoreSelector: '[data-testid="tweet-text-show-more-link"]',
    actionBarSelector: 'div[role="group"]',
    getPostId(post) {
      // ポスト内のパーマリンク(/user/status/123...)からIDを取る
      const link = post.querySelector('a[href*="/status/"]');
      if (!link) return null;
      const m = link.getAttribute("href").match(/\/status\/(\d+)/);
      return m ? m[1] : null;
    },
  },

  // 【Phase 2 拡張ポイント】例:
  // {
  //   id: "note",
  //   matches: (host) => host === "note.com",
  //   postSelector: "...",
  //   textSelector: "...",
  //   showMoreSelector: null,
  //   actionBarSelector: "...",
  //   getPostId(post) { ... },
  // },
];

function aiqCurrentPlatform() {
  const host = location.hostname;
  return AIQ_PLATFORMS.find((p) => p.matches(host)) || null;
}
