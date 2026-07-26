# Spike: PopupView 三棵树渲染放大问题及优化方案

## 问题

`PopupView.tsx` 每次 `state-change` IPC 事件触发三棵完整树的全量重渲染，且 `use_popup_derived` 的 7 个 memo 因 `plugins` 引用变更全部失效重算。需验证：事件 burst 期间是否存在可量化的渲染放大，以及哪些优化方案可有效降低渲染量。

## 成功判据

- 确认三棵树的渲染路径、触发条件和频率。
- 确认 memo 失效的根因（引用变更 vs 值变更）。
- 提出至少一种优化方案，论证其将 burst 期间的 React 渲染次数从 O(N×3) 降至 O(1×3) 或更低，且不破坏现有功能（高度测量、交互响应）。

## 尝试

静态源码分析，无实验代码。

### 1. 定位三棵树渲染

三棵树位置（`PopupView.tsx:790-824`）：

- `render_body(true, false)` → live 树（用户可见，绑定事件）
- `render_body(false, false)` → content mirror（离屏，当前折叠状态，测 content_height）
- `render_body(false, true)` → collapsed mirror（离屏，强制全折叠，测 collapsed_min_height）

`should_render_mirrors`（`PopupView.tsx:788`）= `typeof ResizeObserver !== "undefined"`，Chromium 永真。三棵树始终同时渲染。

镜像用途（`use-popup-height-report.ts`）：两个 mirror 通过 ResizeObserver 监测 `offsetHeight`，报告给主进程计算 BrowserWindow 高度。主进程侧已有 debounce。

### 2. 事件触发链

事件来源（`runtime-store.ts:46-51`）：

- `refreshAll()`（`refresh-service.ts:438`）以并发上限 5 刷新所有 enabled connector
- 每个 connector 状态变化调用 `updateState()`，同步通知所有 listener
- listener 即 IPC bridge，向 renderer 发送 `state-change` 事件

事件消费（`use-plugins.ts:53-61`）：

```ts
setPlugins((prev) =>
    prev.map((p) => (p.instanceId === instanceId ? { ...p, snapshot: state } : p)),
);
```

N 个 connector = N 次 `setPlugins` 调用。每次 `.map()` 创建新数组，即使只有 1 个 plugin 的 snapshot 变化。

### 3. memo 失效链

`use_popup_derived.ts` memo 依赖：

| 行号 | memo               | 依赖 `plugins` 方式    |
| ---- | ------------------ | ---------------------- |
| 52   | `rawGroups`        | 直接 `[plugins]`       |
| 62   | `visibleProviders` | `[rawGroups, plugins]` |
| 82   | `providerErrors`   | 直接 `[plugins]`       |

其余 4 个 memo 间接依赖（通过 `rawGroups` / `providerGroups`）。

每次 `setPlugins` 创建新数组 → `plugins` 引用变更 → 3 个直接依赖 memo 重算 → `rawGroups` 变化 → 4 个间接依赖 memo 也重算 → **7/7 memo 全部失效**。

关键：`.map()` 中的 `{ ...p, snapshot: state }` 在 snapshot 未变化时也创建新对象。即使所有 plugin 对象完全相同，只要有元素被替换，`.map()` 一定返回新数组。

### 4. 容器组件 memo 覆盖

叶子组件已有 `React.memo`：`ProviderAccountRow`、`ProviderCard`、`UsageBarRow`、`TrendSparkline`。

容器组件**无** `React.memo`：`ProviderAccountList`、`ProviderOverview`、`CollapsibleCard`。

即使叶子组件 props 引用稳定，容器仍随父组件每次 render 而 re-render，进入其子树 diff。

## 证据

1. 代码位置：
    - 三棵树：`PopupView.tsx:790-824`（`render_body` 调用）
    - `should_render_mirrors` 永真：`PopupView.tsx:788`
    - `setPlugins` 无相等检查：`use-plugins.ts:56-58`
    - memo 直接依赖 plugins：`use_popup_derived.ts:52,62,82`
    - 并发刷新上限 5：`refresh-service.ts:442-446`
    - state-change 同步广播：`runtime-store.ts:46-51`

2. 引用变更链：每次 `state-change` → `setPlugins` updater → `.map()` → 新数组 → `plugins` 引用变 → 7 memo 全失效 → `render_body` ×3 全重渲染。

3. 叶子组件已有 memo，容器组件未包裹。

## 结论

三棵树渲染放大是真实存在的性能问题，根因是双层引用不稳定性：

1. **IPC 层**：每个 connector 状态变化独立触发 `setPlugins`，无合批机制。
2. **数据层**：`setPlugins` 的 reducer 总是创建新数组和新对象，即使值未变。

### 方案评估

#### 方案 A：rAF 合批

在 `use-plugins.ts` 的 `onStateChange` 回调内，将 `setPlugins` 改为通过 `requestAnimationFrame` 合批：N 个事件在同一帧内到达时，只触发 1 次 React render。

- 效果：burst 期间渲染从 N 次降为 ceil(N/frame) ≈ 1-2 次。总渲染次数从 O(N×3) 降至 O(1×3)。
- 风险：引入 1 帧延迟（~16ms），体感无差异。

#### 方案 B：快照相等性检查（引用稳定化）

在 `setPlugins` 的 reducer 中检查新旧 snapshot 是否相同，相同则返回原引用：

```ts
setPlugins((prev) => {
    let changed = false;
    const next = prev.map((p) => {
        if (p.instanceId !== instanceId) return p;
        if (p.snapshot === state) return p;
        if (snapshot_equal(p.snapshot, state)) {
            changed = true;
            return p;
        }
        changed = true;
        return { ...p, snapshot: state };
    });
    return changed ? next : prev;
});
```

- 效果：snapshot 值未变时 `plugins` 引用不变 → 7 个 memo 全部命中缓存 → 0 次重算、0 次子树 re-render。与方案 A 互补。
- 风险：需实现 `snapshot_equal` 对 `ConnectorSnapshotDTO` 的深度值比较。该类型是 union of plain objects with `readonly` 数组字段，可安全比较。

#### 方案 C：deferred mirror rendering

首帧只渲染 live 树；下一帧（`requestAnimationFrame`）再渲染两个 mirror。

```tsx
const [show_mirrors, set_show_mirrors] = useState(false);
useEffect(() => {
    const id = requestAnimationFrame(() => set_show_mirrors(true));
    return () => cancelAnimationFrame(id);
}, []);
```

- 效果：首帧渲染量降为 1 棵树（而非 3 棵）。
- 风险：镜像延迟 1 帧（~16ms）挂载，主进程侧已有 debounce，实际影响可忽略。

#### 方案 D：容器组件加 `React.memo`

给 `ProviderAccountList`、`ProviderOverview`、`CollapsibleCard` 包裹 `React.memo`。

- 效果：props 引用稳定时（方案 B 保证）容器组件跳过 re-render。
- 风险：需逐个确认容器组件的 props 引用稳定性；不当的 memo 可能导致 stale UI。

### 组合策略

| 优先级 | 方案               | 复杂度           | 预期收益                                              |
| ------ | ------------------ | ---------------- | ----------------------------------------------------- |
| P0     | B：快照相等性检查  | 低（~30 行）     | 消除 7/7 memo 重算；消除 snapshot 未变时的全量 render |
| P0     | A：rAF 合批        | 低（~20 行）     | burst N 次 render → 1 次                              |
| P1     | C：deferred mirror | 低（~10 行）     | 首帧从 3 棵树 → 1 棵                                  |
| P2     | D：容器 memo       | 中（需逐个验证） | 减少容器 diff；依赖 B 才有效                          |

P0 组合效果：refreshAll 期间设 N=5（并发上限），无合批时 5 次 render × 3 棵树 = 15 次 `render_body` 调用；方案 A+B 后约 1-2 次 render × 3 棵树（若 snapshot 全部稳定则 0 次），即 3-6 次或 0 次。

### 可信度

高。基于源码静态分析，不需要运行时测量即可确认引用变更链。优化方案均为局部改动，不改变架构。

## 是否采纳

- 决定：是（P0：方案 A + B）
- 理由：P0 方案代码量小（合计约 50 行）、风险低、收益明确。快照相等性检查直接消除最核心的 memo 失效问题；rAF 合批将 IPC burst 合并为单次 render。两者组合后 refreshAll 期间的渲染从 O(N×3×7-memo) 降至 O(1×3) 或 O(0)。
- 后续 task：待分配。建议拆两个 task：快照相等性检查（方案 B，`use-plugins.ts` reducer 改造 + `snapshot_equal` 函数）、rAF 合批（方案 A，`use-plugins.ts` rAF wrapper）。方案 C/D 作为后续优化项，视 P0 效果决定。
