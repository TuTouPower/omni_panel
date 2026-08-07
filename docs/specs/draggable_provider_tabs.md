# 用量面板厂商 tab 拖拽排序

## 背景

用量面板（主窗口 / web 版）顶部的厂商 tab 原本按固定顺序渲染。本 spec 让 tab 图标支持拖拽排序，并将顺序持久化到配置中。

## 范围

- `ProviderNav` 组件内的厂商 tab 支持拖拽排序。
- 拖拽顺序保存到配置中，重启后恢复。
- 未排序或新增厂商时保持现有默认顺序。
- 提供视觉反馈（拖动中、放置目标）。

## 非范围

- 不改变 ProviderCard 的拖拽重排行为。
- 不改动 account 行在单 provider tab 视图内的顺序。
- 不新增第三方拖拽库；复用项目现有 HTML5 drag & drop 工具函数。
- 不影响 tab 的点击切换行为。

## 验收标准

- [x] AC1：用户可按住某个厂商 tab 图标拖动到另一个 tab 位置，松开鼠标后 tab 顺序立即更新。
- [x] AC2：拖拽过程中，被拖 tab 有可视化拖动状态，目标位置有可视化放置指示。
- [x] AC3：tab 顺序变更后写入配置持久化，应用重启后按保存的顺序渲染。
- [x] AC4：仅拖拽图标本身触发排序；点击 tab 仍正常切换当前 tab，不会误触发拖拽。
- [x] AC5：新增未排序过的厂商或清空排序配置时，tab 回退到默认顺序（与当前一致）。
- [x] AC6：拖拽排序在 web 构建与 Electron 构建中行为一致。

## 实现要点

- 复用现有配置字段 `providerOrder`，使其同时控制总览卡片顺序与厂商 tab 顺序。
- 新增 `use_provider_tab_drag` hook 封装水平方向拖拽重排逻辑，复用 `compute_drag_reorder(axis="x")`。
- 拖拽手柄限定为 `<span class="tab-ic">`，按钮本身保留点击切换与放置目标检测。
- 拖拽结束后通过 setTimeout 清理标记，抑制浏览器派生的误点击切换。

## 测试覆盖

- `tests/unit/renderer/components/provider_nav.test.tsx`：图标可拖拽、标签不可拖拽、拖拽回调、点击抑制、视觉反馈。
- `tests/unit/renderer/hooks/use_provider_tab_drag.test.ts`：重排计算、拖拽状态管理。
- `tests/unit/renderer/views/popup_view_config.test.tsx`：拖拽后 `providerOrder` 写入配置。
- `pnpm test:e2e:web` 全量通过作为回归验证。
