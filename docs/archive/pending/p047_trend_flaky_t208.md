# p047 trend 相关注释订正与窗口选择器测试 flaky（t208 审阅范围外）

- 来源：t208 code/test review 未进表提示
- 内容：(1) `TrendApi.get` 注释「返回长度=days、缺失日期填 null」已过时（t208 改 ≤max_points 桶、不填充）；(2) `observation-store.ts` 接口前置 docstring 与 t208 补充段表述矛盾；(3) `provider_account_row.test.tsx` 窗口选择器「切回缓存」断言用 `setTimeout(50)` 负向等待，CI flaky 风险，宜改用 `waitFor` 配合「调用次数未变」或伪时钟。
- 处理：t220
