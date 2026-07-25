# Task plan

## 步骤与验证

1. 红：在 connector 测试目录新增失败单测，fixture 覆盖 SSR `$R` 两种字段顺序、data-slot 格式、部分窗口缺失、负数值、双格式均失败走 fallback → 验证：按 `docs/guides/testing.md` 跑对应单测命令确认失败。
2. 绿：重构 `connectors/opencode_go/connector.ts`——抽出 HTML 解析（SSR 正则 + data-slot + 人类可读时间解析）、数值 clamp、错误 sanitize；主路径 `/auth` + `/go` 直解析，失败回退现有 server-fn 函数 → 验证：单测转绿。
3. 黑盒：`pnpm test` → 验证：全绿。
4. live 验证：用 `.scratch/cookie.txt`（用户提供的真实 SESSION_COOKIE，不入库）跑 connector live 契约，核对三窗口数值与网页一致 → 验证：输出数据与页面显示一致。cookie 由用户提供，非自设。

## 风险与回退

- 风险：线上页面在不同账号/灰度下不内联数据 → 已有 server-fn fallback 兜底，主路径失败自动降级。
- 风险：解析回归影响线上用户 → 单测覆盖双格式 + fallback；live 验证通过再收尾。
- 回退：connector.ts 单文件改动，`git checkout` 还原即可。

## Finalization 时更新的 blueprint

- `docs/blueprint/`：如 architecture.md / domain.md 中有 opencode_go 获取链路描述，同步为「HTML 直解析 + server-fn fallback」；无则写"无"。
- `docs/specs/opencode_go_html_scrape.md` 与 `docs/specs_index.md`：按收尾流程累积。
