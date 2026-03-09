import * as vscode from "vscode";
import type { GitApi, GitExtension, GitRepository } from "../types/vscode-git";

function isGitExtension(value: unknown): value is GitExtension {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GitExtension>;
  return typeof candidate.getAPI === "function";
}

export class GitExtensionService {
  async getApi(): Promise<GitApi | null> {
    const extension = vscode.extensions.getExtension("vscode.git");
    if (!extension) {
      return null;
    }

    const exportsValue = extension.isActive
      ? extension.exports
      : await extension.activate();

    if (!isGitExtension(exportsValue)) {
      return null;
    }

    return exportsValue.getAPI(1);
  }

  async getPreferredRepository(): Promise<GitRepository | null> {
    const api = await this.getApi();
    if (!api || api.repositories.length === 0) {
      return null;
    }

    return api.repositories.find((repository) => repository.ui.selected) ?? api.repositories[0] ?? null;
  }
}
