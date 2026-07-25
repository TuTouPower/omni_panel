# opencode_go HTML 直解析

> 验证方式：API（connector runtime + fixture HTML；live snapshot 用 `.scratch` cookie 本地跑，CI skip）。
> 来源：t115（2026-07-26）。

# opencode_go_html_scrape

OpenCode Go connector 以 `/go` 页 HTML 直解析为主路径，原 server-fn 链路降级为 fallback。

## 背景

原 connector 链路 `/auth → /workspace + /go HTML → JS bundle → createServerReference hash → /_server` 任何一环随前端改版即失效。实测（probe `.scratch/probe-opencode-go.mjs`，真实 cookie）线上 `/workspace/<id>/go` HTML 同时内联：

- SSR `$R[N]={...}` hydration（含 `usagePercent` / `resetInSec`，字段顺序不稳定，伴随 `status` 等）
- `data-slot="usage-item"`（含人类可读 reset 时间 `Resets in N days M hours` / `reset-now`）

两种格式都可解出 rolling/weekly/monthly 三窗口，server-fn 链路非必需。

## 主路径

`connectors/opencode_go/connector.ts` `main`：

1. GET `/auth`（手动重定向）取 `workspace_id`。
2. GET `/workspace/<id>/go`。
3. `parse_usage_from_html(go_html)`：
    - SSR 优先：每窗口双正则（usagePercent-first / resetInSec-first），`[^}]*` 吸收 `status` 等伴随字段；SSR 任一窗口命中即走 SSR。
    - SSR 三窗全 miss → `data-slot="usage-item"` 切段，label/value 正则，reset 走 `parse_data_slot_reset`（`reset-now` slot → 0；`reset-time` 文本走 `parse_human_readable_reset` 解析 "N days M hours" 等换算秒）。
    - 至少一窗口即返回 payload（部分窗口容错）；全 miss 返回 null。
4. payload 命中 → `build_observations` 产出（不下载 JS bundle、不调 `/_server`）。
5. payload null → `server_fn_fallback`：原链路（/workspace assets → bundle → createServerReference hash → /\_server，三窗口齐全校验保留）。

## 数值健壮性

- `make_window`：percent 必 `Number.isFinite`，否则整窗丢弃（拒绝 NaN）；reset 缺失回 0；负数 `Math.max(0, ...)` clamp 下限。
- data-slot value 正则 `[\s\S]*?(-?\d+(?:\.\d+)?)` 支持负号，pct 同样 clamp。

## 错误 sanitize

所有抛出的 error 均为常量字符串（如 `Missing required secret: SESSION_COOKIE`、`Cookie 可能已失效，未跳转到 workspace`、`OpenCode Go 页面协议可能已变更`、`OpenCode Go usage response invalid`），不含原始 HTML 或 cookie 值。

## connector runtime 约束

connector 脚本在 vm sandbox 执行，runtime 禁 `import/export` statements（`src/main/core/connector/runtime.ts`）。故 HTML 解析函数（`parse_usage_from_html` 等）不能 export，测试改用 `run_connector` + fixture HTML（integration），不直接 import。

## manifest

未改：`auth.method = "web_login"`、`secret_name = "SESSION_COOKIE"`、`endpoints.default = https://opencode.ai`、`endpoints.login = https://opencode.ai/auth`。

## 参考

- vendor：`vendors/opencode-quota/src/lib/opencode-go.ts`（双格式解析口径来源，本项目不照搬其运行时工程化）。
- probe：`.scratch/probe-opencode-go.mjs`（用真实 cookie 抓 /go HTML 落盘 `.scratch/opencode_go_probe/go.html`，不入库）。
