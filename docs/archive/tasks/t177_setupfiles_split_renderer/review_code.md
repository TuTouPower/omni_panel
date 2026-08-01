# Task review t177（reviewer_focus: 代码）

- task：`t177_setupfiles_split_renderer`
- spec：`docs/tasks/t177_setupfiles_split_renderer/spec.md`
- diff_anchor：`d1bd8940ff6b05e1985e470c3b58396b234a2b4a`
- target：`git diff d1bd8940ff6b05e1985e470c3b58396b234a2b4a`
- round：1
- reviewed_at：2026-08-01 11:31 UTC+8

## Findings

### t177_code_f001 - node 项目 include 白名单使新增测试目录静默不跑，root include 已成死配置

- 严重度：minor
- 锚点：范围「vitest.config.mts 拆分 environment 与 setupFiles」。拆分引入 `projects` 后，root 级 `include` 被两个项目各自的显式 `include` 完全覆盖，失去拆分前「自动收尽全部 tests 文件」的兜底作用。
- 位置：`vitest.config.mts:13`（root `include`，已失效）+ `vitest.config.mts:17-56`（两个项目的显式 include 白名单）
- 问题：实测全量收集恰好 186 文件、无重复无遗漏，且 renderer 文件没有进入 node 项目（否则 jsdom 依赖会失败），证明 root `include` 未参与收集、已死。后果：未来在 `tests/unit/` 下新增白名单之外的目录（如 `tests/unit/telemetry/`），其测试文件两个项目都不收集，`pnpm test` 仍绿——静默漏跑，产生假绿。拆分前 root glob 自动收尽，无此风险。当前无现存文件受影响（逐一核对了全部 186 个测试文件均命中某一项目白名单）。
- 建议：删除失效的 root `include` 以免误导；并在 `docs/blueprint/testing.md` 记录「新增测试目录必须登记到对应项目 include」，或加一个 CI 守卫校验 `tests/**` 中未命中任何项目 include 的文件（更稳）。属维护性风险，非当前功能缺陷。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 本轮新发现：1 条（minor）。
- 未进表的提示：
    - 文件过大：无。diff 仅触及 `vitest.config.mts`（75 行）与新增 8 行测试文件，均远低于 400 行阈值。
    - 复杂度：无。变更纯声明式配置，无业务函数可计。
    - 范围外观察：验证期间并发跑多个 coverage 进程共享 `coverage/` 目录会偶发 `ENOENT coverage/.tmp/coverage-*.json`（vitest 3.2.4 v8 覆盖率临时文件竞态）；单独跑 `pnpm test:coverage` 退出码 0、覆盖率报告正常。该 flake 在拆分前的旧配置下同样复现，非本 diff 引入，未出 finding。
- 总体判断：三个 AC 均已实现并经全量验证——`pnpm test` 186 files / 1963 passed / 1 skipped（exit 0）；node 项目 node 环境、无 setupFiles（AC1 guard 测试在旧全局 jsdom 配置下会失败，guard 有效）；renderer 项目 jsdom + setup.ts 覆盖 75 个渲染侧文件。仅 1 条 minor 维护性 finding，无未解决 critical / important。
- 系统性 follow-up：无（f001 若采纳「删除死 include + 登记约定」即可就地闭环，无需新 task）。

verdict: PASS
