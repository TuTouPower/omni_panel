# Task report T001

本报告所在 commit 即 task commit，SHA 由 `git log --grep T001` 查，不在此记录。

## spec 验收标准勾选

- [x] `pnpm test` 全绿（131 文件 / 1332 测试，含 `route_api.test.ts` 5 用例）
- [x] `preload/index.ts` route 相关无 `"popup"` / `"settings"` 残留（fallback `"usage"`、`case "setting"`）
- [x] `route_api.ts` 判定为 `route === "setting"`

## adoption 处置摘要

- 已修 2 项 / 遗留 1 项 / 无需修改 5 项（review_code 5 + review_test 3 = 8 finding）
- T001_test_f002 — test 描述 `"to settings"` → `"to setting"`
- T001_test_f003 — `it.each` 加 `agent`（VALID_ROUTES 之一）
- T001_test_f001 — 遗留：preload route switch 行为测试缺口
- T001_code_f001-f005 — 无需修改（info / 注释语义正确）

## 遗留问题

- preload route switch 行为测试缺口（T001_test_f001）：无直接测试验证设置窗走 `case "setting"` 拿 `config_full` + `saveSecrets`。建议开 T003 补 jsdom + contextBridge mock 行为测试。非阻塞，T001 核心修复经人工核验 + route_api 单测覆盖。
- `pnpm test` 偶现 1 flaky（长跑 integration 超时），重跑稳定；非本 task 引入。
