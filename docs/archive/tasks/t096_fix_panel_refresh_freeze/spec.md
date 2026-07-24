# Task spec

## 背景

用户反馈：用量面板所有数据一起更新时面板暂时卡死。静态走查已确认机制链：

- **一起更新**：`connector-scheduler.ts` 每实例独立 `setTimeout`、同 interval、启动仅 ≤3s jitter，周期刷新天然对齐；`refreshAll` 并发 5。每实例产生 2 次状态广播（loading → ready/failed），N 实例 = 2N 事件 burst。
- **渲染放大 ×3**：`PopupView.tsx:461` render 同时喂 live 树 + content mirror + collapsed mirror 三棵完整树；`use_popup_derived` memo 依赖 `plugins` 引用每次事件全量重算；`VendorCard` 未 memo。
- **高度回环**：内容变 → mirror ResizeObserver → `report_content_height` → main `setBounds` → resize 再触发布局。
- **主进程同步阻塞**：connector 跑主进程 vm 沙箱；`observationStore.insert` 为 better-sqlite3 同步调用（`observation-store.ts:198`），每实例另有 stale 复制的 `list_by_source_instance_id` 全量查询。

主因权重（renderer 渲染 vs 主进程阻塞）未实测，本 task 要求**先实测归因、再按归因修复、修复后同法复测对比**。

## 范围

- 按 plan「验证步骤」完成基线实测（main 事件循环 lag、vm/sqlite 分项耗时、renderer longtask、事件数），数字与归因结论记入 `task.md` 过程记录。
- 按归因实施修复（候选方向：state-change 渲染合批、组件 memo / 镜像渲染去重、height report 节流、observation insert 批量事务、周期刷新 stagger 持久化；按实测主因选用，不要求全做）。
- 修复后同方法同场景复测，对比基线，数字记入 `task.md`。

## 非范围

- 不改数据更新语义（loading → ready/failed 流转、stale 复制、零观测兜底）。
- 不改 popup 高度锁定逻辑本身（`compute_target_height` / 钳制规则）。
- 不做与卡死无关的性能优化（token-stats 采集、趋势查询等）。

## 验收标准

- [ ] `task.md` 过程记录含基线实测数字：main 事件循环 lag 峰值、vm 执行与 sqlite 写入分项耗时、renderer longtask 次数与总时长、refreshAll 期间状态事件数。
- [ ] `task.md` 过程记录含归因结论（主因阵营：renderer 渲染 / 主进程阻塞 / 高度回环，及依据）。
- [ ] 修复后同场景复测，主因指标较基线下降 ≥50%，对比数字记入 `task.md`。
- [ ] 数据更新行为无回归；`pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿。
- [ ] 实测引入的临时 instrumentation / env 消融开关：收尾时移除或转为正式 debug 配置，处置记入 `task.md`。

## 依赖与约束

- 无前置 task；不依赖网络（本地真实账号刷新即可，需本机已配置若干启用账号）。
- 基线测量受机器负载影响，同场景至少 3 次取中位数。
