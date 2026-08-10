# p021 e2e gen-synthetic 重生成会抹掉手工 synthetic fixture 条目（2026-08-01）

- 来源：t181 review f001 / test_f001
- 内容：t181 为让 6 处条件 skip 用例在 synthetic 下可跑，手工给 `synthetic.json` 注入 KIMI items `error`（HTTP 401）并补 opencode_go connector（2 workspace）。`gen_synthetic.mjs`（`e2e:gen-synthetic`）不产生这两类条目，重跑生成会静默覆盖，导致 account_error_badge / opencode_go_usage 在 CI 变红。
- 处理：已修（2026-08-02 手动修复，直接在 main）——gen_synthetic.mjs 固化注入 KIMI failed connector（items 带 error HTTP 401）+ opencode_go connector（2 workspace × rolling/weekly/monthly，窗口文案 滚动/一周/一月），重跑 e2e:gen-synthetic 不再覆盖。
