# d036 web sessionHistory.open 空 loc 分发无可见副作用

- 来源：s028 web_empty_open_dispatch spike（t311）
- 结论：web 端 `sessionHistory.open("","","")` 空 loc 分发仅遍历 onFocus 订阅者通知空 loc + `window.location.hash = "session"`；loc 编码写 URL search 的分支短路（`if (source && env && session_id)`），无网络请求、无 URL 污染。t311 改 `<a href>` 后左键由浏览器原生导航、中键新开标签页不经 JS onClick，open 桥不被调用。
- 证据：`src/web/usageboard-web.ts:607-625` open 实现逐行核对。
- 影响：t311 web 面板互跳改原生链接的语义边界确认——hash 切换与既有路由挂载一致，无副作用。
- 现状：有效
