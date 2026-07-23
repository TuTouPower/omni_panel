# Task plan

## 步骤与验证

### 阶段一：基线实测（先量化）

1. **main 事件循环 lag 探针**：main 进程加 `setInterval(100ms)` 测 drift（实际唤醒 − 预期），debug 级日志输出峰值 → 验证：refreshAll 期间日志可见 lag 时序。
2. **分项计时**：`execute_connector`（vm 执行）与 `observationStore.insert`（sqlite 写入）包 `performance.now()` 计时，按 instance 输出 → 验证：refreshAll 一次产出每实例两行计时。
3. **renderer longtask**：popup 挂 `PerformanceObserver({ type: "longtask" })`，state-change 事件处打 `performance.mark` → 验证：refreshAll 期间捕获长任务清单（次数 / 各时长 / 总时长）。
4. **基线采集**：真实场景（全部启用账号）跑 refreshAll ≥3 次取中位，记录：lag 峰值、vm 总时长、sqlite 总时长、longtask 次数与总时长、状态事件数（2N 核对）→ 验证：数字完整记入 `task.md` 过程记录。

### 阶段二：归因（基线不够清晰才做）

5. **消融实验**（env 开关逐个关，对比卡死时长变化）：
   - `DISABLE_MIRRORS=1`（不渲染两个镜像树）→ 掉的份额 = 渲染放大 + 高度回环；
   - `SKIP_SQLITE_INSERT=1`（跳过 observation 落库）→ 掉的份额 = 同步 sqlite；
   - connector 换假数据 stub（不走 vm）→ 掉的份额 = vm 沙箱执行；
   - main 广播加 100ms 合批 → 卡死消失则说明事件风暴驱动。
   → 验证：消融对比数字记入 `task.md`，写出主因阵营结论。

### 阶段三：修复（按归因选用）

6. 按主因实施（候选，不要求全做）：
   - renderer：state-change 渲染合批（rAF / 100ms 窗口合并 `setPlugins`）、`VendorCard` memo、镜像树去重（仅渲染结构不渲染重组件）；
   - 高度回环：report 阈值提高 / burst 期间抑制 resize；
   - 主进程：observation insert 包单 transaction、stale 复制查询改仅取最新、刷新 stagger 持久化。
   → 验证：修复点逐项对应 `task.md` 归因结论。

### 阶段四：复测与回归

7. **复测**：同方法同场景 refreshAll ≥3 次取中位，主因指标对比基线（目标降 ≥50%）→ 验证：对比数字记入 `task.md`。
8. **回归**：`pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿；临时 instrumentation / env 开关处置（移除或转正式 debug 配置）记入 `task.md`。

## 风险与回退

- 风险：机器负载噪声污染基线（缓解：≥3 次取中位、关闭无关重负载）；归因偏差导致修错方向（缓解：消融复核）；渲染合批改变 loading 态视觉节奏（逐实例 spinner 可能变批出现，需产品确认可接受）。
- 回退：instrumentation 与修复按 `git diff` 分块还原。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：如引入渲染合批 / 批量事务等结构性机制，同步数据流描述；无则不更新。
