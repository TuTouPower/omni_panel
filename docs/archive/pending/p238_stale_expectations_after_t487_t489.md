# p238 两处陈旧断言红：t487 改 WSL 源挂载、t489 新增 commandcode 后未同步测试

- 现象：`env -u NODE_ENV pnpm test` 全量（Node 24，p228 修复后首次可整跑）出 2 例固定失败：
    - `tests/unit/main/core/token-stats/collector-local.test.ts > collector on a non-Windows host (t308 AC-001) > t309: marks unreachable wsl sources unavailable on a non-Windows host`：断言 `wsl_statuses` 长度 5 且全部 `unavailable`，实测 `[]`（`expected [] to have a length of 5 but got +0`）。
    - `tests/unit/renderer/common_services.test.ts > add-account common services > includes every provider that can be added from settings`：期望 provider 列表缺 `commandcode`（`expected [ 'claude','codex',…(16) ] to deeply equal [ …(15) ]`）。
- 影响：`pnpm test` 全量仍有 2 例红，掩盖真实回归（与 p236 同类，只是换了任务来源）；两处断言均已不再描述当前产品行为。
- 根因：均为「完成态 task 改了行为但漏改对应测试期望」，非环境问题、非本仓库逻辑缺陷：
    - t487（`c7c46a05`）把 WSL 五源改为**仅 Windows 宿主挂载**（`collector.ts:418` 与 `set_collector_host` 的 `...(host === "windows" ? WSL_SOURCES : [])`），并在 `tests/unit/main/core/token-stats/collector.test.ts` 把同类断言从「5 条 unavailable」改为「0 条且无 wsl 报错」，但漏改 `collector-local.test.ts` 的同语义用例（该文件最后改动早于 t487）。
    - t489（`20b2f5b5`）新增 Command Code 连接器，`src/renderer/lib/common-services.ts:22` 加入 `{ id: "commandcode", label: "Command Code" }`，但 `tests/unit/renderer/common_services.test.ts` 的 `toEqual` 列表未同步（该文件最后改动在 t464/t465 时代）。
- 测试缺口：属测试自身陈旧，非覆盖缺口。修法（各一行）：`collector-local.test.ts` 改按 t487 语义断言（非 Windows 宿主不含任何 wsl 源条目、无 `unavailable: wsl data requires a windows host` 报错），`common_services.test.ts` 的期望列表补 `"commandcode"`（放在 `cpa` 之前，与实现顺序一致）。修完须重跑这两个文件，并复查是否还有第三处同类陈旧断言（本次全量跑仅这 2 例失败）。
- 线索：`env -u NODE_ENV npx vitest run --project node tests/unit/main/core/token-stats/collector-local.test.ts`；`env -u NODE_ENV npx vitest run --project renderer tests/unit/renderer/common_services.test.ts`（renderer 项目需 NODE_ENV=test 或非 production，见 d061）。发现现场见 p228 修复 commit `acaa20d8` 的验证输出。
- 处理：main-direct-fix
