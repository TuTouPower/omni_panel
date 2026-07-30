---
tid: t165
slug: agent_window_singleton
diff_anchor: "587f4477bfb5e3d406285d018aeb9b899a19cfca"
branch: t165_agent_window_singleton
---

# Task t165_agent_window_singleton

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- diff_anchor: 587f447（main，含 t162+t163）。
- round 1：单例逻辑内联 index.ts 闭包，无单测。code FAIL（index.ts 膨胀 997 行）、test FAIL（AC#4 要求单测，有 main-panel-controller FakeWindow 先例）。
- round 2：抽离 src/main/core/main-panel/agent-window-controller.ts（create_agent_window_controller，注入 create_window，open_or_focus/get_window/shutdown），index.ts 改注入式调用（净 -15 行）。参照 main_panel_controller.test.ts 写 6 单测。
- 黑盒：pnpm test 185/1894 全过（+1 文件 +6 测试）。
- 双审 round 2：code PASS / test PASS。

## Review 处置

### Round 1 (2026-07-30 23:00 UTC+8)

code FAIL（1 minor）、test FAIL（1 important）。

| finding_id     | severity  | status | rationale                                                                             | fix_ref                                                     |
| -------------- | --------- | ------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| t165_code_f001 | minor     | 已修   | index.ts 膨胀 997 行；抽离 agent-window-controller.ts 后 index.ts 净 -15 行，膨胀消除 | src/main/core/main-panel/agent-window-controller.ts（新增） |
| t165_test_f001 | important | 已修   | AC#4 要求单测未加；参照 main-panel-controller FakeWindow 注入式先例抽离模块 + 6 单测  | tests/unit/main/agent_window_controller.test.ts（新增）     |

### Round 2 (2026-07-30 23:08 UTC+8)

code PASS / test PASS，零 finding。

## 收尾报告

### 验收标准勾选

- [x] 连续多次触发 `tokenStats.open()` 只存在一个 agent BrowserWindow。
- [x] 已打开时再次触发 focus 已有窗口。
- [x] 关闭后引用清空，再次触发可新建。
- [x] 单测覆盖单例行为（6 测试：创建/复用/closed 重建/destroyed 不复用/shutdown/幂等）。

### Reviewer verdict

- Round 1 code：FAIL（f001 膨胀）→ Round 2
- Round 1 test：FAIL（f001 缺单测）→ Round 2
- Round 2 code：PASS
- Round 2 test：PASS

### 遗留

- 无

### 结果摘要

agent 窗口单例化落地。tokenStats.open() 复用已有窗口而非每次新建，避免多窗口叠加各持全量 records。抽离 agent-window-controller 模块（注入 create_window，参照 main-panel-controller 模式），index.ts 净减 15 行。6 单测覆盖单例生命周期。
