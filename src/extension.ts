import * as path from "node:path";
import * as vscode from "vscode";
import { COMMANDS, EXTENSION_ID, VIEW_ID } from "./constants";
import { AiCommitService, AiRequestError } from "./services/aiCommitService";
import {
  ConfigService,
  MissingConfigError
} from "./services/configService";
import { GitExtensionService } from "./services/gitExtensionService";
import { GitShellError, GitShellService } from "./services/gitShellService";
import type { SidebarState, SaveAiConfigInput } from "./types";
import { SidebarViewProvider } from "./views/sidebarViewProvider";

class ExtensionController {
  private lastGeneratedMessage: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly gitExtensionService: GitExtensionService,
    private readonly gitShellService: GitShellService,
    private readonly aiCommitService: AiCommitService,
    private readonly sidebarViewProvider: SidebarViewProvider
  ) {}

  async getSidebarState(): Promise<SidebarState> {
    const config = await this.configService.getDraft();
    const repository = await this.getRepositorySummary();

    const state: SidebarState = {
      config,
      repository,
      canWriteLastMessage: Boolean(this.lastGeneratedMessage)
    };

    if (this.lastGeneratedMessage) {
      state.lastGeneratedMessage = this.lastGeneratedMessage;
    }

    return state;
  }

  async saveConfig(input: SaveAiConfigInput): Promise<void> {
    await this.configService.saveConfig(input);
    await this.sidebarViewProvider.refresh();
    await this.sidebarViewProvider.showInfo("AI 配置已保存");
    void vscode.window.showInformationMessage("AI 配置已保存");
  }

  async testConnection(): Promise<void> {
    try {
      const config = await this.configService.getResolvedConfig();
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "正在测试 AI 连通性..."
        },
        async () => this.aiCommitService.testConnection(config)
      );

      await this.sidebarViewProvider.showInfo(`AI 连通性正常：${result}`);
      void vscode.window.showInformationMessage(`AI 连通性正常：${result}`);
    } catch (error) {
      await this.handleOperationalError(error, true);
    } finally {
      await this.sidebarViewProvider.refresh();
    }
  }

  async generateCommitMessage(): Promise<void> {
    try {
      const repository = await this.gitExtensionService.getPreferredRepository();
      if (!repository) {
        throw new GitShellError("未检测到可用的 Git 仓库");
      }

      const repoRoot = repository.rootUri.fsPath;
      const changedFiles = await this.gitShellService.getStagedFiles(repoRoot);
      if (changedFiles.length === 0) {
        void vscode.window.showInformationMessage(
          "没有已暂存的文件，请先执行 git add 后再生成提交信息"
        );
        await this.sidebarViewProvider.showInfo(
          "没有已暂存的文件，请先执行 git add"
        );
        return;
      }

      const diff = await this.gitShellService.getStagedDiff(repoRoot);
      const config = await this.configService.getResolvedConfig();

      const message = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "正在生成 AI 提交信息..."
        },
        async () =>
          this.aiCommitService.generateCommitMessage({
            config,
            diff,
            changedFiles
          })
      );

      repository.inputBox.value = message;
      this.lastGeneratedMessage = message;

      await this.sidebarViewProvider.showInfo(
        "AI 提交信息已写入 Git 提交框"
      );
      void vscode.window.showInformationMessage(
        "AI 提交信息已写入 Git 提交框"
      );
    } catch (error) {
      await this.handleOperationalError(error, false);
    } finally {
      await this.sidebarViewProvider.refresh();
    }
  }

  async writeLastGeneratedMessage(): Promise<void> {
    if (!this.lastGeneratedMessage) {
      void vscode.window.showInformationMessage("还没有可写入的提交信息");
      return;
    }

    const repository = await this.gitExtensionService.getPreferredRepository();
    if (!repository) {
      void vscode.window.showWarningMessage("未检测到可用的 Git 仓库");
      return;
    }

    repository.inputBox.value = this.lastGeneratedMessage;
    await this.sidebarViewProvider.showInfo("已将上次结果重新写入 Git 提交框");
    void vscode.window.showInformationMessage("已将上次结果重新写入 Git 提交框");
    await this.sidebarViewProvider.refresh();
  }

  private async getRepositorySummary() {
    const repository = await this.gitExtensionService.getPreferredRepository();
    if (!repository) {
      return {
        hasRepository: false,
        stagedFiles: []
      };
    }

    try {
      const stagedFiles = await this.gitShellService.getStagedFiles(
        repository.rootUri.fsPath
      );
      return {
        hasRepository: true,
        name: path.basename(repository.rootUri.fsPath),
        rootPath: repository.rootUri.fsPath,
        stagedFiles
      };
    } catch {
      return {
        hasRepository: true,
        name: path.basename(repository.rootUri.fsPath),
        rootPath: repository.rootUri.fsPath,
        stagedFiles: []
      };
    }
  }

  private async handleOperationalError(
    error: unknown,
    isConnectionAction: boolean
  ): Promise<void> {
    if (error instanceof MissingConfigError) {
      await this.sidebarViewProvider.focusConfig();
      await this.sidebarViewProvider.showError(error.message);
      void vscode.window.showWarningMessage(error.message);
      return;
    }

    if (error instanceof AiRequestError) {
      const message = isConnectionAction
        ? error.message
        : `${error.message}，未覆盖现有提交框内容`;
      await this.sidebarViewProvider.showError(message);
      void vscode.window.showErrorMessage(message);
      return;
    }

    if (error instanceof GitShellError) {
      await this.sidebarViewProvider.showError(error.message);
      void vscode.window.showWarningMessage(error.message);
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    await this.sidebarViewProvider.showError(message);
    void vscode.window.showErrorMessage(message);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const configService = ConfigService.fromExtensionContext(context, vscode);
  const gitExtensionService = new GitExtensionService();
  const gitShellService = new GitShellService();
  const aiCommitService = new AiCommitService();

  const controllerRef: { current: ExtensionController | null } = {
    current: null
  };

  const sidebarViewProvider = new SidebarViewProvider(context.extensionUri, {
    getState: async () => getController(controllerRef).getSidebarState(),
    saveConfig: async (input) => getController(controllerRef).saveConfig(input),
    testConnection: async () => getController(controllerRef).testConnection(),
    generateCommitMessage: async () =>
      getController(controllerRef).generateCommitMessage(),
    writeLastGeneratedMessage: async () =>
      getController(controllerRef).writeLastGeneratedMessage()
  });

  const controller = new ExtensionController(
    configService,
    gitExtensionService,
    gitShellService,
    aiCommitService,
    sidebarViewProvider
  );
  controllerRef.current = controller;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      VIEW_ID,
      sidebarViewProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.openSidebar, async () => {
      await sidebarViewProvider.reveal();
      await sidebarViewProvider.refresh();
    }),
    vscode.commands.registerCommand(COMMANDS.generateCommitMessage, async () => {
      await controller.generateCommitMessage();
    }),
    vscode.commands.registerCommand(
      COMMANDS.saveConfig,
      async (input?: SaveAiConfigInput) => {
        if (!input) {
          await sidebarViewProvider.focusConfig();
          return;
        }

        await controller.saveConfig(input);
      }
    ),
    vscode.commands.registerCommand(COMMANDS.testConnection, async () => {
      await controller.testConnection();
    }),
    vscode.commands.registerCommand(
      COMMANDS.writeLastGeneratedMessage,
      async () => {
        await controller.writeLastGeneratedMessage();
      }
    ),
    vscode.commands.registerCommand(COMMANDS.refreshSidebar, async () => {
      await sidebarViewProvider.refresh();
    }),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration(EXTENSION_ID)) {
        await sidebarViewProvider.refresh();
      }
    })
  );
}

export function deactivate(): void {}

function getController(controllerRef: {
  current: ExtensionController | null;
}): ExtensionController {
  if (!controllerRef.current) {
    throw new Error("扩展控制器尚未初始化");
  }

  return controllerRef.current;
}
