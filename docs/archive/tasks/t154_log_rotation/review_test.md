# Task review t154（reviewer_focus: 测试）

- task：`t154_log_rotation`
- spec：`docs\tasks\t154_log_rotation/spec.md`
- diff_anchor：`74d5d5750dba874399b4923ed2b277208cccb550`
- target：`git diff 74d5d5750dba874399b4923ed2b277208cccb550`
- round：1
- reviewed_at：2026-07-27 04:21 UTC+8

## Findings

### t154_test_f001 - 段数上限测试无法区分“停写”与“继续轮转”

- 严重度：important
- 位置：`tests/unit/main/logging.test.ts:103-118`（`"stops writing and warns when the segment limit is reached (t154)"`）
- 问题：该测试声称验证 AC“单日段数达上限后停写并打 warn”，但用于证明“停写”的证据过弱。(1) 行 117 使用 `expect(current_stat.size).toBeLessThan(50 * 1024 * 1024)` 作为停写证据，但测试注入的 `maxLogFileBytes` 只有 40 字节，单条 JSON 日志行约 160 字节；无论实现是停写还是继续写完全部 40 行，当前文件大小都远小于 50 MB，该阈值无法暴露未停写的 bug。(2) 测试仅断言 `.3.log` 存在，未断言不存在 `.4.log`、`.5.log` 等；若实现去掉 `return` 后继续轮转并仍然打印 warning，本测试仍会通过。
- 建议：将大小断言绑定到注入的 limit（例如 `<= maxLogFileBytes + 单条最大行长度`），或在触发上限后再追加若干行并断言当前文件大小不再增长；同时断言目录中不存在编号超过 `maxSegments` 的段文件。

## 结论

- 前轮 finding 复核（Round 2 才写）：无
- 本轮新发现：1 条
- 总体判断：段数上限停写的核心 AC 存在测试覆盖，但关键断言过弱，可能让“继续轮转却不停止”的 bug 漏过，测试不可信。

verdict: FAIL

## Round 2 (2026-07-27 04:28 UTC+8)

### 前轮 finding 复核

- **t154_test_f001**：已修。`tests/unit/main/logging.test.ts:130` 断言不存在 `app-<date>.3.log`，直接验证段数不超过 `maxSegments`；`tests/unit/main/logging.test.ts:136` 将当前活动文件大小上限绑定到注入的 `maxLogFileBytes`（40）加一个行缓冲（250），而非原来的 50 MB。若实现继续轮转或继续追加，上述断言会失败，因此原“无法区分停写与继续轮转”的问题已解决。

### 本轮新发现

无。

### 结论

- 前轮 finding 复核（Round 2）：t154_test_f001 已修。
- 本轮新发现：0 条。
- 总体判断：段数上限停写的核心 AC 测试证据已充分，未发现新的测试可信、覆盖或危险模式问题。

verdict: PASS
