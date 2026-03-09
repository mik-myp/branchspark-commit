import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiCommitService,
  aiCommitInternals,
  formatConventionalCommit
} from "../src/services/aiCommitService";
import type { AiConfig } from "../src/types";

const config: AiConfig = {
  baseUrl: "https://example.com/v1",
  apiKey: "sk-test",
  model: "test-model",
  timeoutMs: 1_000
};

function createFetchResponse(content: string): Response {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        choices: [{ message: { content } }]
      })
  } as Response;
}

describe("AiCommitService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes conventional commit prefix in subject", () => {
    const suggestion = aiCommitInternals.parseCommitSuggestionResponse(
      JSON.stringify({
        type: "chore",
        subject: "feat: 支持自动生成 Git 提交信息"
      }),
      ["src/extension.ts"]
    );

    expect(formatConventionalCommit(suggestion)).toBe(
      "feat: 支持自动生成 Git 提交信息"
    );
  });

  it("limits subject length to 30 characters", () => {
    const suggestion = aiCommitInternals.parseCommitSuggestionResponse(
      JSON.stringify({
        type: "feat",
        scope: "sidebar",
        subject: "新增活动栏侧边栏并支持保存配置测试连通性和一键生成提交信息"
      }),
      ["src/views/sidebarViewProvider.ts"]
    );

    expect(Array.from(suggestion.subject).length).toBeLessThanOrEqual(30);
  });

  it("retries when first result is too generic", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        createFetchResponse(
          JSON.stringify({ type: "chore", subject: "更新代码变更" })
        )
      )
      .mockResolvedValueOnce(
        createFetchResponse(
          JSON.stringify({
            type: "feat",
            scope: "git",
            subject: "支持一键生成提交信息"
          })
        )
      );

    vi.stubGlobal("fetch", fetchMock);

    const service = new AiCommitService();
    const message = await service.generateCommitMessage({
      config,
      diff: "diff --git a/src/extension.ts b/src/extension.ts",
      changedFiles: ["src/extension.ts"]
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(message).toBe("feat(git): 支持一键生成提交信息");
  });

  it("falls back to heuristic message when response JSON is invalid", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createFetchResponse("not-json"))
      .mockResolvedValueOnce(createFetchResponse("still-not-json"));

    vi.stubGlobal("fetch", fetchMock);

    const service = new AiCommitService();
    const message = await service.generateCommitMessage({
      config,
      diff: "diff --git a/docs/readme.md b/docs/readme.md",
      changedFiles: ["docs/readme.md"]
    });

    expect(message).toBe("docs(docs): 更新文档说明与使用示例");
  });
});
