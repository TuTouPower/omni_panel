# Task spec

## 背景

现有 `connectors/opencode_go/connector.ts` 获取用量的链路脆弱：`/auth` 跳转 → 抓页面 HTML → 下载最多 4 个 JS bundle → 正则找 `createServerReference` hash（含"距离最近"启发式兜底）→ 拼魔法序列化参数调 `/_server?id=` 私有 server function。每一环都可能随前端改版失效。

对照 `vendors/opencode-quota`（`src/lib/opencode-go.ts` 等）发现它只请求 `/workspace/<id>/go` 页面并直接解析内联数据。已实测验证（2026-07-25，真实 cookie，probe 脚本 `.scratch/probe-opencode-go.mjs`）：当前线上 `/go` HTML 同时内联 `$R[N]=` SSR hydration 与 `data-slot="usage-item"` 两种格式的用量数据，vendor 正则可解出 rolling/weekly/monthly 三个窗口，server-fn 链路非必需。

## 范围

- connector 改为「`/go` HTML 直解析为主路径，现有 server-fn 链路为 fallback」（HTML 两种格式都解析失败时才走旧链路）。
- 吸收 vendor 的解析健壮性：
    - SSR `$R` 格式两种字段顺序（usagePercent 前 / resetInSec 前）；
    - `data-slot` 格式解析，含人类可读 reset 时间（"6 days 2 hours"、"reset-now"）；
    - 部分窗口容错：任一窗口解析成功即返回，不要求三个全有；
    - 数值健壮：支持负数再 clamp 到 ≥0，全程 `Number.isFinite` 校验，不产出 NaN。
- 错误消息 sanitize：不带原始 HTML / cookie，去控制字符、压空白、截断长度。
- 单元测试：构造 HTML fixture 覆盖上述各路径（参考 `vendors/opencode-quota/tests/providers.opencode-go.test.ts` 的 fixture 思路）。

## 非范围

- vendor 的运行时工程化模式不照搬：config 四态状态机、TTL 缓存、in-flight 去重、多路径 auth.json 读取——那些是 opencode 插件常驻进程的概念，本项目 connector 是短生命周期脚本 + 宿主注入 `ctx.params`，不适用。
- 不改其他 connector，不动 `ScriptObservation` 契约与 manifest 参数（仍用 `SESSION_COOKIE`）。
- 不删除 server-fn 旧链路代码（降级为 fallback 保留）。

## 验收标准

- [ ] 主路径只请求 `/auth` + `/workspace/<id>/go` 两个页面即产出 rolling/weekly/monthly 的 observation；不下载 JS bundle、不调 `/_server`。
- [ ] SSR `$R` 格式两种字段顺序均可正确解析。
- [ ] `data-slot` 格式（含 "Resets in X days Y hours" 与 `reset-now`）可正确解析。
- [ ] SSR 与 data-slot 均解析失败时自动回退 server-fn 链路，产出与现状一致。
- [ ] 部分窗口缺失时返回已解析窗口的 observation，不整体 throw。
- [ ] 负数 / 非有限数输入被 clamp 或拒绝，observation 中不出现 NaN / 负数用量。
- [ ] 错误消息经 sanitize，不含原始 HTML 与 cookie，长度受限。
- [ ] 新增单元测试覆盖上述路径，`pnpm test` 通过。
- [ ] 用真实 cookie live 验证：主路径产出的三窗口数据与页面显示一致。

## 依赖与约束

- live 验证需要用户提供有效 `SESSION_COOKIE`（密钥由用户提供，不自设）。
- 日志与错误输出遵守项目脱敏硬约束。
- 参考实现只读：`vendors/opencode-quota/src/lib/opencode-go.ts`、`vendors/opencode-quota/src/providers/opencode-go.ts`。
