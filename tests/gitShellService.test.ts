import { describe, expect, it } from "vitest";
import {
    GitShellError,
    GitShellService,
    type GitCommandExecutor,
} from "../src/services/gitShellService";

describe("GitShellService", () => {
    it("parses staged files from git output", async () => {
        const executor: GitCommandExecutor = async () => ({
            stdout: "src/extension.ts\nREADME.md\n",
            stderr: "",
        });

        const service = new GitShellService(executor);
        await expect(service.getStagedFiles("/repo")).resolves.toEqual([
            "src/extension.ts",
            "README.md",
        ]);
    });

    it("returns staged diff content", async () => {
        const executor: GitCommandExecutor = async () => ({
            stdout: "diff --git a/file.ts b/file.ts",
            stderr: "",
        });

        const service = new GitShellService(executor);
        await expect(service.getStagedDiff("/repo")).resolves.toBe(
            "diff --git a/file.ts b/file.ts",
        );
    });

    it("propagates git errors from executor", async () => {
        const executor: GitCommandExecutor = async () => {
            throw new GitShellError("当前目录不是 Git 仓库");
        };

        const service = new GitShellService(executor);
        await expect(service.getStagedFiles("/repo")).rejects.toBeInstanceOf(
            GitShellError,
        );
    });
});
