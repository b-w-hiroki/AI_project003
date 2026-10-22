const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(require("node:path").join(__dirname, "../extension/background/worker.js"), "utf8");

function harness(provider, timer = setTimeout) {
  let listener;
  let providerCalls = 0;
  const chrome = {
    runtime: { id: "synthetic-extension", onMessage: { addListener(fn) { listener = fn; } }, openOptionsPage() {} },
    storage: { local: { async get() { return { apiKey: "synthetic-key" }; } } },
  };
  const fetch = async (url, options) => { providerCalls++; return provider(url, options); };
  vm.runInNewContext(source, { chrome, fetch, URL, AbortController, setTimeout: timer, clearTimeout });
  return {
    calls: () => providerCalls,
    send(message, sender) {
      return new Promise((resolve) => {
        const pending = listener(message, sender, resolve);
        if (pending !== true) resolve({ ignored: true });
      });
    },
  };
}

const trusted = { id: "synthetic-extension", url: "https://x.com/home", tab: { id: 1 } };
const response = { ok: true, async json() { return { content: [{ text: '{"summary_3lines":["one"],"key_points":[],"caution":null}' }] }; } };

test("rejects untrusted senders and invalid input before provider access", async () => {
  const app = harness(async () => response);
  for (const sender of [
    { id: "other", url: "https://x.com/home", tab: {} },
    { id: "synthetic-extension", url: "https://x.com.evil.example/", tab: {} },
    { id: "synthetic-extension", url: "https://evil.example/", tab: {} },
    { id: "synthetic-extension", url: "https://x.com/home" },
  ]) {
    assert.deepEqual(await app.send({ type: "AIQ_SUMMARIZE", text: "hello" }, sender), { ignored: true });
  }
  assert.equal((await app.send({ type: "AIQ_SUMMARIZE", text: "x".repeat(20001) }, trusted)).code, "INVALID_INPUT");
  assert.equal(app.calls(), 0);
  assert.equal((await app.send({ type: "AIQ_SUMMARIZE", text: "hello" }, trusted)).ok, true);
  assert.equal(app.calls(), 1);
});

test("deadline covers a stalled response body", async () => {
  const app = harness(async (_url, { signal }) => ({
    ok: true,
    json: () => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }),
  }), (cb) => setTimeout(cb, 0));
  const result = await app.send({ type: "AIQ_SUMMARIZE", text: "hello" }, trusted);
  assert.equal(result.code, "TIMEOUT");
  assert.equal(app.calls(), 1);
});
