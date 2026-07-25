# Task review t111（reviewer_focus: 测试）

- task：`t111_config_fallback_p0_protection`
- spec：`docs\tasks\t111_config_fallback_p0_protection/spec.md`
- diff_anchor：`a85a965e34fd05c772d16ffc2bcca2b546be854e`
- target：`git diff a85a965e34fd05c772d16ffc2bcca2b546be854e`
- round：1
- reviewed_at：2026-07-25 23:07 UTC+8

## Findings

### t111_test_f001 - writeJsonAtomic 中断后无 null padding 的 AC 未被实际验证

- 严重度：important
- 位置：`tests/integration/config/config-store.test.ts:45-52`（`writeJsonAtomic writes exact content with no null padding and cleans up tmp`）
- 问题：spec 验收标准第 4 条要求「`writeJsonAtomic` 中断后无 null padding」，但当前测试只执行了一次正常写入并断言结果不含 `\0`。正常写入的合法 JSON 本来就不含 null 字节，该断言无法区分「修复后的 fsync 实现」与「修复前直接 writeFile+rename 的实现」——修复前的实现在成功完成一次写入时同样会通过此断言。测试既没有模拟 write 后、fsync/rename 前的进程中断，也没有验证 `open(tmpPath, 'r+')` / `handle.sync()` / `handle.close()` 在 `rename` 之前被调用，因此核心 AC（防强杀中断导致 null padding）实际上未被覆盖。
- 建议：补充对 `writeFileAtomic` 原子序列的验证。例如新增 unit test，mock `node:fs/promises` 的 `writeFile`、`open`、`rename`，断言 `open` 以 `r+` 模式打开 `.tmp` 文件、`handle.sync()` 与 `handle.close()` 在 `rename(tmpPath, filePath)` 之前被调用；或在集成测试中通过其他手段验证 tmp 文件在 rename 前已经 fsync 落盘。

## 结论

- 前轮 finding 复核（Round 2 才写）：无
- 本轮新发现：1 条（t111_test_f001）
- 总体判断：ENOENT/空文件/首次启动三条 AC 均有可信的集成测试覆盖，但 `writeJsonAtomic` 防强杀中断的核心 AC 仅被 happy-path 断言假装覆盖，实际未验证 fsync-before-rename 的时序，本轮不能 PASS。

verdict: FAIL

## Round 2 (2026-07-25 23:14 UTC+8)

- 当前轮次：2
- 前轮 finding 复核：
    - `t111_test_f001`：已修。新增 `tests/unit/core/storage/write-json.test.ts:13-69` 用 mock `node:fs/promises` 验证 `open(tmp, "r+")`、`handle.sync()`、`handle.close()` 均在 `rename` 之前调用；另 `tests/unit/core/storage/write-json.test.ts:71-95` 验证 `sync` 抛错时仍会关闭句柄且不会 `rename`。该 unit test 覆盖了 `writeJsonAtomic` 防强杀中断的核心时序，弥补了 Round 1 只有 happy-path 断言的不足。
- 本轮新发现：0 条
- 总体判断：全部 AC 已有可信测试覆盖，未发现新的危险模式、弱化断言或测试可信问题。

verdict: PASS
