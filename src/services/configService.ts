import type * as vscode from "vscode";
import {
  COMPAT_EXTENSION_ID,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  EXTENSION_ID,
  SECRET_API_KEY
} from "../constants";
import type { AiConfig, AiConfigDraft, SaveAiConfigInput } from "../types";

export interface SecretStore {
  get(key: string): Promise<string | undefined>;
  store(key: string, value: string): Promise<void>;
}

export interface SettingsStore {
  get<T>(key: string): T | undefined;
  getCompat?<T>(key: string): T | undefined;
  update(key: string, value: unknown): Promise<void>;
}

type VscodeApi = typeof vscode;

export class MissingConfigError extends Error {
  constructor(message = "请先完成 AI 配置") {
    super(message);
    this.name = "MissingConfigError";
  }
}

export class ConfigService {
  constructor(
    private readonly settings: SettingsStore,
    private readonly secrets: SecretStore
  ) {}

  static fromExtensionContext(
    context: vscode.ExtensionContext,
    vscodeApi: VscodeApi
  ): ConfigService {
    const settings: SettingsStore = {
      get: <T>(key: string): T | undefined =>
        vscodeApi.workspace.getConfiguration(EXTENSION_ID).get<T>(key),
      getCompat: <T>(key: string): T | undefined =>
        vscodeApi.workspace.getConfiguration(COMPAT_EXTENSION_ID).get<T>(key),
      update: async (key: string, value: unknown): Promise<void> => {
        await vscodeApi.workspace
          .getConfiguration(EXTENSION_ID)
          .update(key, value, vscodeApi.ConfigurationTarget.Global);
      }
    };

    const secrets: SecretStore = {
      get: async (key: string): Promise<string | undefined> =>
        context.secrets.get(key),
      store: async (key: string, value: string): Promise<void> => {
        await context.secrets.store(key, value);
      }
    };

    return new ConfigService(settings, secrets);
  }

  async getDraft(): Promise<AiConfigDraft> {
    const apiKey = (await this.secrets.get(SECRET_API_KEY))?.trim() || "";
    const baseUrl =
      this.settings.get<string>("baseUrl")?.trim() ||
      this.settings.getCompat?.<string>("baseUrl")?.trim() ||
      DEFAULT_BASE_URL;
    const model =
      this.settings.get<string>("model")?.trim() ||
      this.settings.getCompat?.<string>("model")?.trim() ||
      "";
    const timeoutMs = this.normalizeTimeout(
      this.settings.get<number>("timeoutMs") ??
        this.settings.getCompat?.<number>("timeoutMs")
    );

    return {
      baseUrl,
      apiKeyValue: apiKey,
      model,
      timeoutMs,
      hasApiKey: Boolean(apiKey)
    };
  }

  async getResolvedConfig(): Promise<AiConfig> {
    const draft = await this.getDraft();
    const apiKey = draft.apiKeyValue;

    if (!draft.baseUrl.trim()) {
      throw new MissingConfigError("请先填写 Base URL");
    }

    if (!draft.model.trim()) {
      throw new MissingConfigError("请先填写模型名称");
    }

    if (!apiKey) {
      throw new MissingConfigError("请先填写 API Key");
    }

    return {
      baseUrl: draft.baseUrl,
      model: draft.model,
      timeoutMs: draft.timeoutMs,
      apiKey
    };
  }

  async saveConfig(input: SaveAiConfigInput): Promise<AiConfigDraft> {
    const baseUrl = input.baseUrl.trim();
    const model = input.model.trim();
    const timeoutMs = this.normalizeTimeout(input.timeoutMs);
    const nextApiKey = input.apiKey?.trim();

    if (!baseUrl) {
      throw new MissingConfigError("Base URL 不能为空");
    }

    if (!model) {
      throw new MissingConfigError("模型名称不能为空");
    }

    await this.settings.update("baseUrl", baseUrl);
    await this.settings.update("model", model);
    await this.settings.update("timeoutMs", timeoutMs);

    if (nextApiKey) {
      await this.secrets.store(SECRET_API_KEY, nextApiKey);
    }

    return this.getDraft();
  }

  private normalizeTimeout(value: number | undefined): number {
    if (!Number.isFinite(value) || !value || value <= 0) {
      return DEFAULT_TIMEOUT_MS;
    }

    return Math.trunc(value);
  }
}
