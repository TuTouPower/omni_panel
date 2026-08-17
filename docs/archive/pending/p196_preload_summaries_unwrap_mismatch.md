# p196 preload sessionHistory.summaries 把 {summaries} 包装对象当键值 map 返回，桌面首条消息摘要恒空

- 现象：桌面 `sessionHistory.summaries` 把 `{summaries}` 包装对象当键值 map 返回，会话库首条消息摘要恒为空；web 正常（web 桥先解包 `data.summaries` 再返回）。
- 影响：桌面会话库每条会话的首条消息摘要恒显示空；web 与桌面行为不一致。
- 根因（产品缺陷）：main handler（`src/main/ipc/session-history-ipc.ts:336-338`）返回 `ok({ summaries })`，即 IPC data 为 `SessionHistorySummariesResponse = { summaries: Record<locKey, text> }`；preload `summaries()`（`src/preload/index.ts:272-275`）却用 `invoke<Readonly<Record<string, string>>>` 把整个 data 断言成 map；消费方（`src/renderer/components/session-library/SessionLibrary.tsx:304-305`）读 `result[key_of(s)] ?? ""` → 对包装对象取键恒 `undefined` → 恒 `""`。两侧 key 格式一致（`source|env|session_id`，session-library-utils.ts:24-26 / subscription-service.ts:170-172），错位仅在 preload 解包层。
- 测试缺口：`tests/unit/preload/` 无 summaries 形状测试，故未被拦截；应补 preload summaries 解包形状用例（断言对 `{summaries: {...}}` 包装按 key 取值）。
- 线索：docs/reviews/review_20260813_114911/review_intensive.md 第 12 行
- 来源：review_20260813_114911/review_intensive
- 处理：1ebfb619
