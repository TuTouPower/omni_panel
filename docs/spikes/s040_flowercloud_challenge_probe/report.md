# Spike report

## 问题

1. 花云客户区的 Cloudflare 质询，在**隐藏窗**（`show:false`）下是否会执行？生产用 `present_for_capture`（`showInactive` + `setOpacity(0)`）强制"显示"窗口，理由是 p268 记录的假设：`show:false` 时 `document.hidden === true`，质询脚本不跑。
2. 质询控件能否被 DOM 定位并自动交互（t535 范围中「评估自动交互验证控件」）？
3. macOS 上采集窗口在透明态与 `reveal` 态的可见性与焦点表现（t535 AC-007、p268）。

## 成功判据

- 读到 `document.hidden` / `visibilityState` 的实际值；
- 能枚举 Turnstile 控件（iframe / shadow DOM / 表单）并尝试点击；
- 观察到 `cf_clearance` 是否被服务端下发（等价于质询被接受）；
- 读到窗口 `isVisible()` / `isFocused()` / `getOpacity()`，并有截图存证。

## 尝试

- `code/probe.mjs`（首轮）：复刻生产窗口路径（`show:false` 创建 → `showInactive` + `setOpacity(0)` → 8s 后 `reveal`），独立分区 `persist:spike-flowercloud`、仓库内 `userData`/`temp`，观察 45s，产出 `probe_result.json` 与两张截图。
- `code/probe_v2.mjs`（对照）：`mode=hidden-only`（窗口全程 `show:false`，从不显示）与 `mode=transparent`（透明显示），各观察 75s，在 5/15/30/50/70s 采样挑战文案、DOM 控件、CF 请求与 cookie。
- 运行方式：`ELECTRON_RUN_AS_NODE= ./node_modules/.bin/electron <code>/probe_v2.mjs <code> <mode>`（本环境默认设了 `ELECTRON_RUN_AS_NODE=1`，必须清空否则 Electron 以 Node 模式启动）。

## 证据

1. **隐藏态与透明态的页面可见性一致**：

    |mode|窗口 visible|opacity|`document.hidden`|`visibilityState`|
    |---|---|---|---|---|
    |hidden-only|false|1|**false**|visible|
    |transparent|true|0|**false**|visible|

    即 `document.hidden` 不随窗口是否 `show()` 变化（本机 Electron 44.0.0 / Chrome 152）。

2. **两模式下质询文案全程为托管式自动挑战**：`document.body.innerText` = 「api-flowercloud.com 正在进行安全验证 … Ray ID: …」。

3. **控件无法定位**：递归遍历主文档 + 可访问 shadow root 后，`iframes: []`、`widgets: []`、`shadowHosts: []`、`forms: []`；`window._cf_chl_opt` 存在（12 个混淆键）。截图证明 widget 确实渲染（「正在验证…」/「请验证您是真人」）。

4. **`cf_clearance` 未下发**：两种模式 75s 观察内均为 `null`；网络日志持续出现 `SSL handshake failed … net_error -100`（CF 子请求失败）。

5. **`reveal` 前后挑战形态变化**（首轮，同一 Ray ID `a42b7fd21aeca364`）：

    - `code/transparent_state.png`（opacity 0、未 reveal）：widget = 「正在验证…」（自动）
    - `code/revealed_state.png`（`reveal()` 后 1s）：widget = 「请验证您是真人」+ 空复选框（人工）

6. **窗口属性**：透明态 `visible: true, focused: false, opacity: 0`；`reveal()` 后 `focused: true, opacity: 1`。

## 结论

1. **p268 的前提不成立**：本机 Electron 44 上 `show:false` 窗口加载的页面 `document.hidden === false`，Cloudflare 脚本照常执行。`present_for_capture` 对"让脚本运行"并非必要，它实际只是把窗口放进窗口层级（`visible: true`）。
2. **自动交互不可行（DOM 层）**：Turnstile 控件位于跨域 iframe / 不可遍历的 shadow DOM，主文档定位不到任何可点击目标；`_cf_chl_opt` 表明是 CF 托管挑战。自动点击分支应当关闭。
3. **`reveal()` 会把自动挑战升级为人工挑战**：同一挑战在透明态是「正在验证…」，`show()` 并聚焦后变成「请验证您是真人」+ 复选框，同时抢焦点（`focused: true`）。亮窗本身制造了对人工交互的需求。
4. **能否最终自动通过未定论**：两次 75s 观察均未拿到 `cf_clearance`，且伴随 CF 子请求 SSL 失败，无法区分"CF 判定失败"与"本机到 CF 的网络路径问题"，需在网络健康环境复测。
5. **限制**：探针因环境限制关闭了 Chromium sandbox（外部文件系统只读 + 未签名 → `sandbox initialization failed`）并重定向了 `userData`/`temp`，生产为 `sandbox: true`。这不影响页面 JS 与 DOM 观察，但第 4 条受网络影响无法定论。

## 是否采纳

- 决定：是
- 理由：结论 1 与 3 直接改变 t535 的设计前提（`present_for_capture` 的必要性、`reveal` 的副作用）；结论 2 关闭"自动点击"分支；结论 4 作为 t535 需在网络健康环境复测的遗留项。
- 后续 task：t535
