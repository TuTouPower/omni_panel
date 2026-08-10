# d018 会话窗口外壳状态保留机制与 demo 依赖对照（2026-08-06）

- 来源：t223
- 结论：
    1. 页签常驻挂载 + CSS `display:none` 切换在 Chromium 中保留各页内部状态（含滚动位置）：Playwright 实测 `display:none` 后 scrollTop 保留（150→0→150），React 组件不卸载、订阅不注销，切回即原状态。比条件卸载/重建更省，且天然满足「切回不丢状态」。
    2. 会话窗口主题独立于全局：默认暗色、`localStorage omni_session_theme` 持久化、切换设 `html[data-theme]`，不写全局 `config.theme`——避免与其它窗口全局主题互相覆盖。持久化主题须在 `useLayoutEffect` 同步应用，否则 preload 首帧（按系统 `ou_theme`）与持久化主题不一致时闪一帧。
    3. frontend_demo（SessionGrid demo）依赖的 radix 组件族 / @dnd-kit / gsap / framer-motion / lenis / cmdk / react-markdown / next-themes 主仓均未安装；t223 外壳用现有 react 19 + tailwind v4 + lucide-react + 既有 theme 机制零新增依赖实现。后续 t224（槽位拖拽需 @dnd-kit）、t227（react-markdown 消息渲染）如需这些库须另行评估新增依赖体积/许可并报用户确认。
- 证据：t223 `.scratch/t223/shell_blackbox.ts` 驱动打包 exe（CDP）验证页签切换/主题/跳转；code reviewer Playwright 实测 scrollTop 保留；主仓与 demo `package.json` 依赖逐项对照。
- 影响：t224-t228 工作台/会话库/摘选任务可在现有依赖与外壳基础上推进；拖拽/命令面板/消息渲染库引入是独立决策点。
- 现状：有效
