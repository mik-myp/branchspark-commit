import * as vscode from "vscode";
import {
  BRAND_NAME,
  PRODUCT_NAME,
  VIEW_CONTAINER_ID
} from "../constants";
import type {
  SaveAiConfigInput,
  SidebarActionMessage,
  SidebarMessage,
  SidebarState
} from "../types";

interface SidebarActions {
  getState(): Promise<SidebarState>;
  saveConfig(input: SaveAiConfigInput): Promise<void>;
  testConnection(): Promise<void>;
  generateCommitMessage(): Promise<void>;
  writeLastGeneratedMessage(): Promise<void>;
}

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private shouldFocusConfig = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly actions: SidebarActions
  ) {}

  async reveal(): Promise<void> {
    await vscode.commands.executeCommand(
      `workbench.view.extension.${VIEW_CONTAINER_ID}`
    );
  }

  async focusConfig(): Promise<void> {
    this.shouldFocusConfig = true;
    await this.reveal();
    await this.postFocusConfig();
  }

  async refresh(): Promise<void> {
    await this.postState();
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")]
    };
    view.webview.html = this.getHtml(view.webview);

    view.webview.onDidReceiveMessage(async (message: SidebarActionMessage) => {
      switch (message.type) {
        case "ready":
        case "refresh":
          await this.postState();
          break;
        case "saveConfig":
          if (message.payload) {
            await this.actions.saveConfig(message.payload);
          }
          break;
        case "testConnection":
          await this.actions.testConnection();
          break;
        case "generateCommitMessage":
          await this.actions.generateCommitMessage();
          break;
        case "writeLastGeneratedMessage":
          await this.actions.writeLastGeneratedMessage();
          break;
        default:
          break;
      }
    });

    void this.postState();
  }

  async showInfo(text: string): Promise<void> {
    await this.postMessage({ type: "info", text });
  }

  async showError(text: string): Promise<void> {
    await this.postMessage({ type: "error", text });
  }

  private async postState(): Promise<void> {
    const state = await this.actions.getState();
    await this.postMessage({ type: "state", state });
    if (this.shouldFocusConfig) {
      this.shouldFocusConfig = false;
      await this.postFocusConfig();
    }
  }

  private async postFocusConfig(): Promise<void> {
    await this.postMessage({ type: "focusConfig" });
  }

  private async postMessage(message: SidebarMessage): Promise<void> {
    if (!this.view) {
      return;
    }

    await this.view.webview.postMessage(message);
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "sidebar.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "sidebar.css")
    );
    const eyeOpenUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "eye-open.svg")
    );
    const eyeOffUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "eye-off.svg")
    );
    const nonce = createNonce();

    return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource};"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>${PRODUCT_NAME}</title>
  </head>
  <body>
    <div class="container config-only">
      <section class="card hero-card compact-hero">
        <div class="hero-badge">
          <span class="hero-badge-dot"></span>
          <span>${BRAND_NAME}</span>
        </div>
        <h1 class="hero-title">AI 配置</h1>
        <p class="hero-description">
          在这里管理 ${PRODUCT_NAME} 使用的 Base URL、API Key、模型与超时参数。
        </p>
      </section>

      <section class="card card-panel config-card">
        <form id="config-form" class="stack">
          <label class="field">
            <span>Base URL</span>
            <input id="base-url" name="baseUrl" type="url" required />
          </label>
          <label class="field">
            <span>API Key</span>
            <div class="password-field">
              <input id="api-key" name="apiKey" type="password" required />
              <button
                type="button"
                id="toggle-api-key"
                class="icon-button"
                aria-label="显示 API Key"
                title="显示 API Key"
              >
                <img
                  class="eye-asset eye-open"
                  src="${eyeOpenUri}"
                  alt=""
                  aria-hidden="true"
                />
                <img
                  class="eye-asset eye-off"
                  src="${eyeOffUri}"
                  alt=""
                  aria-hidden="true"
                />
              </button>
            </div>
          </label>
          <label class="field">
            <span>Model</span>
            <input id="model" name="model" type="text" required />
          </label>
          <label class="field">
            <span>Timeout (ms)</span>
            <input id="timeout-ms" name="timeoutMs" type="number" min="1000" step="1000" required />
          </label>
          <div class="meta meta-pill" id="api-key-status"></div>
          <div class="actions vertical-actions">
            <button type="submit" class="primary action-strong">保存配置</button>
            <button type="button" id="test-connection" class="secondary action-strong">测试连通性</button>
          </div>
        </form>
      </section>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}

function createNonce(): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let output = "";
  for (let index = 0; index < 32; index += 1) {
    const char = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    output += char;
  }
  return output;
}
