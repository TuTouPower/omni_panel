# d063 花云 Cloudflare 质询形态与采集窗口可见性（隐藏窗不需要显示、reveal 会升级挑战）

- 来源：s040 spike（`docs/spikes/s040_flowercloud_challenge_probe/`，代码与原始证据见 `code/`）
- 结论：本机 Electron 44 上 **`show:false` 窗口的页面 `document.hidden === false`**，Cloudflare 质询脚本照常执行，`present_for_capture`（透明显示）并非必要；Turnstile 控件在跨域 iframe / 不可遍历 shadow DOM 内，**DOM 层无法定位或自动点击**；而调用宿主的 `reveal()`（`show()` + 聚焦）会把托管式自动挑战（「正在验证…」）**升级为必须人工点击的交互挑战**（「请验证您是真人」+ 复选框），并抢焦点（`isFocused() === true`）。
- 证据：
    - `code/probe_v2_hidden-only.json`：窗口 `visible:false, opacity:1`，`document.hidden:false`，75s 内挑战文案恒为「正在进行安全验证」，`cf_clearance` 未下发。
    - `code/probe_v2_transparent.json`：窗口 `visible:true, opacity:0`，`document.hidden:false`，其余同上。
    - `code/transparent_state.png` 与 `code/revealed_state.png`：同一 Ray ID `a42b7fd21aeca364`，reveal 前 widget 为「正在验证…」，reveal 后变为「请验证您是真人」+ 空复选框；探针记录 reveal 后 `focused:true, opacity:1`。
    - 控件枚举：主文档与可访问 shadow root 内 `iframes/widgets/forms` 均为空，仅 `window._cf_chl_opt` 存在（12 个混淆键）。
    - 限制：探针因环境限制关闭 Chromium sandbox 并重定向 `userData`/`temp`；CF 子请求存在 `SSL handshake failed … net_error -100`，故"长期是否能自动通过"未定论。
- 影响：t535 的 `present_for_capture` 必要性假设（源自 p268）需改写为「隐藏窗即可执行质询脚本」；「自动点击验证控件」分支应关闭（无 DOM 可点击目标）；`reveal` 除抢焦点外还会改变挑战形态，支持"只有用户主动处理才前台化"（AC-001/AC-002）；t535 需保留一项遗留：在同一环境下拿到 `cf_clearance` 的成功/失败定论依赖网络健康复测。
- 现状：有效
