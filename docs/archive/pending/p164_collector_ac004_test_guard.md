# p164 AC-004 测试 mock 忽略 scan-state，re-emit 断言对回滚非必需

- 来源：t345 遗留（2026-08-13，t345_code_f007 minor）
- 内容：`collector.test.ts` AC-004 测试 mock_scan_jsonls 忽略 scan-state 参数（每轮恒返回同 2 条），re-emit 断言对「回滚是否必需」不敏感；唯一钉住机制的是副作用断言 jsonl_states.has===false。改进方向：用真实增量状态（第二轮返回 [] 模拟 state 已推进）验证「回滚 → 重扫 → 重发」闭环。
- 处理：t393
