// タイムライン監視・ボタン注入・要約カード表示。
// DOMのセレクタは shared/platforms.js の定義経由でのみ参照する(Phase 2でのNote/LinkedIn対応のため)。

(() => {
  const platform = aiqCurrentPlatform();
  if (!platform) return;

  const MIN_CHARS = 500; // これ未満のポストにはボタンを出さない(spec: 500字以上)
  const PROCESSED = "aiqProcessed";

  // ポストID -> 要約結果。セッション内キャッシュ(spec: 永続化はPhase 1では不要)
  const cache = new Map();
  // 連打・多重呼び出し防止。同時リクエストは全体で1件まで
  let inFlight = false;

  // ---- スキャン ----------------------------------------------------------

  function scan() {
    for (const post of document.querySelectorAll(platform.postSelector)) {
      if (post.dataset[PROCESSED]) continue;

      const textEl = post.querySelector(platform.textSelector);
      if (!textEl) continue; // 画像のみ等。後で本文が入る可能性があるので未処理のまま残す

      post.dataset[PROCESSED] = "1";

      const text = textEl.textContent || "";
      const hasShowMore =
        platform.showMoreSelector !== null &&
        post.querySelector(platform.showMoreSelector) !== null;

      if (text.length < MIN_CHARS && !hasShowMore) continue;

      injectButton(post, textEl, hasShowMore);
    }
  }

  // MutationObserverは高頻度で発火するのでまとめて処理する
  let scanQueued = false;
  const observer = new MutationObserver(() => {
    if (scanQueued) return;
    scanQueued = true;
    setTimeout(() => {
      scanQueued = false;
      scan();
    }, 300);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  scan();

  // ---- ボタン ------------------------------------------------------------

  function injectButton(post, textEl, partial) {
    const bar = post.querySelector(platform.actionBarSelector);
    if (!bar) return;

    const btn = document.createElement("button");
    btn.className = "aiq-btn";
    btn.type = "button";
    btn.textContent = "⚡要約";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onButtonClick(post, textEl, btn, partial);
    });
    bar.appendChild(btn);
  }

  function onButtonClick(post, textEl, btn, partial) {
    const existing = post.querySelector(".aiq-card");
    if (existing) {
      // 再クリックで折りたたみ/展開
      existing.classList.toggle("aiq-collapsed");
      return;
    }

    const postId = platform.getPostId(post) || `text:${hash(textEl.textContent || "")}`;
    if (cache.has(postId)) {
      renderCard(post, cache.get(postId), partial);
      return;
    }

    if (inFlight) {
      toast("要約を生成中です。少し待ってからもう一度押してください。");
      return;
    }

    requestSummary(post, textEl, btn, partial, postId);
  }

  function requestSummary(post, textEl, btn, partial, postId) {
    inFlight = true;
    btn.disabled = true;
    btn.textContent = "…要約中";

    chrome.runtime.sendMessage(
      { type: "AIQ_SUMMARIZE", text: textEl.textContent || "" },
      (res) => {
        inFlight = false;
        btn.disabled = false;
        btn.textContent = "⚡要約";

        if (chrome.runtime.lastError || !res) {
          renderError(post, "拡張機能との通信に失敗しました。", () =>
            requestSummary(post, textEl, btn, partial, postId)
          );
          return;
        }
        if (!res.ok) {
          if (res.code === "NO_KEY") {
            toast("APIキーが未設定です。クリックして設定画面を開く", () =>
              chrome.runtime.sendMessage({ type: "AIQ_OPEN_OPTIONS" })
            );
            return;
          }
          renderError(post, res.error || "要約に失敗しました。", () =>
            requestSummary(post, textEl, btn, partial, postId)
          );
          return;
        }

        cache.set(postId, res.data);
        renderCard(post, res.data, partial);
      }
    );
  }

  // ---- カード ------------------------------------------------------------

  function cardContainer(post) {
    post.querySelectorAll(".aiq-card").forEach((el) => el.remove());
    const card = document.createElement("div");
    card.className = "aiq-card";
    // Xのテーマ検知を正とし、判定できたら明示クラスを付ける。
    // どちらも付かなかった場合のみCSS側の prefers-color-scheme が効く
    card.classList.add(isDarkTheme() ? "aiq-dark" : "aiq-light");

    // アクションバーの直下に挿入(spec)。バーが見つからなければポスト末尾
    const bar = post.querySelector(platform.actionBarSelector);
    if (bar && bar.parentElement) {
      bar.parentElement.insertBefore(card, bar.nextSibling);
    } else {
      post.appendChild(card);
    }
    return card;
  }

  function renderCard(post, data, partial) {
    const card = cardContainer(post);

    const title = el("div", "aiq-title", "📝 3行要約");
    card.appendChild(title);

    const lines = el("div", "aiq-lines");
    for (const line of (data.summary_3lines || []).slice(0, 3)) {
      lines.appendChild(el("p", "aiq-line", line));
    }
    card.appendChild(lines);

    const points = data.key_points || [];
    if (points.length) {
      card.appendChild(el("div", "aiq-subtitle", "要点"));
      const ul = document.createElement("ul");
      ul.className = "aiq-points";
      for (const p of points.slice(0, 5)) {
        const li = document.createElement("li");
        li.textContent = p;
        ul.appendChild(li);
      }
      card.appendChild(ul);
    }

    if (data.caution) {
      card.appendChild(el("div", "aiq-caution", `⚠️ ${data.caution}`));
    }

    if (partial) {
      card.appendChild(el("div", "aiq-note", "※全文の一部から要約"));
    }
  }

  function renderError(post, message, retry) {
    const card = cardContainer(post);
    card.appendChild(el("div", "aiq-error", message));
    const btn = document.createElement("button");
    btn.className = "aiq-retry";
    btn.type = "button";
    btn.textContent = "リトライ";
    btn.addEventListener("click", () => {
      card.remove();
      retry();
    });
    card.appendChild(btn);
  }

  // ---- 部品 --------------------------------------------------------------

  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function toast(message, onClick) {
    document.querySelectorAll(".aiq-toast").forEach((t) => t.remove());
    const t = el("div", "aiq-toast", message);
    if (onClick) {
      t.classList.add("aiq-toast-clickable");
      t.addEventListener("click", () => {
        onClick();
        t.remove();
      });
    }
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 6000);
  }

  function isDarkTheme() {
    // Xはbodyの背景色でテーマ判定できる。取れなければOS設定に従う(spec)
    const bg = getComputedStyle(document.body).backgroundColor;
    const m = bg && bg.match(/\d+/g);
    if (m && m.length >= 3) {
      const [r, g, b] = m.map(Number);
      return r + g + b < 300;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function hash(s) {
    // ID が取れないポストのキャッシュキー用の軽量ハッシュ
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return String(h);
  }
})();
