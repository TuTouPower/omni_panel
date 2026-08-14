# p154 OAuth 共享 manager 后续精化（preload 类型强化 + retry 清理测试触达）

- 来源：t339 遗留（2026-08-13，3 条 minor review finding 合并）
- 内容：
    - t339_code_f001：preload 共享工厂 `create_oauth_apis` 用 `invoke<unknown>` + 整体 `as` 强转，丢失 per-provider 返回类型（Grok/Kimi 的 LoginResult 等）编译期强制；对外类型与运行时不变。改进方向：channel 映射带类型化 invoke，去掉整体 as。
    - t339_test_f001：AC-002/003 的 `retry_failure_counts` 清理（logout/stop_auto_refresh/shutdown 三处）无测试触达——需 10 次连续非终态失败才可观察，删掉清理代码测试仍全绿。改进方向：注入小 MAX_REFRESH_RETRIES 或导出内部状态探针，断言清理副作用。
    - t339_test_f002：spec 测试策略声明 logout/stop/shutdown 三者 grok-kimi 同副作用断言，实际仅 logout 落实；stop/shutdown 靠共享实现结构性保证。
- 处理：未开
