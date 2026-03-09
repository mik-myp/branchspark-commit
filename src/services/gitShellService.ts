import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type GitCommandExecutor = (
  args: string[],
  cwd: string
) => Promise<CommandResult>;

export class GitShellError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitShellError";
  }
}

async function defaultExecutor(
  args: string[],
  cwd: string
): Promise<CommandResult> {
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      timeout: 15_000,
      maxBuffer: 5 * 1024 * 1024
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (error) {
    const errorWithCode = error as NodeJS.ErrnoException & {
      stderr?: string;
      stdout?: string;
    };

    if (errorWithCode.code === "ENOENT") {
      throw new GitShellError("未检测到 git 命令，请先安装 Git");
    }

    const stderr = errorWithCode.stderr?.trim() || "";
    if (stderr.includes("not a git repository")) {
      throw new GitShellError("当前目录不是 Git 仓库");
    }

    const message = stderr || errorWithCode.message || "执行 git 命令失败";
    throw new GitShellError(message);
  }
}

export class GitShellService {
  constructor(private readonly execute: GitCommandExecutor = defaultExecutor) {}

  async getStagedFiles(repoRoot: string): Promise<string[]> {
    const result = await this.execute(["diff", "--staged", "--name-only"], repoRoot);
    return result.stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  async getStagedDiff(repoRoot: string): Promise<string> {
    const result = await this.execute(["diff", "--staged"], repoRoot);
    return result.stdout;
  }
}
