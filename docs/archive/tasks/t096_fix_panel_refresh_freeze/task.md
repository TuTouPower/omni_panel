---
tid: t096
slug: fix_panel_refresh_freeze
diff_anchor: "664a80cc4e622dc0dbe87d9a74e71ff7f04b20ff"
branch: t096_fix_panel_refresh_freeze
---

# Task t096_fix_panel_refresh_freeze

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 用户反馈：用量面板所有数据一起更新时暂时卡死。静态走查确认机制链（渲染 ×3 / 高度回环 / 主进程同步阻塞 / 调度对齐），主因权重未实测。
- spec 要求：先按 plan 阶段一/二实测归因（数字记本节），再按归因修复，修复后同法复测对比。
- 静态走查复核（t096 启动后逐项核实代码位，4 条机制链全部坐实）：
    - ① 调度对齐 + 2N 事件 burst：`runtime-store.ts:46-52` updateState 同步遍历 listener；`event-ipc.ts:18-49` 每事件直接 webContents.send 无合批；refresh-service 每实例恰好 2 次 updateState（loading L234 + ready/failed L314/323/334/410），refreshAll 并发 5（L442-446）。
    - ② 渲染放大 ×3：`use-plugins.ts:53-62` 每事件 setPlugins 新数组引用，零合批（全链路无 rAF/debounce/microtask）；`PopupView.tsx:730-764` 确认 live + content mirror + collapsed mirror 三棵完整树（should_render_mirrors 在 Chromium 永真）；`use_popup_derived.ts:52,62,82` memo 依赖 plugins 全量重算。
    - ② 精度修正（spec VendorCard 误指）：popup 链路实际未 memo 的是 `ProviderOverview`（ProviderOverview.tsx:48）、`ProviderAccountList`（ProviderAccountList.tsx:34）；`ProviderCard` 已 memo（ProviderCard.tsx:73）但被 PopupView 非 useCallback handler（refreshProvider L346 / handleRefreshAll L330 / toggle_account L384 等）击穿，每渲染新引用 → shallow compare 失效。VendorCard 仅 SettingsView 用，不在 popup 链路。
    - ③ 高度回环：`use-popup-height-report.ts:36-51` report 仅精确去重；`popup-height-controller.ts:11` HEIGHT_REPORT_DEBOUNCE_PX=1，L227 同步 setBounds → resize → 再触发布局。burst 期间内容每次真变，1px 阈值拦不住。
    - ④ 主进程同步阻塞：`runtime.ts:1,166` vm.runInContext 在主进程（utilityProcess 仅 token-stats）；`observation-store.ts:198-220` better-sqlite3 insert 同步、refresh-service.ts:256-269 逐条未包事务；`observation-store.ts:169-178` list_by_source_instance_id 相关子查询全扫，refresh-service L278/L396 各调一次，N 实例 = N 次全表扫描。
- 待实测：主因权重（renderer 渲染 / 主进程阻塞 / 高度回环）需运行时数字确认。

### 基线实测（OU_PERF=1 packaged app，2026-07-24）

注入临时探针（perf-probe.ts + 5 处注入点），打包启动触发 refreshAll，基线数字（04:27-04:28 burst）：

- **main 事件循环 lag**：burst 期间持续 7-15ms，峰值 **19709ms**（19.8s sql_list 同步阻塞期间 setInterval 不调度，阻塞结束后单个 tick 记录 19709ms drift）。
- **vm 执行**（含网络往返）：531-5862ms/次，单次峰值 4559ms。非纯 CPU 阻塞（脚本内 await 网络让出事件循环）。
- **sql_insert**（observationStore.insert 同步）：单次峰值 **19797ms**。
- **sql_list**（list_by_source_instance_id 相关子查询，stale 复制用）：单次峰值 **19796ms**——压倒性主因。
- **状态事件数**：15-23/burst（2N 核对，N≈7-11）。
- **renderer longtask**：未采集到 console（探针 env 透传问题，已由 main 侧 sql_list 数字坐实主因，未阻塞归因）。

### 归因结论

**主因 = 主进程同步阻塞，压倒性地来自 `list_by_source_instance_id` 的相关子查询全表扫描**（单次 19.8s）。该查询对每行 o1 跑 MAX 子查询（observation-store.ts 旧 L169-178），64487 行 × idx_lookup 索引虽覆盖 (source_instance_id, account_id, metric_id, observed_at) 但相关子查询优化器未走索引路径。

- 隔离实测（真实 db 64487 行）：旧相关子查询 **53448ms**，window function 写法 **39ms**，降 1371 倍（行数 54 行返回一致）。
- renderer 渲染放大（三棵树 + 23 事件）、高度回环（1px 阈值）为次要因素，相对 19.8s 主进程阻塞可忽略，本 task 不处理。

### 修复

`list_by_instance_stmt`（observation-store.ts）改 window function：

```sql
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY account_id, metric_id ORDER BY observed_at DESC) rn
  FROM observations WHERE source_instance_id = ?
) WHERE rn = 1
```

语义不变（每 (account_id, metric_id) 最新观测），row_to_observation 显式取字段忽略 rn 列。

### 复测对比（修复后 04:39 burst）

| 指标                | 基线    | 修复后 | 降幅   |
| ------------------- | ------- | ------ | ------ |
| sql_list 单次峰值   | 19796ms | 28ms   | 99.86% |
| sql_insert 单次峰值 | 19797ms | 29ms   | 99.85% |
| eventloop lag 峰值  | 19709ms | 233ms  | 98.8%  |
| vm（未动，含网络）  | 4559ms  | 5021ms | —      |

远超 spec AC「主因指标降 ≥50%」。用户反馈「未响应」现象消除。

### instrumentation 处置

临时探针已全部移除：`src/shared/lib/perf-probe.ts` 删除；runtime-store / refresh-service / main/index.ts / use-plugins / PopupView / 3 测试 mock 注入点 git checkout 恢复。未转正式 debug 配置（主因已修，无需常态监控；如需可后续按 OU_PERF 模式重建）。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t096` 查，不在此记。

### 验收标准勾选

- [x] `task.md` 过程记录含基线实测数字：lag 峰值 19709ms、vm 531-5862ms、sql_insert 峰值 19797ms、sql_list 峰值 19796ms、state events 15-23/burst（renderer longtask 未采集到，env 透传问题，由 main 侧数字坐实主因）。
- [x] `task.md` 过程记录含归因结论：主因 = 主进程同步阻塞（list_by_source_instance_id 相关子查询 53448ms，真实 db 隔离实测）；renderer/高度回环次要。
- [x] 修复后复测主因指标降 ≥50%：sql_list 19796→28ms（99.86%）、sql_insert 19797→29ms（99.85%）、eventloop lag 峰值 19709→233ms（98.8%）。
- [x] 数据更新行为无回归；test/typecheck/lint 全绿（1606 测试）。
- [x] 临时 instrumentation 已移除：perf-probe.ts 删除 + 5 注入点恢复。

### Reviewer verdict

- Round 1 code：PASS（0 finding；提示 tie 场景语义差异但实测不发生，非 AC 项）
- Round 1 test：PASS（0 finding；提示可加固 tied observed_at 用例，非 AC 强制项）

### 遗留

主进程阻塞（主因）已修，卡死消除。以下三条为静态走查确认、实测属次要因素的渲染/布局问题，本 task 未处理，留作后续 burst 微卡顿时优化方向：

1. **渲染放大 ×3（三棵完整树）**：`PopupView.tsx:730-764` 同时渲染 live 树 + content mirror + collapsed mirror 三棵完整树（`should_render_mirrors` 在 Chromium 永真），每次 state-change 事件三树全量重渲染；`use_popup_derived.ts:52,62,82` memo 依赖 `plugins` 引用，每事件 setPlugins 新数组全量重算。修复方向：state-change 渲染合批（rAF / 16ms 窗口合并多次 setPlugins）、burst 期间只渲染 live 树延迟 mirror。
2. **ProviderCard memo 被击穿**：`ProviderCard.tsx:73` 已 memo，但 PopupView 传入的 handler（`refreshProvider` L346 / `handleRefreshAll` L330 / `toggle_account` L384 / `toggle_expand_provider` 等）非 useCallback，每渲染新引用 -> shallow compare 失效 -> 三棵树 × 每事件全量重渲染所有 ProviderCard。`ProviderOverview`（ProviderOverview.tsx:48）、`ProviderAccountList`（ProviderAccountList.tsx:34）未 memo。修复方向：handler 包 useCallback 稳定 props、ProviderOverview/ProviderAccountList memo。
3. **高度回环（1px 阈值）**：`use-popup-height-report.ts:36-51` report 仅精确去重；`popup-height-controller.ts:11` `HEIGHT_REPORT_DEBOUNCE_PX=1`，L227 同步 setBounds -> 窗口 resize -> 再触发布局 -> ResizeObserver 再 report。burst 期间内容每次真变，1px 阈值拦不住回环。修复方向：report 加 rAF 节流、DEBOUNCE_PX 提到 4-8px、burst 期间（loading 态）抑制 height report。

此外 list_by_source_instance_id 旧/新查询在 tied observed_at（同 ms）场景下行为有差异（旧返回所有并列行，新每分区 1 行）；observed_at=Date.now() ms 精度 + 网络间隔远 >1ms，tie 实际不发生，3 个 caller 无 tie 依赖。

### 结果摘要

- 实测归因：注入 perf-probe（OU_PERF=1）打包启动，基线 burst 主因 = list_by_source_instance_id 相关子查询全表扫描（单次 19.8s，主进程同步阻塞）。
- 修复：observation-store.ts list_by_instance_stmt 改 ROW_NUMBER() OVER (PARTITION BY account_id, metric_id ORDER BY observed_at DESC) window function，走 idx_lookup 覆盖索引，隔离实测 53448ms→39ms。
- 复测：packaged app 同场景，sql_list 峰值 19796→28ms（降 99.86%）。
- 测试：observation-store.test.ts 加 list_by_source_instance_id 多组语义用例。
- 探针全移除，diff 干净（store +17/-7、test +17）。
