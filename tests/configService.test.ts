import { describe, expect, it } from "vitest";
import {
  ConfigService,
  MissingConfigError,
  type SecretStore,
  type SettingsStore
} from "../src/services/configService";

class MemorySettingsStore implements SettingsStore {
  private readonly data = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }
}

class MemorySecretStore implements SecretStore {
  private readonly data = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.data.get(key);
  }

  async store(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }
}

describe("ConfigService", () => {
  it("returns defaults when settings are empty", async () => {
    const service = new ConfigService(
      new MemorySettingsStore(),
      new MemorySecretStore()
    );

    const draft = await service.getDraft();

    expect(draft.baseUrl).toBe("https://api.openai.com/v1");
    expect(draft.apiKeyValue).toBe("");
    expect(draft.timeoutMs).toBe(30_000);
    expect(draft.hasApiKey).toBe(false);
  });

  it("saves config and resolves merged secret", async () => {
    const service = new ConfigService(
      new MemorySettingsStore(),
      new MemorySecretStore()
    );

    await service.saveConfig({
      baseUrl: "https://api.example.com/v1",
      apiKey: "secret-key",
      model: "gpt-test",
      timeoutMs: 12_000
    });

    const config = await service.getResolvedConfig();
    expect(config).toEqual({
      baseUrl: "https://api.example.com/v1",
      apiKey: "secret-key",
      model: "gpt-test",
      timeoutMs: 12_000
    });
  });

  it("exposes stored api key in draft for masked display", async () => {
    const service = new ConfigService(
      new MemorySettingsStore(),
      new MemorySecretStore()
    );

    await service.saveConfig({
      baseUrl: "https://api.example.com/v1",
      apiKey: "secret-key",
      model: "gpt-test",
      timeoutMs: 12_000
    });

    const draft = await service.getDraft();
    expect(draft.apiKeyValue).toBe("secret-key");
    expect(draft.hasApiKey).toBe(true);
  });

  it("keeps the existing secret when apiKey is omitted on save", async () => {
    const settings = new MemorySettingsStore();
    const secrets = new MemorySecretStore();
    const service = new ConfigService(settings, secrets);

    await service.saveConfig({
      baseUrl: "https://api.example.com/v1",
      apiKey: "secret-key",
      model: "gpt-test",
      timeoutMs: 5_000
    });

    await service.saveConfig({
      baseUrl: "https://api.example.com/v1",
      model: "gpt-test-2",
      timeoutMs: 8_000
    });

    const config = await service.getResolvedConfig();
    expect(config.apiKey).toBe("secret-key");
    expect(config.model).toBe("gpt-test-2");
  });

  it("throws when required config is missing", async () => {
    const service = new ConfigService(
      new MemorySettingsStore(),
      new MemorySecretStore()
    );

    await expect(service.getResolvedConfig()).rejects.toBeInstanceOf(
      MissingConfigError
    );
  });
});
