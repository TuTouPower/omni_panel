# p233 在用量面板增加 Command Code 额度查询连接器与官方品牌图标

- 来源：用户提出，参考 `../my_file/server/relay/cc_proxy/quota.py`
- 内容：
    1. 在 `connectors/commandcode/` 新增连接器（`manifest.json` 与 `connector.ts`）：
        - 认证方式：Bearer Token（`user_...`，对应 `API_KEY`）
        - 上游端点：`https://api.commandcode.ai`
        - 采集字段：`/alpha/whoami`（用户信息）、`/alpha/billing/credits`（月度余额 `monthlyCredits`、5 小时窗口用量、周窗口用量与重置时间）、`/alpha/billing/subscriptions`（套餐 `planId`、账单周期结束时间）
        - 防御 Cloudflare 1010：请求头携带可用 User-Agent（如 `curl/8.7.1` 或 Chrome 标准 UA）
    2. 扩展 Schema 与服务列表：
        - 在 `src/shared/schemas/plugin-output.ts` 的 `usageProviderSchema` 中加入 `"commandcode"`
        - 在 `src/renderer/lib/common-services.ts` 的 `ADD_COMMON_SERVICES` 中加入 Command Code
    3. 替换官方品牌图标：
        - 从 `commandcode.ai` 官方资产下载并提取官方 `⌘` 徽标 SVG，置入 `src/renderer/assets/vendor_logos/commandcode.svg`
        - 更新 `src/renderer/components/Icon.tsx` 中的 `VENDOR_LOGOS` 与 `VENDOR_MARKS`，替换原有的临时终端窗口占位符
- 处理：t489
