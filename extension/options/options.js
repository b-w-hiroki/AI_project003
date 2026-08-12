// 設定の読み書き。保存先は chrome.storage.local(この端末のみ。同期はしない)

const apiKeyInput = document.getElementById("apiKey");
const modelInput = document.getElementById("model");
const saveButton = document.getElementById("save");
const status = document.getElementById("status");

chrome.storage.local.get(["apiKey", "model"]).then(({ apiKey, model }) => {
  if (apiKey) apiKeyInput.value = apiKey;
  if (model) modelInput.value = model;
});

saveButton.addEventListener("click", async () => {
  const apiKey = apiKeyInput.value.trim();
  const model = modelInput.value.trim();

  await chrome.storage.local.set({ apiKey, model });

  status.textContent = apiKey ? "保存しました" : "保存しました(キーが空です)";
  setTimeout(() => {
    status.textContent = "";
  }, 2500);
});
