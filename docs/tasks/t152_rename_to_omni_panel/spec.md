# Task spec

## 背景

项目品牌由 `omni_usage` / `OmniUsage` 切换为 `omni_panel` / `OmniPanel`。需要一次性同步仓库名、本地目录、代码与文档中的全部项目名引用，避免新旧名称混用导致构建产物、路径、环境变量、用户数据目录不一致。

## 范围

- 仓库元数据：`package.json`、`electron-builder.yml`、`electron-builder.test.yml`
- 活跃文档：`README.md`、`AGENTS.md`、`CLAUDE.md`、`docs/handoff.md`、`docs/bugs.md`、`docs/specs_index.md`、`docs/blueprint/*.md`、`docs/guides/*.md`、`docs/specs/*.md`、当前 task 工作区文档
- 源码与测试：`src/`、`tests/` 中的项目名字符串、HTML title、CSS 注释、环境变量 `OMNI_PANEL_PORT`
- 脚本与工具配置：`scripts/`、`knip.json`、`.dependency-cruiser.cjs`、vite/playwright 配置等
- Git 远程：GitHub 仓库重命名 + 本地 origin URL 更新
- 本地目录：`D:/Dev/Code/omni_usage` → `D:/Dev/Code/omni_panel`
- 清理：将 `docs/reviews/` 整体移入 `docs/archive/reviews/`

## 非范围

- `docs/archive/**` 历史归档内容保持不变
- 已移入 `docs/archive/reviews/` 的审阅产物保持不变
- 历史 task 的 `docs/archive/tasks/**` 内容保持不变
- 不迁移旧 `%APPDATA%/OmniPanel` 用户数据到新目录（仅文档说明变更）

## 验收标准

- [ ] `docs/reviews/` 内容已移入 `docs/archive/reviews/`
- [ ] `package.json` / `electron-builder.yml` / `electron-builder.test.yml` 使用 `omni_panel` / `OmniPanel` / `OmniPanelTest`
- [ ] 代码与测试中不再出现 `OMNI_USAGE_PORT`（应为 `OMNI_PANEL_PORT`）
- [ ] 源码/测试/脚本中的产品名字符串已替换为 `OmniPanel`
- [ ] README/AGENTS/blueprint/guides/specs 等产品文档已同步
- [ ] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` 全部通过
- [ ] GitHub 仓库已重命名为 `omni_panel`，本地 origin URL 已更新
- [ ] 本地目录已重命名为 `D:/Dev/Code/omni_panel`

## 依赖与约束

- 需要 `gh` CLI 已登录且具有 `TuTouPower/omni_usage` 仓库管理权限，否则远程重命名步骤需用户手动处理
- 本地目录重命名必须在本 task 全部提交完成后执行，否则当前 session 工作目录会失效
