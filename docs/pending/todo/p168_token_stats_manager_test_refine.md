# p168 token-stats manager 测试精化（末批重建断言/熔断状态可观察）

- 来源：t347 遗留（2026-08-13，t347_test_f001/f002/f003 minor）
- 内容：
    - f001：多批流程未显式断言末批 `rebuild_buckets=true`（批次测试隐含覆盖）。
    - f002：AC-003 熔断测试 fake timers 未用 try/finally 隔离（测试退出异常时污染全局 timer）。
    - f003：AC-003「状态可区分已停止与熔断」子句当前 `is_running()` API 不可观察（返回 boolean），需暴露「stopped vs tripped」区分状态。
- 处理：未开
