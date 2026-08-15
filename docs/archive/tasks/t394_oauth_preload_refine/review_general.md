# Task review t394（reviewer_focus: 通用）

- task：`t394_oauth_preload_refine`
- spec：`docs/tasks/t394_oauth_preload_refine/spec.md`
- diff_anchor：`b1e015bc37409806233e36229e4c7459d35975a0`
- target：`git diff b1e015bc37409806233e36229e4c7459d35975a0`
- round：1
- reviewed_at：2026-08-15 09:38 UTC+8

## Findings

### t394_gen_f001 - 探针 JSDoc「只读快照」与实际语义不符（实时视图）

- 严重度：minor
- 锚点：契约区「文档/配置一致性：JSDoc/注释与代码一致」；AC-002 探针方案
- 位置：`src/main/core/auth/device_code_oauth_manager.ts:537`
- 问题：`__testing_retry_failure_counts` 的 JSDoc 写「读取 manager 实例内部 retry 计数（只读快照）」，但实现 `return __testing_retry_maps.get(manager) ?? new Map()` 返回的是内部 `Map` 的**实时引用**（以 `ReadonlyMap` 形态暴露），非调用时点的拷贝快照。两次调用拿到的仍是同一对象、随后续清理可见。当前 AC-002 三个断言每次调用都重新取引用，故行为正确、不构成测试缺陷，但注释与代码语义不一致（「快照」暗示不随内部变化）。
- 建议：注释改为「只读视图」/「实时只读引用」，或若确需快照语义则返回 `new Map(...)` 浅拷贝。

## 结论

- 本轮新发现：1 条（全部 minor）
- 未进表的提示：
  - `oauth_api.ts` 中 `GrokOAuthReturnTypes` / `KimiOAuthReturnTypes` 与基类 `OAuthApiReturnTypes` 重复声明 `login_cancel: undefined`、`logout: { logged_out: boolean }`（基类已含同型成员，继承即可）。纯冗余、无行为影响，属可读性取舍，不构成 finding。
  - 探针 `__testing_retry_maps` 为模块私有（未导出），仅导出 `__testing_retry_failure_counts`，未污染公开 API；`__testing_` 前缀符合 spec 允许的内部状态探针约定。
  - handoff 声称全量 3183 passed；本次复核仅跑了受影响三测试文件 + `tests/unit/preload` 全目录（39+27 通过）与 `tsc --noEmit`、改动文件 eslint（均零告警），未全量跑，但改动隔离清晰。
- 总体判断：5 条 AC 全部实现且各有真实测试触达，类型化重构正确、运行形态未变，探针方案满足「删除清理代码测试即失败」，仅 1 条 minor 文档措辞问题，PASS。
- 系统性 follow-up：无

verdict: PASS

reviewed_scope: 73313a4a3c707497
