# Spike report

## 问题

web 端 `sessionHistory.open("","","")` 在无具体会话时对 onFocus 订阅者的分发是否产生可见副作用——t311 将 web 面板互跳改为原生 `<a href="#route">` 后，左键点击与中键新开标签页的语义边界需确认。

## 成功判据

- 确认空 loc（source/env/session_id 全空）分发行为：onFocus 订阅者收到空 loc；loc 编码写 URL search 的分支短路（不污染初始位置）；hash 切到 session。
- 确认该行为对 t311 无副作用：`<a href>` 左键由浏览器导航（等同现 hash 切换），中键由浏览器原生新开标签页（不经 JS onClick），open 桥不被调用。

## 尝试

- 代码探查（只读）：`src/web/usageboard-web.ts:607-625` `sessionHistory.open` 实现。

## 证据

- `open` 实现：遍历 `session_focus_listeners` 分发 `{source, env, session_id}`；`if (source && env && session_id)` 才把 loc 编码进 URL search（空 loc 短路）；最后 `window.location.hash = "session"`。
- 空 loc 分发 = onFocus 订阅者收到 `{source:"",env:"",session_id:""}` + hash 切 session；无网络请求、无 URL 污染。

## 结论

- 空 loc 分发无可见副作用（仅 onFocus 通知 + hash 切换），t311 改为 `<a href>` 后左键由浏览器原生导航（hash 变化触发既有路由挂载），open 桥仅在中键新标签页场景不被调用——符合 AC-004 预期。无新增事实。
