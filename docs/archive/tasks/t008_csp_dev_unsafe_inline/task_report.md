# Task report T008

本报告所在 commit 即 task commit，SHA 由 `git log --grep T008` 查，不在此记录。

## spec 验收标准勾选

- [x] dev 模式 `pnpm start` 后 renderer 正常渲染（非黑屏），stdout 无 `can't detect preamble`。 — **由黑盒验证承接**：`ELECTRON_ENABLE_LOGGING=true pnpm start` 抓 stdout，修复前 1 条 `Uncaught Error: @vitejs/plugin-react can't detect preamble`，修复后 0 条；`[vite] connected.` × 3 窗口、`%cDownload the React DevTools` 加载提示出现。（单测不覆盖运行时黑盒，见 review_test f003）
- [x] `build_csp_script_src(null)` === `"'self'"`（prod 不变）。 — 单测 `build_csp_script_src > prod is strict self only`。
- [x] `build_csp_script_src("http://localhost:5173")` 含 `'unsafe-inline'`。 — 单测 `build_csp_script_src > dev includes ... 'unsafe-inline'`。
- [x] `pnpm test` 全绿。 — 138 files / 1407 tests passed。

## adoption 处置摘要

- 已修 2 项 / 遗留 0 项 / 无需修改 1 项
- T008_test_f001 — 采纳：补 `build_csp_connect_src` / `build_csp_header` 的 `dev_host=null` 占位 '\*' 用例（防回退），已修
- T008_test_f002 — 不采纳：CSP 指令顺序无语义，`.toContain` 已锁定关键值，全串 `toBe` 性价比低
- T008_test_f003 — 采纳：task_report 验收清单第一条标注黑盒归属（本节已落实）
- review_code — 0 finding

## 遗留问题

- 无。GUI 视觉最终签收（rail/banner/sparkline 渲染）需用户点托盘确认；dev 黑屏根因（CSP preamble）已闭环。
