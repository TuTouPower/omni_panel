# Task review t177（reviewer_focus: 测试）

- task：`t177_setupfiles_split_renderer`
- spec：`docs/tasks/t177_setupfiles_split_renderer/spec.md`
- diff_anchor：`d1bd8940ff6b05e1985e470c3b58396b234a2b4a`
- target：`git diff d1bd8940ff6b05e1985e470c3b58396b234a2b4a`
- round：1
- reviewed_at：2026-08-01 11:28 UTC+8

## Findings

### t177_test_f001 - renderer 项目缺对称回归测试（AC2 侧无专用 guard）

- 严重度：minor
- 锚点：AC2（renderer 类测试在 jsdom 环境运行，注入 renderer-only setupFiles）
- 位置：`vitest.config.mts:19-29`（renderer 项目）+ `tests/unit/main/node_env_isolation.test.ts`（AC1 guard，缺对应 AC2 guard）
- 问题：AC1 有专用回归测试（`typeof window === "undefined"` 锁定 node 项目环境），AC2 侧没有对称的回归测试直接断言 renderer 项目 jsdom 环境与 setupFiles 注入。若 renderer 项目配置回退（丢 jsdom 或丢 setupFiles），现有 renderer 测试会连锁失败（42 个 renderer 测试文件共 460 处依赖 `getMockApi` / `window.usageboard` / `toBeInTheDocument`，无 setup.ts 时全部报错），故隐式覆盖强、无静默假绿风险，非 blocking。仅为覆盖可更广的对称性建议。
- 建议：可选在 renderer 项目补一个轻量回归测试断言 `window.usageboard` 已注入且 `#root` 存在（如 `tests/unit/renderer/setup_env_isolation.test.ts`），与 node 侧 guard 形成对称；不改亦可，不阻断。

## 结论

- 前轮 finding 复核：Round 1，无
- 改测方向复核：无（diff 未修改任何既有测试，仅新增 1 个测试文件 + 改 vitest.config.mts 与两份文档）
- 本轮新发现：1 条（f001，minor）
- 未进表的提示：
    - `tests/unit/main/node_env_isolation.test.ts` 当前为 untracked 文件，实施 commit 必须 `git add` 纳入，否则 AC1 回归测试不随任务提交。
    - AC1 断言 `typeof window === "undefined"` 为环境依赖断言（jsdom 下为 `"object"` 会失败），非恒真断言；已验证单独运行于 node 项目通过（vitest v3.2.4，node 项目 1 passed）。
    - AC3 全量实测：`pnpm test` 186 files / 1963 passed / 1 skipped。其中 1 skipped 为既有条件跳过（`tests/unit/connector/opencode_go.test.ts:568` `it.skipIf(!existsSync(...))`，probe 文件缺失），非本次引入。
    - `pnpm test:coverage` 在 projects 拆分后实测 exit 0，阈值通过，coverage 未受拆分影响（非 AC 范围，顺带核验）。
    - 全部 186 个测试文件均落在 renderer 或 node 任一项目的 include 内，无孤儿文件；`tests/unit/*.test.ts` 顶层 6 个文件（metric_record_error / observation_mapping_error / observation_store_migration / paths / provider_usage_account_error / route_values）导入均为主进程 / shared 逻辑，无 window/document/react，node 环境下实测全绿。
    - 系统性 follow-up：无
- 总体判断：AC1 有专用回归测试且环境断言有效；AC2 由既有 renderer 测试强隐式覆盖；AC3 全量实测通过；无 critical / important，仅 1 条 minor。PASS。

verdict: PASS
