import {
  COMMIT_DIFF_MAX_CHARS,
  MAX_COMMIT_SUBJECT_LENGTH
} from "../constants";
import type {
  CommitSuggestion,
  GenerateCommitMessageInput,
  AiConfig
} from "../types";

const ALLOWED_COMMIT_TYPES = new Set([
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert"
]);

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

interface ChatCompletionStreamResponse {
  choices?: Array<{
    delta?: {
      content?: string | null;
    };
  }>;
}

export class AiRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiRequestError";
  }
}

function createCommitSuggestion(
  type: string,
  subject: string,
  scope?: string
): CommitSuggestion {
  const suggestion: CommitSuggestion = {
    type,
    subject
  };

  if (scope) {
    suggestion.scope = scope;
  }

  return suggestion;
}

function normalizeSingleLineText(value: string, maxLength: number): string {
  const sanitized = value
    .replace(/\s+/gu, " ")
    .replace(/[。；;！？!?]+$/gu, "")
    .trim();

  const chars = Array.from(sanitized);
  if (chars.length <= maxLength) {
    return sanitized;
  }

  const truncated = chars.slice(0, maxLength).join("");
  return truncated.replace(/[，,、；;：:。.!？?]+$/gu, "").trim() || truncated.trim();
}

function unwrapCommitHeaderPrefix(input: string): CommitSuggestion {
  const trimmed = input.trim();
  const match = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\(([^)]+)\))?:\s*(.+)$/iu.exec(
    trimmed
  );

  if (!match) {
    return createCommitSuggestion("", trimmed);
  }

  const [, rawType = "", scope, rawSubject = trimmed] = match;
  return createCommitSuggestion(
    rawType.toLowerCase(),
    rawSubject.trim(),
    scope?.trim() || undefined
  );
}

function normalizeCommitSuggestion(
  input: Partial<CommitSuggestion> | undefined
): CommitSuggestion {
  const rawType = input?.type?.trim().toLowerCase() || "";
  const rawScope = input?.scope?.trim() || undefined;
  const rawSubject = input?.subject?.trim() || "待人工复核本次代码改动";
  const unwrapped = unwrapCommitHeaderPrefix(rawSubject);

  const type = [unwrapped.type, rawType, "chore"].find(
    (candidate): candidate is string =>
      Boolean(candidate) && ALLOWED_COMMIT_TYPES.has(candidate)
  ) ?? "chore";

  const scope = rawScope || unwrapped.scope;
  const subject = normalizeSingleLineText(
    unwrapped.subject || rawSubject,
    MAX_COMMIT_SUBJECT_LENGTH
  );

  return createCommitSuggestion(
    type,
    subject || "待人工复核本次代码改动",
    scope
  );
}

function formatChangedFilesForPrompt(changedFiles: string[]): string {
  if (changedFiles.length === 0) {
    return "- 无法识别变更文件";
  }

  return changedFiles.map((file) => `- ${file}`).join("\n");
}

function truncateDiffForPrompt(
  diff: string,
  maxChars: number,
  suffix: string
): string {
  const content = diff.trim();
  const chars = Array.from(content);
  if (chars.length <= maxChars) {
    return content;
  }

  return `${chars.slice(0, maxChars).join("")}\n${suffix}`;
}

function buildCommitSystemPrompt(): string {
  return [
    "你是发布工程中的提交信息生成助手。目标：生成可直接发布的中文 Conventional Commit。",
    "只允许输出合法 JSON 对象，不要输出 markdown、解释文本或代码块。",
    "你必须完整覆盖所有改动文件，不能遗漏关键模块；若改动很多，按功能域聚合描述。",
    "提交信息必须具体，不允许使用“同步代码改动/更新代码变更/优化代码逻辑”等空泛描述。",
    "JSON 字段与约束：",
    "type: feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert 之一。",
    "scope: 可选，建议填写最主要模块名。",
    `subject: 中文一句话，最多 ${String(MAX_COMMIT_SUBJECT_LENGTH)} 字，动宾结构；必须体现具体模块或能力点。`,
    "禁止编造不存在的改动，信息不足时写“待人工复核”。"
  ].join("\n");
}

function buildCommitUserPrompt(diff: string, changedFiles: string[]): string {
  return [
    "请基于以下 staged diff 生成一条可直接用于发布的提交信息。",
    "要求：完整总结全部变更文件，简洁具体，一句话概括。",
    "要求：subject 不得使用“同步代码改动/更新代码变更”等泛化表述。",
    `要求：subject 最多 ${String(MAX_COMMIT_SUBJECT_LENGTH)} 字。`,
    `变更文件（共 ${String(changedFiles.length)} 个）：`,
    formatChangedFilesForPrompt(changedFiles),
    "",
    truncateDiffForPrompt(
      diff,
      COMMIT_DIFF_MAX_CHARS,
      "[... diff 已截断，请优先确保提交信息覆盖全部变更文件并保持一句话总结 ...]"
    )
  ].join("\n");
}

function buildCommitRetryUserPrompt(
  diff: string,
  changedFiles: string[],
  previous: CommitSuggestion
): string {
  return [
    "上一版提交信息过于泛化，请重写并严格满足以下要求。",
    "1) subject 必须具体到模块或能力点，禁止“同步代码改动/更新代码变更/优化代码逻辑”类描述。",
    `2) subject 必须为一句话，最多 ${String(MAX_COMMIT_SUBJECT_LENGTH)} 字。`,
    "3) 仍需覆盖全部改动文件，不遗漏关键变更。",
    "",
    "上一版结果：",
    formatConventionalCommit(previous),
    "",
    `变更文件（共 ${String(changedFiles.length)} 个）：`,
    formatChangedFilesForPrompt(changedFiles),
    "",
    truncateDiffForPrompt(
      diff,
      COMMIT_DIFF_MAX_CHARS,
      "[... diff 已截断，请优先给出具体模块/能力点并覆盖全部文件 ...]"
    )
  ].join("\n");
}

function getCommonTopLevelDirectory(files: string[]): string | undefined {
  const roots = new Set(
    files
      .map((file) => file.split("/")[0]?.trim())
      .filter((segment): segment is string => Boolean(segment))
  );

  if (roots.size === 1) {
    return Array.from(roots)[0];
  }

  return undefined;
}

function inferScopeFromFiles(files: string[]): string | undefined {
  const commonRoot = getCommonTopLevelDirectory(files);
  if (commonRoot && /^[a-zA-Z0-9_-]+$/u.test(commonRoot)) {
    return commonRoot.toLowerCase();
  }

  if (files.length === 1) {
    const segments = files[0]?.split("/") ?? [];
    const lastSegment = segments[segments.length - 1]?.replace(/\.[^.]+$/u, "");
    if (lastSegment && /^[a-zA-Z0-9_-]+$/u.test(lastSegment)) {
      return lastSegment.toLowerCase();
    }
  }

  return undefined;
}

function inferCommitType(files: string[]): string {
  const normalized = files.map((file) => file.toLowerCase());

  if (normalized.length > 0 && normalized.every((file) => /(^|\/)(readme|docs?)(\/|\.|$)|\.md$/u.test(file))) {
    return "docs";
  }

  if (normalized.length > 0 && normalized.every((file) => /(^|\/)(test|tests|__tests__)(\/|$)|\.(spec|test)\.[^.]+$/u.test(file))) {
    return "test";
  }

  if (normalized.some((file) => /(^|\/)(\.github|ci|workflows)(\/|$)/u.test(file))) {
    return "ci";
  }

  if (normalized.some((file) => /(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|package\.json|tsconfig|eslint|prettier|vite\.config|vitest\.config)/u.test(file))) {
    return "chore";
  }

  return "chore";
}

function buildHeuristicCommitSuggestion(files: string[]): CommitSuggestion {
  const scope = inferScopeFromFiles(files);
  const type = inferCommitType(files);

  if (files.length === 0) {
    return createCommitSuggestion(type, "待人工复核本次代码改动", scope);
  }

  if (type === "docs") {
    return createCommitSuggestion(type, "更新文档说明与使用示例", scope);
  }

  if (type === "test") {
    return createCommitSuggestion(type, "补充测试覆盖关键变更", scope);
  }

  if (scope) {
    return createCommitSuggestion(
      type,
      normalizeSingleLineText(
        `更新${scope}相关实现`,
        MAX_COMMIT_SUBJECT_LENGTH
      ),
      scope
    );
  }

  return createCommitSuggestion(type, "待人工复核本次代码改动", scope);
}

function isCommitSuggestionTooGeneric(
  suggestion: CommitSuggestion,
  changedFiles: string[]
): boolean {
  const subject = suggestion.subject.trim();
  const genericPatterns = [
    /^同步代码改动$/u,
    /^更新代码变更$/u,
    /^同步\d+个文件改动$/u,
    /^同步文件改动$/u,
    /^更新项目文件$/u,
    /^(同步|更新|调整|优化)(代码|实现|逻辑|改动)$/u
  ];

  if (genericPatterns.some((pattern) => pattern.test(subject))) {
    return true;
  }

  if (Array.from(subject).length < 6) {
    return true;
  }

  if (changedFiles.length > 0 && subject.includes("待人工复核")) {
    return true;
  }

  return false;
}

function parseCommitSuggestionResponse(
  rawText: string,
  changedFiles: string[]
): CommitSuggestion {
  const fallback = buildHeuristicCommitSuggestion(changedFiles);

  try {
    const parsed = JSON.parse(rawText) as
      | Partial<CommitSuggestion>
      | { commitSuggestion?: Partial<CommitSuggestion> };

    const candidate: Partial<CommitSuggestion> | undefined =
      parsed && typeof parsed === "object" && "commitSuggestion" in parsed
        ? parsed.commitSuggestion
        : (parsed as Partial<CommitSuggestion>);

    return normalizeCommitSuggestion(candidate);
  } catch {
    return normalizeCommitSuggestion(fallback);
  }
}

function extractTextContent(content: ChatCompletionResponse["choices"]): string {
  const messageContent = content?.[0]?.message?.content;
  if (typeof messageContent === "string") {
    return messageContent;
  }

  if (Array.isArray(messageContent)) {
    return messageContent
      .map((item) => item.text?.trim() || "")
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

function extractStreamTextContent(rawText: string): string {
  const chunks: string[] = [];

  for (const rawLine of rawText.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) {
      continue;
    }

    const payload = line.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") {
      continue;
    }

    try {
      const parsed = JSON.parse(payload) as ChatCompletionStreamResponse;
      const content = parsed.choices?.[0]?.delta?.content;
      if (content) {
        chunks.push(content);
      }
    } catch {
      continue;
    }
  }

  return chunks.join("");
}

function extractChatCompletionText(
  rawText: string,
  contentType: string | null
): string {
  const normalizedContentType = contentType?.toLowerCase() || "";
  if (normalizedContentType.includes("text/event-stream")) {
    return extractStreamTextContent(rawText);
  }

  const parsed = JSON.parse(rawText) as ChatCompletionResponse;
  return extractTextContent(parsed.choices);
}

function shouldRetryWithStream(
  responseText: string,
  body: Record<string, unknown>
): boolean {
  if (body.stream === true) {
    return false;
  }

  return responseText.toLowerCase().includes("stream must be set to true");
}

async function sendChatCompletionRequest(
  config: AiConfig,
  body: Record<string, unknown>
): Promise<{ response: Response; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const baseUrl = config.baseUrl.replace(/\/+$/u, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const text = await response.text();
    return { response, text };
  } finally {
    clearTimeout(timer);
  }
}

async function createChatCompletion(
  config: AiConfig,
  body: Record<string, unknown>
): Promise<string> {
  try {
    let result = await sendChatCompletionRequest(config, body);

    if (!result.response.ok && shouldRetryWithStream(result.text, body)) {
      result = await sendChatCompletionRequest(config, {
        ...body,
        stream: true
      });
    }

    if (!result.response.ok) {
      const message =
        result.text.trim() || `HTTP ${String(result.response.status)}`;
      throw new AiRequestError(`AI 请求失败：${message}`);
    }

    return extractChatCompletionText(
      result.text,
      result.response.headers.get("content-type")
    );
  } catch (error) {
    if (error instanceof AiRequestError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new AiRequestError("AI 请求超时，请检查网络或增大超时时间");
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new AiRequestError(`AI 请求失败：${message}`);
  }
}

export function formatConventionalCommit(suggestion: CommitSuggestion): string {
  const scope = suggestion.scope ? `(${suggestion.scope})` : "";
  return `${suggestion.type}${scope}: ${suggestion.subject}`;
}

export class AiCommitService {
  async testConnection(config: AiConfig): Promise<string> {
    const content = await createChatCompletion(config, {
      model: config.model,
      temperature: 0,
      messages: [{ role: "user", content: "返回 ok" }]
    });

    return content.trim() || "ok";
  }

  async generateCommitMessage(
    input: GenerateCommitMessageInput
  ): Promise<string> {
    const runCommitSuggestion = async (
      prompt: string
    ): Promise<CommitSuggestion> => {
      const rawText = await createChatCompletion(input.config, {
        model: input.config.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildCommitSystemPrompt() },
          { role: "user", content: prompt }
        ]
      });

      return parseCommitSuggestionResponse(rawText, input.changedFiles);
    };

    let suggestion = await runCommitSuggestion(
      buildCommitUserPrompt(input.diff, input.changedFiles)
    );

    if (isCommitSuggestionTooGeneric(suggestion, input.changedFiles)) {
      suggestion = await runCommitSuggestion(
        buildCommitRetryUserPrompt(input.diff, input.changedFiles, suggestion)
      );
    }

    if (isCommitSuggestionTooGeneric(suggestion, input.changedFiles)) {
      suggestion = normalizeCommitSuggestion(
        buildHeuristicCommitSuggestion(input.changedFiles)
      );
    }

    return formatConventionalCommit(suggestion);
  }
}

export const aiCommitInternals = {
  buildHeuristicCommitSuggestion,
  isCommitSuggestionTooGeneric,
  normalizeCommitSuggestion,
  parseCommitSuggestionResponse
};
