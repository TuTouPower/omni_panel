# 告警条/code chip/徽章/toast 复合模式沉淀

## 行为

- 四类复合模式各有唯一实现，业务侧禁止第三处手拼同配方 class 串：
    - **Alert**（`ui/Alert`）：error/warning/success 三语义 12% color-mix 浅底容器 + 同色字；padding/字号默认为 `px-3 py-2` + `text-body-sm`，布局用 className 叠加。
    - **CodeChip**（`ui/CodeChip`）：只读 code 值 chip（`surface-raised` 底 + `font-code-md` + `text-label-md`）。
    - **Badge**：既有 `count` / `label`；t422 增 `accent`（卡片头计数，accent 12% 浅底 + `rounded-[7px]`）与 `recommend`（推荐徽章，primary-container 底 + accent 字）。
    - **Toast**（`ui/Toast`）：底部居中浮层（surface-window 92% 半透明 + outline + shadow-menu）。
- 语义色 12% 派生容器的 color-mix 用法经本 spec 成为授权先例（DESIGN.md 灰区落地形态）；新告警条禁止另造 10%/其它比例。

## 非范围

- 不改各提示文案、触发条件与业务逻辑。
- 不扫 icon 光晕 / hover 态等其它 color-mix 用法。

## 验证

- 单元：`tests/unit/renderer/components/ui/ui.test.tsx`（四类组件渲染 + 业务侧配方 grep 清零）。
- 门禁：`pnpm test` / `pnpm typecheck`。
