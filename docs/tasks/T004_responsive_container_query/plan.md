# Task plan

## 步骤与验证

1. `window-manager.ts` 把 `maxWidth: 780` 上调至 **1400**（不取消），保留 `minWidth: 472`。 → 验证：手动/打包启动 usage 窗可拖至 1400 宽，不能更宽。
2. `globals.css` 在 `.scroll-inner` 加 `container-type: inline-size`；同时加显式隔离规则 `.popup-mirror .scroll-inner { container-type: normal; }`（mirror 是 `.popup-mirror` 类，**不是** `.content-mirror`/`.collapsed-mirror`——那两个只是 ref 名）。 → 验证：DOM 检查 `.popup-mirror .scroll-inner` 计算属性 `container-type: normal`；测高上报值在拉宽窗口时仍随内容增长。
3. `ProviderOverview.tsx` 外层包一层 `.overview-grid`，默认 `display: grid; grid-template-columns: 1fr`（窄屏单列，视觉等价现状）；移除 `<>` fragment。**视觉快照对比**：单列布局前（fragment）/ 后（`.overview-grid` 1fr）像素级等价，验证 `ProviderCard` 在 grid item 下 stretch 行为不破坏现有外观。 → 验证：窄屏快照与改动前一致。
4. `globals.css` 新增三条 `@container` 规则（作用于 `.overview-grid`）：
    - `(min-width: 1024px)` → `repeat(auto-fill, minmax(320px, 1fr))`（多列）
    - `(max-width: 1023px) and (min-width: 640px)` → `repeat(2, minmax(0, 1fr))`（**强制双列**；不用 `minmax(290px,1fr)`——其在 1023px 下算出 3 列与验收「双列」冲突）
    - `<640px` 维持 `1fr`（默认值，可不写）
      → 验证：472/640/1024/1440 四档宽度下列数分别为 1/2/多列。
5. 红绿测试：补充视觉快照（Playwright `test:visual`）覆盖四档宽度——**既有快照在 472 基线宽度重测，新增 640/1024/1440 三档独立快照，旧基线不删除**；跑 `pnpm test` 确认 PopupView 现有用例不回归。 → 验证：`pnpm test` 全绿。
6. web 版回归：`pnpm build:web` 后浏览器加载，宽屏命中多列。 → 验证：浏览器实测或快照。
7. **拖拽多列适配（D2=B）**：`ProviderOverview.tsx:22-24` 的 `onDragOver` 签名加 `clientX`，重写 hit-testing——按光标 `clientX/clientY` 定位列与行位置，使横屏多列下拖拽插入点与视觉一致；`PopupView` 内拖拽 handler 同步改。单列下行为等价（仅一列，`clientX` 退化）。 → 验证：横屏多列拖卡到同行另一列按视觉位置插入；单列拖拽不回归。

## 风险与回退

- 风险：容器查询上下文波及 `.popup-mirror`，popup 高度抖动或上报错误。
    - 回退：步骤 2 的 `.popup-mirror .scroll-inner { container-type: normal; }` 显式隔离；若仍异常，把 container 下移到 `.scroll-inner` 内更内层包装元素（需同步调整 `.overview-row` 拓扑协议）。
- 风险：多列 hit-testing（步骤 7）改动量大，回归面广。
    - 回退：保留单列拖拽语义作为临时兜底；但目标仍是 D2=B 全功能多列拖拽，回退仅作 emergency，不作为终态。
- 风险：横屏下卡片高度不齐导致 grid 行空洞。
    - 回退：`.overview-grid { align-items: start }` 或 `grid-auto-rows: min-content`。

## 三层拓扑协议（T004 + T005 共享）

声明供 T005 引用：

```
.scroll-inner                         /* container-type: inline-size */
└─ .overview-row                      /* T005 实施；T004 暂不包装 */
   ├─ .overview-grid                  /* T004 实施；@container 调列数 */
   │  └─ ProviderCard × N
   └─ .upcoming-rail                  /* T005 实施；sticky 264px */
```

- `@container (min-width: 1024px)`：`.overview-row { display: grid; grid-template-columns: minmax(0,1fr) 264px; gap: 12px }`，rail sticky。
- `<1024px`：`.overview-row` 退化为 block；rail 由 T005 转为顶部 `.upcoming-banner` 横幅（T005 范围）。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：窗口形态段落补「usage 窗支持横屏自适应，容器查询断点 1024/640，`.scroll-inner → .overview-row → .overview-grid + .upcoming-rail` 三层拓扑」。
- `docs/blueprint/decisions.md`：记录「选容器查询而非媒体查询」「不新增 Electron 横屏主窗」「横屏多列拖拽采用 clientX hit-testing（D2=B）」三条决策。
- `docs/guides/testing.md`：补四档宽度视觉快照命令与既有/新增快照关系说明。
