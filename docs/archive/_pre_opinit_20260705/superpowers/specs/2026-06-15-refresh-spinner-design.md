# 刷新按钮等待态设计

日期：2026-06-15

## 背景

当前 popup 视图里，顶部“刷新全部”按钮在点击后没有稳定绑定真实的异步等待态；provider 级刷新按钮点击后也没有在等待期间持续旋转。用户点击刷新后，如果请求仍在进行，UI 看起来像“没反应”。

## 目标

当用户触发刷新且对应刷新 promise 尚未 settle 时，相关刷新按钮必须持续显示旋转态；promise resolve 或 reject 后，旋转态立即结束。

本次只改 popup 视图中的两类手动刷新入口：

1. 顶部“刷新全部”按钮。
2. provider 卡片/单 provider 视图中的单项刷新按钮。

## 非目标

1. 不修改设置页中的刷新按钮行为。
2. 不修改 demo 目录任何文件。
3. 不新增全局 loading 框架或抽象层。

## 方案对比

### 方案 A（采用）

直接在 `PopupView` 里用真实 pending 状态驱动旋转：

- `refresh_all` 使用布尔状态，包住 `refreshAll()` 的整个等待周期。
- `refresh_provider` 使用 `Set<UsageProvider>` 记录每个 provider 是否正在等待。
- 渲染时继续沿用现有 `spinning` class，只修正其触发时机。

优点：

- 改动最小。
- 贴合现有组件边界。
- 能精准表达“哪个刷新还在等”。

缺点：

- 状态逻辑仍留在 `PopupView`，暂不抽公共 hook。

### 方案 B

抽公共 `use_refresh_state` hook，统一管理全局刷新和单项刷新。

优点：结构更整齐。
缺点：超出本次需求，增加改动面。

### 方案 C

全局刷新时让所有 provider 刷新按钮一起转。

优点：实现简单。
缺点：语义不准，用户分不清是“全部刷新中”还是“单项也被单独触发”。

## 设计细节

### 顶部刷新全部

- 点击顶部刷新按钮后，立刻进入 `spinning`。
- 若已在刷新中，再次点击直接返回，不重复发请求。
- `refreshAll()` 的 promise 在 `finally` 中清理刷新态。
- 不再额外延迟 800ms；旋转是否存在完全由真实 pending 决定。

### provider 单项刷新

- `refreshProvider(provider)` 开始前，把当前 provider 加入 `refreshing_providers`。
- 对该 provider 关联的 enabled connectors 调用 refresh；等待 `Promise.all(...)` 完成。
- 无论成功还是失败，都在 `finally` 中把 provider 从 `refreshing_providers` 移除。
- 若该 provider 已在刷新中，再次点击直接返回，避免重复请求。

### 渲染层

- 顶部按钮继续使用 `refreshing` 布尔值决定是否加 `spinning` class。
- `ProviderOverview` / `ProviderCard` 继续使用 `refreshingProviders?.has(provider)` 驱动 provider 卡片按钮旋转与“刷新中…”文案。
- 全局刷新与单项刷新状态彼此独立；谁在等，谁转。

## TDD 计划

顺序固定：文档 → 测试 → 代码。

### 测试

先在 renderer 测试补两个行为：

1. 点击“刷新全部”后，在 promise 未 resolve 前按钮带有 `spinning` class；resolve 后移除。
2. 点击 provider 刷新按钮后，对应按钮在 promise 未 resolve 前带有 `spinning` class；resolve 后移除。

必要时用可控 promise 验证“等待中保持旋转”，避免只测调用次数。

### 实现

只改 `PopupView` 相关状态与事件处理，最小化扩散。

## 验证

1. 先跑新增/修改的 renderer 测试，确认先红后绿。
2. 再跑 `pnpm test`。
3. 因为涉及 UI，按项目约定手工点击验证 popup 里的两个刷新入口。

## 风险与约束

- 若测试环境里 provider 级刷新按钮存在多个同名元素，需要用更稳定的选择器或限定视图后再点。
- 当前项目要求 snake_case 命名；新增状态和 helper 保持一致。
- 本次不处理设置页、tray menu、主进程调度语义，只处理 popup 手动刷新反馈。
