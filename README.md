# BranchSpark Commit

一个独立的 VS Code 扩展项目：在活动栏中配置 OpenAI 兼容接口，并在源代码管理视图里一键生成 AI Git 提交信息，自动写入 VS Code 的 Git 提交输入框。

## 功能

- 活动栏侧边栏配置 `Base URL`、`API Key`、`Model`、`Timeout`
- 使用 VS Code `SecretStorage` 保存 `API Key`
- 在 SCM 顶部工具栏显示“一键生成提交信息”按钮
- 读取当前仓库 `staged diff`，通过 AI 生成中文 Conventional Commit
- 当 AI 返回结果过泛时自动重试；返回无效 JSON 时自动降级为本地启发式提交信息

## 开发

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

推荐在 VS Code 中按 `F5` 启动 Extension Development Host 调试。

## 使用

1. 打开活动栏中的 `BranchSpark`
2. 填写 OpenAI 兼容配置并保存
3. 在项目中执行 `git add ...`
4. 在源代码管理视图点击最左侧的 BranchSpark 生成按钮
5. 生成结果会自动写入 Git 提交输入框

## 当前范围

- 仅生成并写入提交框
- 不自动执行 `git commit`
- 不自动 `push`
- 不安装 Git hook
