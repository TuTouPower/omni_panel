# p224 会话查询过滤测试覆盖补强（t457 test review 三条 minor）

- 来源：t457 遗留（review_test.md Round 1 三条 minor，均不阻断）
- 内容：
    1. t457_test_f001：store 级 AC-004 组合用例补非空 `search` 与 `title`/`directory` 同时使用（现仅 IPC mock 层覆盖；store 的 `search` 与 `title`/`directory` 共用 LIKE 转义与参数绑定路径，参数名冲突类 bug 现有用例抓不到）。`tests/unit/main/core/token-stats/token-stats-store.test.ts` AC-004 用例加一行即可。
    2. t457_test_f002：AC-001「id 含 T 而 title 不含 → 不返回」无判别用例（夹具 id 为单字母）；store 夹具补一行 id 含 `alpha` 而 title/directory 不含的会话，或修正 AC-001 用例 523 行注释与夹具不符。
    3. t457_test_f003：桌面 IPC `tokenStats:sessions` 通道补「带 `title`/`directory` 的 filters 原样到达 `query_sessions`」断言（handler 纯透传，风险低；仿 `t389 AC-002` 用例）。`tests/unit/ipc/token-stats-ipc.test.ts`。
- 处理：未开（三条均 minor 不阻断；t458 UI 接入前顺手闭合，或随 t458 测试一并补）
