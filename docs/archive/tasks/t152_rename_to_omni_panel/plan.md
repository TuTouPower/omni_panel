# Task plan

## 步骤与验证

01. 移动 `docs/reviews/` → `docs/archive/reviews/` → 验证：`ls docs/reviews` 为空或不存在；`ls docs/archive/reviews` 存在原内容
02. 批量替换非归档文件中的项目名引用：
    - `OmniUsage` → `OmniPanel`
    - `OmniUsageTest` → `OmniPanelTest`
    - `omni_usage` → `omni_panel`
    - `omniusage` → `omnipanel`
    - `OMNI_USAGE_PORT` → `OMNI_PANEL_PORT`
        → 验证：`grep -R "OmniUsage\|omni_usage\|OMNI_USAGE_PORT" --exclude-dir=docs/archive --exclude-dir=node_modules --exclude-dir=.git .` 无匹配
03. 更新 `package.json`、`electron-builder.yml`、`electron-builder.test.yml` 中的 name/appId/productName → 验证：读文件确认
04. 更新 README/AGENTS/blueprint/guides/specs 中的项目名、Release URL、路径约束 → 验证：grep 确认
05. 更新测试中断言文本、mock 插件名、打包产物路径、临时目录前缀、fixtures 绝对路径 → 验证：`pnpm test` 通过
06. 运行 `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` → 验证：全部通过
07. 双审：渲染 prompts，派发 code/test reviewer → 验证：处置表填满
08. 收尾：更新 `docs/specs/rename_to_omni_panel.md`、`docs/specs_index.md`、AGENTS.md；`scripts/task.py finish t152`
09. 提交本 task 全部改动
10. GitHub 远程：`gh repo rename omni_panel --repo TuTouPower/omni_usage` + `git remote set-url origin https://github.com/TuTouPower/omni_panel.git` → 验证：`git remote -v`
11. 本地目录重命名：`mv D:/Dev/Code/omni_usage D:/Dev/Code/omni_panel` → 验证：`ls D:/Dev/Code/omni_panel`

## 风险与回退

- 风险：批量替换误伤 archive 或其他不应改的文件。回退：替换时显式排除 `docs/archive/**`，操作前已提交基线，可随时 `git checkout` 恢复。
- 风险：`gh repo rename` 因授权失败。回退：只改本地 origin URL，提示用户手动在 GitHub 网页端改名。
- 风险：本地目录重命名后 session 内 cwd 失效。回退：这是预期最后一步；若需继续操作，用户在新目录重启会话即可。
- 风险：Electron 按 `productName` 改 userData 目录，旧数据不迁移。回退：在 README/AGENTS 中明确说明，不自动迁移。

## Finalization 时更新的 blueprint

- `AGENTS.md`：项目名、路径约束中的 `omni_usage` → `omni_panel`
- `docs/blueprint/architecture.md` / `domain.md` / `conventions.md` / `decisions.md`：项目名同步
- `docs/specs_index.md`：新增 `rename_to_omni_panel.md` 条目
