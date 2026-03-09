(function () {
  const vscode = acquireVsCodeApi();

  const elements = {
    form: document.getElementById("config-form"),
    baseUrl: document.getElementById("base-url"),
    apiKey: document.getElementById("api-key"),
    toggleApiKey: document.getElementById("toggle-api-key"),
    model: document.getElementById("model"),
    timeoutMs: document.getElementById("timeout-ms"),
    apiKeyStatus: document.getElementById("api-key-status"),
    testConnection: document.getElementById("test-connection")
  };

  function setApiKeyVisibility(visible) {
    elements.apiKey.type = visible ? "text" : "password";
    elements.toggleApiKey.dataset.visible = String(visible);
    elements.toggleApiKey.setAttribute(
      "aria-label",
      visible ? "隐藏 API Key" : "显示 API Key"
    );
    elements.toggleApiKey.setAttribute(
      "title",
      visible ? "隐藏 API Key" : "显示 API Key"
    );
    elements.toggleApiKey.classList.toggle("is-visible", visible);
  }

  function updateState(state) {
    if (!state) {
      return;
    }

    elements.baseUrl.value = state.config.baseUrl;
    elements.model.value = state.config.model;
    elements.timeoutMs.value = String(state.config.timeoutMs);
    elements.apiKey.value = state.config.apiKeyValue || "";
    setApiKeyVisibility(false);
    elements.apiKey.placeholder = state.config.hasApiKey
      ? "已保存 API Key"
      : "请输入 API Key";
    elements.apiKeyStatus.textContent = state.config.hasApiKey
      ? "已保存 API Key，默认以密文显示；点击眼睛图标可切换明文/密文"
      : "尚未保存 API Key";
  }

  function showToast(message, isError) {
    if (!message) {
      return;
    }

    const prefix = isError ? "[BranchSpark Commit] " : "";
    console[isError ? "error" : "info"](`${prefix}${message}`);
  }

  elements.form.addEventListener("submit", function (event) {
    event.preventDefault();

    vscode.postMessage({
      type: "saveConfig",
      payload: {
        baseUrl: elements.baseUrl.value,
        apiKey: elements.apiKey.value,
        model: elements.model.value,
        timeoutMs: Number(elements.timeoutMs.value)
      }
    });
  });

  elements.toggleApiKey.addEventListener("click", function () {
    const visible = elements.toggleApiKey.dataset.visible === "true";
    setApiKeyVisibility(!visible);
  });

  elements.testConnection.addEventListener("click", function () {
    vscode.postMessage({ type: "testConnection" });
  });

  window.addEventListener("message", function (event) {
    const message = event.data;
    if (!message || !message.type) {
      return;
    }

    if (message.type === "state") {
      updateState(message.state);
      return;
    }

    if (message.type === "focusConfig") {
      elements.baseUrl.focus();
      return;
    }

    if (message.type === "info") {
      showToast(message.text, false);
      return;
    }

    if (message.type === "error") {
      showToast(message.text, true);
    }
  });

  setApiKeyVisibility(false);
  vscode.postMessage({ type: "ready" });
}());
