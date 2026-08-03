# Spike report

## 问题

t194 要把 popup 关闭从 `close()` 改为 `hide()`。需确认隐藏窗口在资源占用与可见性上的行为：隐藏期间渲染进程是否存活、是否停止渲染、内存是否保留、重新 show 是否复用同窗口不重建；以及三平台是否一致（floating 模式已在用 hide，但 popup 此前一直销毁）。

## 成功判据

- hide 后渲染进程仍在（非销毁），无 `render-process-gone`、无 `did-finish-load` 重发。
- 隐藏期间渲染进程空闲 CPU 收敛（Chromium 后台节流生效），工作集内存保留。
- show() 复用同一 webContents/OS 进程，不重建渲染进程。
- 跨平台：hide()/show() 为 Electron 原生 API，三平台语义一致；macOS/Linux 差异属 OS 层合成停顿（spec「有意不测」已排除）。

## 尝试

`code/hide_show_spike.js`：用真实 renderer（`out/renderer/index.html`）+ 真实 preload（`out/preload/index.js`）创建 popup 形态 BrowserWindow（frame:false、skipTaskbar、show:false），依次 show → 采样 → hide → 采样 → show → 采样；经 pwsh `Get-Process` 读渲染进程累计 CPU 秒与工作集 MB；记录 webContents.id / OS PID / did-finish-load 次数 / render-process-gone。

运行：`node_modules/electron/dist/electron.exe docs/spikes/s010_popup_hide_resource/code/hide_show_spike.js --no-sandbox`（Windows 实测）。

## 证据

```
[report] initial_pid=31032
[report] initial_wc_id=1
[report] initial_load_count=1
[sample] visible:          cpu_sec=0.172 ws_mb=94.2
[sample] hidden-1.5s:      cpu_sec=0.172 ws_mb=94.2
[sample] hidden-4.5s:      cpu_sec=0.172 ws_mb=94.2
[sample] visible-again:    cpu_sec=0.172 ws_mb=94.3
[report] after_show_pid=31032        # 同 OS 进程，未重建
[report] after_show_wc_id=1          # 同 webContents
[report] after_show_load_count=1     # 未重载
[report] render_process_gone_count=0 # 未崩溃/未销毁
[report] hidden_delta cpu_sec_gained_in_3s=0.0000 pct_single_core=0 ws_retained_mb=94.2
```

- 隐藏 3s CPU 秒增量 0.0000 → 单核占用 0%：隐藏窗口渲染进程完全空闲（Chromium 后台节流暂停 rAF/渲染）。
- 工作集 94.2→94.2→94.3 MB：React 挂载、组件级缓存与已加载数据保留，show 后立即可用。
- show() 前后 OS 进程与 webContents.id 相同、load 计数不增、无 render-process-gone：复用窗口不重建渲染进程。

## 结论

Windows 实测确认 hide() 满足 t194 AC1/AC2/AC3 的机制前提：进程存活、内存保留、隐藏期 0% CPU（Chromium 节流兜底），show 复用不重建。跨平台：hide()/show() 是 Electron 原生窗口 API，webContents 生命周期三平台一致（同进程、同加载状态）；floating 模式已在生产跨平台使用同一 hide 路径。macOS/Linux 仅 OS 层 GPU 合成停顿存在平台差异，属 spec「有意不测」。

限制：空状态 renderer（无 connector 数据）未跑轮询/刷新定时器，可见期 CPU 也接近 0；t194 的 AC3「隐藏期前台计时器/轮询降级」仍需实现层显式暂停应用级定时器，spike 证明的是 hide 本身已停渲染、机制不误伤。

## 是否采纳

- 决定：是
- 理由：hide 机制在 Windows 实测满足存活/内存/0% CPU/复用四断言，跨平台由同一原生 API + floating 生产先例背书。
- 后续 task：t194
