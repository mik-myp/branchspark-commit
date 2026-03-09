import type * as vscode from "vscode";

export interface GitInputBox {
  value: string;
}

export interface GitRepositoryUiState {
  readonly selected: boolean;
}

export interface GitRepository {
  readonly rootUri: vscode.Uri;
  readonly inputBox: GitInputBox;
  readonly ui: GitRepositoryUiState;
}

export interface GitApi {
  readonly repositories: GitRepository[];
}

export interface GitExtension {
  readonly enabled: boolean;
  getAPI(version: 1): GitApi;
}
