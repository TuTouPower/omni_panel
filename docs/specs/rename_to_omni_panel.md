# 项目重命名 omni_usage → omni_panel

## 背景

项目品牌从 `omni_usage` / `OmniUsage` 切换为 `omni_panel` / `OmniPanel`。为避免仓库名、本地目录、构建产物、环境变量、用户数据目录、文档出现新旧名称混用，需要一次性全量替换。

## 范围

- 仓库元数据：`package.json` 的 `name`/`productName`，`electron-builder.yml` / `electron-builder.test.yml` 的 `appId`/`productName`。
- 代码字符串与标识：HTML `<title>`、托盘提示、关于页、UI 标题、CSS 注释、Windows 任务栏 `appId`、导出文件默认名、临时目录前缀。
- 环境变量：`OMNI_USAGE_PORT` → `OMNI_PANEL_PORT`。
- 活跃文档：`README.md`、`AGENTS.md`、`CLAUDE.md`、`docs/blueprint/*.md`、`docs/guides/*.md`、`docs/specs/*.md`、`docs/handoff.md`、`docs/bugs.md`。
- 测试：断言文本、mock 插件名、fixtures 中的绝对路径、打包产物路径、临时目录前缀。
- 脚本：`scripts/package-and-run.ts` 进程名、`scripts/start-test.mjs` 环境变量、文档注释。
- Git 远程：GitHub 仓库名与本地 `origin` URL 同步改为 `omni_panel`。
- 本地目录：`D:/Dev/Code/omni_usage` → `D:/Dev/Code/omni_panel`。
- 清理：将 `docs/reviews/` 整体移入 `docs/archive/reviews/`。

## 非范围

- `docs/archive/**` 历史归档内容保持不变。
- 已移入 `docs/archive/reviews/` 的审阅产物保持不变。
- 历史 task 的 `docs/archive/tasks/**` 内容保持不变。
- 不自动迁移旧 `%APPDATA%/OmniUsage` 用户数据到新目录。

## 验收标准

- `docs/reviews/` 内容已移入 `docs/archive/reviews/`。
- `package.json` / `electron-builder.yml` / `electron-builder.test.yml` 使用 `omni_panel` / `OmniPanel` / `OmniPanelTest`。
- 代码与测试中不再出现 `OMNI_USAGE_PORT`（应为 `OMNI_PANEL_PORT`）。
- 源码/测试/脚本中的产品名字符串已替换为 `OmniPanel`。
- README/AGENTS/blueprint/guides/specs 等产品文档已同步。
- `pnpm typecheck && pnpm lint && pnpm test` 全部通过。
- GitHub 仓库已重命名为 `omni_panel`，本地 origin URL 已更新。
- 本地目录已重命名为 `D:/Dev/Code/omni_panel`。

## 实现摘要

- 全量替换非归档文件中的 `OmniUsage` / `OmniUsageTest` / `omni_usage` / `omniusage` / `OMNI_USAGE_PORT` 为对应 `OmniPanel` / `OmniPanelTest` / `omni_panel` / `omnipanel` / `OMNI_PANEL_PORT`。
- 更新 Electron `productName` 后，userData 默认目录由 `%APPDATA%/OmniUsage` 变为 `%APPDATA%/OmniPanel`；README 与 AGENTS 中说明不自动迁移旧数据。
- 更新打包产物路径：Windows `OmniPanel.exe`、macOS `OmniPanel.app`、Linux `omni-panel`。

## 关联 task

- t152
