// Claude API呼び出し。APIキーはcontent scriptに渡さず、ここだけで扱う。

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1000;
const REQUEST_TIMEOUT_MS = 30000;

const SYSTEM_PROMPT = `あなたはSNS上のAI・ビジネス知見ポストを要約する編集者です。
以下のJSON形式のみで回答してください。前置き・コードブロック記法は禁止。

{
  "summary_3lines": ["1行目", "2行目", "3行目"],
  "key_points": ["要点1", "...", "要点5まで"],
  "caution": "内容が一般論の言い換え・根拠不明・宣伝目的の場合のみ短く指摘。問題なければnull"
}

要約方針:
- 具体的な手法・数値・固有名詞を優先して残す
- 抽象的な精神論は要点に含めない
- 「結局何が新しいのか」を1行目に置く`;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "AIQ_SUMMARIZE") {
    summarize(message.text)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) =>
        sendResponse({ ok: false, code: err.code || "API_ERROR", error: err.message })
      );
    return true; // 非同期でsendResponseする
  }
  if (message?.type === "AIQ_OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
  }
  return undefined;
});

async function summarize(text) {
  const { apiKey, model } = await chrome.storage.local.get(["apiKey", "model"]);
  if (!apiKey) {
    throw withCode(new Error("APIキーが未設定です"), "NO_KEY");
  }

  // タイムアウトを付けないと、APIがハングしたときに fetch が永遠に解決せず、
  // content script 側の同時実行ロック(inFlight)が外れなくなる。
  // その結果、そのタブの要約機能全体がリロードするまで死ぬ
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        // ブラウザから直接Anthropic APIを呼ぶために必要
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: text }],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw withCode(new Error("応答がありませんでした。時間をおいて再試行してください"), "TIMEOUT");
    }
    throw new Error("ネットワークエラー。接続を確認してください");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error?.message) detail = body.error.message;
    } catch {
      // 本文がJSONでない場合はHTTPステータスのまま
    }
    if (response.status === 401) detail = "APIキーが無効です。設定を確認してください";
    if (response.status === 429) detail = "レートリミットに達しました。少し待って再試行してください";
    throw new Error(detail);
  }

  const body = await response.json();
  const raw = body?.content?.[0]?.text ?? "";
  return parseSummary(raw);
}

// モデルにはJSONのみを要求しているが、コードフェンス等で包んでくる場合に備えて剥がす
function parseSummary(raw) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw withCode(new Error("要約の解析に失敗しました"), "PARSE_ERROR");
  }
  let data;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw withCode(new Error("要約の解析に失敗しました"), "PARSE_ERROR");
  }
  return {
    summary_3lines: asStringArray(data.summary_3lines, 3),
    key_points: asStringArray(data.key_points, 5),
    caution: typeof data.caution === "string" && data.caution.trim() ? data.caution : null,
  };
}

function asStringArray(value, max) {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === "string").slice(0, max);
}

function withCode(err, code) {
  err.code = code;
  return err;
}
