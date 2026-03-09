export const BRAND_NAME = "BranchSpark";
export const PRODUCT_NAME = "BranchSpark Commit";
export const EXTENSION_ID = "gitCommitByOpenAI";
export const COMPAT_EXTENSION_ID = "branchSparkCommit";
export const VIEW_CONTAINER_ID = "branchSparkCommit";
export const VIEW_ID = "branchSparkCommit.sidebar";
export const SECRET_API_KEY = "gitCommitByOpenAI.apiKey";

export const COMMANDS = {
  openSidebar: "branchSparkCommit.openSidebar",
  generateCommitMessage: "branchSparkCommit.generateCommitMessage",
  saveConfig: "branchSparkCommit.saveConfig",
  testConnection: "branchSparkCommit.testConnection",
  writeLastGeneratedMessage: "branchSparkCommit.writeLastGeneratedMessage",
  refreshSidebar: "branchSparkCommit.refreshSidebar"
} as const;

export const DEFAULT_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_COMMIT_SUBJECT_LENGTH = 30;
export const COMMIT_DIFF_MAX_CHARS = 16_000;
