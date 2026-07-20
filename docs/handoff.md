# 项目交接记录

项目级交接放这里，不设 task 内交接。

追加式记录：交接者只新增段落，不删除或改写历史。接手者先读本文件，再按需下钻 task。

每段交接使用以下格式（以下为格式模板，不是真实记录）：

```markdown
## YYYY-MM-DD HH:MM UTC+8 from_owner → to_owner

- 当前焦点：{task ID 或议题}
- branch：`{branch；无则写“无”}`
- head_commit：`{已存在的 commit SHA；无则写“无”}`
- 已完成：{列点}
- 未完成：{列点}
- 陷阱：{已知坑或反直觉处}
- 下一步：{接手者首要行动}
```

## 2026-07-21 02:50 UTC+8 from claude → next

- 当前焦点：e2e 改造（T009-T013）+ 图标修复（T014 待办）
- branch：`main`
- head_commit：`a41cbad`（T012 specs/→electron/ + CI 引用同步）
- 已完成：
    - T009 `tests/user_e2e` → `tests/e2e` 改名
    - T010 web e2e 基建（mock local-api + 本机 fixture 录制 + chromium 驱动 out/web SPA，零桌面 app）
    - T011 迁 5 个可平移 spec 到 `tests/e2e/web/`（21 passed）
    - T012 `tests/e2e/specs/` → `tests/e2e/electron/`（Electron 专属，手动/nightly 跑）
    - CI 改：ci.yml 跑 `test:packaged`，nightly 跑 `test:e2e:electron`，web e2e 不进 CI
- 未完成：
    - T013 文档收尾（本 task，进行中）
    - T014 图标修复（`render_icon.mjs` 只产 .png，`assets/icon.ico` 陈旧显示 kimi；需扩产 .ico 重打包）
- 陷阱：
    - web e2e fixture（`tests/e2e/fixtures/data/responses.json`）gitignore，新机器/CI 无；需先启动 OmniUsage → `pnpm e2e:gen-data` 录制
    - `playwright.config.ts` `webServer` 顶层（非 project 级），跑 electron/packaged 时也启 vite preview（ADR 008 保留理由）
    - `vite.web.config.ts` import .mjs 需 `eslint.config.ts` `allowDefaultProject` + `ignores` 放行
    - T010 遗留 webServer 顶层污染 + CI fixture 策略已由 T013 + ADR 008 收口
- 下一步：
    - T013 收尾后做 T014（图标）：扩 `scripts/render_icon.mjs` 从 `assets/logo.svg` 产 `assets/icon.ico`（多尺寸 16/32/48/64/128/256），重打包验证 exe 图标
