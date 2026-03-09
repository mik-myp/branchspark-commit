export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export interface AiConfigDraft {
  baseUrl: string;
  apiKeyValue: string;
  model: string;
  timeoutMs: number;
  hasApiKey: boolean;
}

export interface SaveAiConfigInput {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  apiKey?: string;
}

export interface CommitSuggestion {
  type: string;
  scope?: string;
  subject: string;
}

export interface GenerateCommitMessageInput {
  config: AiConfig;
  diff: string;
  changedFiles: string[];
}

export interface RepositorySummary {
  hasRepository: boolean;
  name?: string;
  rootPath?: string;
  stagedFiles: string[];
}

export interface SidebarState {
  config: AiConfigDraft;
  repository: RepositorySummary;
  lastGeneratedMessage?: string;
  canWriteLastMessage: boolean;
}

export interface SidebarMessage {
  type: "state" | "focusConfig" | "info" | "error";
  state?: SidebarState;
  text?: string;
}

export interface SidebarActionMessage {
  type:
    | "ready"
    | "refresh"
    | "saveConfig"
    | "testConnection"
    | "generateCommitMessage"
    | "writeLastGeneratedMessage";
  payload?: SaveAiConfigInput;
}
