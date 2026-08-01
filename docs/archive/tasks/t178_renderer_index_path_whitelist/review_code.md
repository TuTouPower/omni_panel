# Task review t178（reviewer_focus: 代码）

- task：`t178_renderer_index_path_whitelist`
- spec：`docs/tasks/t178_renderer_index_path_whitelist/spec.md`
- diff_anchor：`60559e4e383f89cad4b60596ef6b86d84b912841`
- target：`git diff 60559e4e383f89cad4b60596ef6b86d84b912841`
- round：1
- reviewed_at：2026-08-01 12:20 UTC+8

## Findings

### t178_code_f001 - helpers.ts 两个拒绝分支重复抛出同一错误串

- 严重度：minor
- 锚点：代码质量（DRY），非 AC 违反
- 位置：`src/main/ipc/helpers.ts:39-47`
- 问题：未初始化分支（39-43）与 pathname 不匹配分支（44-47）抛出完全相同的 `Invalid file:// sender path: ${u.pathname}`，两处可合并为单一守卫：
    ```ts
    if (!renderer_index_pathname || u.pathname !== renderer_index_pathname) {
        throw new Error(`Invalid file:// sender path: ${u.pathname}`);
    }
    ```
    合并后语义等价（未初始化恒拒绝；已初始化仅精确比对通过），错误消息一致，行为不变。
- 建议：合并两个 `if` 为单一条件，删除重复 throw。

## 结论

- 前轮 finding 复核：Round 1，无。
- 本轮新发现：1 条（minor）。
- 未进表的提示：
    - **文件过大**：`tests/unit/ipc/config-ipc.test.ts` 1270 行（测试源码，≥1200 重要阈值），本 task 净增 +8 行（14 插入 / 6 删除）。按降级规则不进 finding 表；建议后续拆分。
    - **复杂度**：`assert_valid_sender` 手算 McCabe ≈ 8（<10），无提示。
    - **范围外观察（测试层，交 test reviewer）**：
        - `tests/unit/ipc/helpers.test.ts:200`「rejects file:// sender whose path is not index.html (I15)」——fallback 移除后该用例实际因 renderer path 未初始化（依赖 t067 describe 的 afterEach 置空）而被拒，不再是「路径非 index.html」语义；用例名与所验证行为脱节，与新增未初始化用例（40、159）冗余。建议显式设置 renderer path 后再验证 pathname 不匹配，或改用例名/删除。
        - `tests/unit/ipc/popup-ipc.test.ts:14` 与 `tests/unit/ipc/token-stats-ipc.test.ts:7` 顶层 `set_renderer_index_path` 调用冗余：beforeEach `vi.resetModules()` 丢弃该实例，测试实际只用到 beforeEach 内动态 import 后重新初始化产生的实例，顶层调用效果从未被读取。
        - `tests/unit/ipc/grok_auth_ipc.test.ts:7` 用假路径 `D:/Dev/Code/omni_panel/...`，与其它文件 `D:/app/...` 不一致；sender URL 自洽，功能无影响。
    - **全量测试 flaky（与本 task 无关）**：`pnpm test` 第一轮 187 files / 1963 passed / 1 skipped / 2 failed，失败集中在 `tests/integration/scheduler/refresh-service.test.ts:890`「retries failing non-session connector 3 times before marking failed」的 `attempt_logs toHaveLength(3)` 断言；单跑该文件 30/30 通过。第二轮全量 187 files / 1965 passed / 1 skipped 全绿，与 task.md 声称一致，确认首轮 2 个失败为时序敏感的 retry 日志断言在整包并发负载下的 flaky，非本 task 引入。该文件不 import helpers、不经 IPC sender 校验，与本 task diff 无依赖。建议按系统性 follow-up 处理。
- 总体判断：实现满足 AC1/AC2/AC3，范围与「非范围」约束符合，未改 main/index.ts；仅 1 条 minor，无未解决 critical/important。
- 系统性 follow-up：
    - 修复 `refresh-service` 集成 retry 测试 flaky（retry 日志断言时序敏感）。建议标题「修复 refresh-service 集成 retry 测试 flaky」，slug `fix_flaky_refresh_retry_log`，非阻断。
    - 拆分 `tests/unit/ipc/config-ipc.test.ts`（1270 行超重要阈值）。建议标题「拆分 config-ipc.test.ts」，slug `split_config_ipc_test`，非阻断。

verdict: PASS
