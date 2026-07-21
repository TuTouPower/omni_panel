# Adoption T008

逐条处置 `review_code.md` 和 `review_test.md` 的 finding。流程见 AGENTS.md step 7。

| finding_id     | decision | rationale                                        | status   |
| -------------- | -------- | ------------------------------------------------ | -------- |
| T008_test_f001 | 采纳     | dev_host=null 占位 '\*' 分支未覆盖，防回退有缺口 | 已修     |
| T008_test_f002 | 不采纳   | CSP 指令顺序无语义；toContain 各片段已锁定关键值 | 无需修改 |
| T008_test_f003 | 采纳     | 验收标准 1 属运行时黑盒，task_report 注明归属    | 已修     |

## 处置说明

- **T008_test_f001（已修）**：`tests/unit/main/security/csp.test.ts` 补两用例：
    - `build_csp_connect_src("http://localhost:5173", null)` === `"'self' http://localhost:5173 ws://* wss://*"`（锁定 `dev_host ?? "*"` fallback）
    - `build_csp_header("http://localhost:5173", null)` 的 `toContain` 覆盖 `connect-src` 的 `ws://* wss://*` 片段
    - 触测试改动，重跑 `pnpm test` 黑盒（step 4）。
- **T008_test_f002（无需修改）**：CSP 指令顺序对浏览器语义无影响（各指令独立解析），`toContain` 已分别锁定 `script-src`/`style-src`/`connect-src` 关键值。全串 `toBe` 断言会把无害的指令重排标红，性价比低。
- **T008_test_f003（已修）**：仅文档改动，`task_report.md` 验收清单第一条标注"由黑盒 `pnpm start` + ELECTRON_ENABLE_LOGGING 验证"；2/3/4 标注单测覆盖位置。事实类文档改动，不触发重审。
- **review_code 0 finding**：无需处置。
