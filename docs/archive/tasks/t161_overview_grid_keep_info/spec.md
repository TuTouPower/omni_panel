# Task spec

## 背景

用量面板（`.overview-grid`）当前规则为 `minmax(320px, 1fr)` + 1024/640 两道断点（640–1023 强制两列）。320–340px 的窄卡片上，「展开的多账号卡片」头部（拖拽柄 + logo + 名称 + `概览|N账号` 分段控件 + 相对时间 + 刷新/折叠按钮）超过卡片内宽，把折叠按钮顶出卡片右缘（用户竖屏 4 列场景实测溢出 ~15px）。

此前曾用 `@container (max-width: 360px) { .card-head .rel-time { display: none } }` 规避（commit f2c1c705），结果 3~4 列常见布局下大量卡片的「X 分钟前」被隐藏——用户明确要求：**不许丢信息，放不下就减少卡片列数**。

用户要求（本 task 的权威需求）：

1. 任何窗口宽度、任何卡片形态（折叠/展开、单账号/多账号、长名称、已过期徽标）下，卡片头部所有信息完整可见：不裁剪、不隐藏、不溢出卡片边界。
2. 空间不足时**只允许通过减少网格列数**解决，禁止用 `display: none`、裁剪等方式隐藏头部信息。
3. 既有展示能力不回退（用量条、相对时间、按钮、拖拽均保留）。

既有 spec 问题（本 task 需修订）：`docs/specs/ui-views-web.md` 的「容器查询响应式」条目写死了 320px 下限与「640–1023 强制两列」，与上述需求冲突，finalization 时改写。

既有测试不足（本 task 需补上）：`tests/unit/renderer/globals_css.test.ts` 只断言旧断点/旧 minmax 存在，没有任何「信息不丢」守卫，所以 f2c1c705 引入的隐藏规则能全绿通过。

## 范围

- `src/renderer/styles/globals.css`：`.overview-grid` 改为单一 `repeat(auto-fill, minmax(<安全下限>, 1fr))` 规则（下限按最宽头部形态实测确定，预期 ~420px），删除 1024/640 断点与强制两列；删除 `.rel-time` 隐藏规则与不再需要的 `.overview-grid .card { container-type }`；保留 `.card-name` 省略号收缩作为兜底。
- `tests/unit/renderer/globals_css.test.ts`：删掉旧断点/旧 minmax 断言，补「网格最小列宽 ≥ 安全下限」与「禁止隐藏 `.rel-time`」的守卫断言。
- `docs/specs/ui-views-web.md`：改写「容器查询响应式」条目为新规则与「信息不丢」原则。

## 非范围

- 不改卡片头部 DOM 结构与组件逻辑（`CollapsibleCard` / `ProviderCard` 不动）。
- 不改 `.scroll-inner` 的 `container-type` 与 popup-mirror 机制（保留以免布局 containment 副作用）。
- 不处理其他视图（设置页、token 统计页）的响应式。

## 验收标准

- [ ] 窗口从单列到最宽（maxWidth 1400）各档宽度下，所有卡片形态头部信息完整：名称、分段控件/账号徽标、相对时间、刷新与折叠按钮均在卡片边界内可见，无 `display: none` 类隐藏。
- [ ] 容器不足以再放一个 ≥ 安全下限的列时，网格自动减列（含原 640–1023 区间不再强制两列）。
- [ ] `tests/unit/renderer/globals_css.test.ts` 含「最小列宽 ≥ 安全下限」与「`.rel-time` 不被隐藏」断言，且若重新引入 `display: none` 隐藏规则会变红。
- [ ] `pnpm test` 全绿；`pnpm typecheck && pnpm lint` 通过。

## 依赖与约束

- 布局真实效果需在打包版多显示器（含竖屏 150% 缩放）人工复核，自动化只能守 CSS 规则层面。
- 安全下限取值依据：最宽头部形态 = 长名称（~96px，如 OpenCode Go）+ l2seg（~102px）+ rel-time（~50px）+ tools（~47px）+ grip/logo（~38px）+ 6×9px 间距 ≈ 390px，加 32px padding 与边框 ≈ 423px；「已过期」徽标等极端叠加由 `.card-name` 省略号兜底。
