# type_space_token_unify

字号、字重、布局间距与圆角回归 DESIGN 九级字号 / 五档字重 / 4px 基网 / 六档圆角。

## 规则

### 字号

- 仅用九级：`display-num` / `title-lg` / `title-md` / `title-sm` / `body-md` / `body-sm` / `label-md` / `label-caps` / `code-md`。
- DOM 侧写法：`text-[length:var(--text-*)]`（d032：禁裸 `text-body-md` 等以免 twMerge 吞色）。
- 禁止 `text-[Npx]` 与未映射 Tailwind 字号档（`text-sm` 等）。
- canvas/SVG：`TEXT_SCALE_PX`（`src/renderer/lib/echarts_token_resolver.ts`），禁止 `fontSize` 数字字面量。

### 字重

- 仅 450 / 550 / 600 / 650 / 700。
- `font-medium`→`font-[550]`，`font-normal`→`font-[450]`；`font-semibold`(600)/`font-bold`(700) 可用。

### 间距

- 布局层 `p-*` / `gap-*` / `m-*` 为 4px 整数倍，或语义/组件 token 值。
- 语义：`card-gap` 12、`card-padding` 16、`section-gap` 24、`panel-padding` 14、`row-height` 40。
- 组件：按钮 9/18、输入 9/12、列表行 10/12。
- 半档：`*.5` 中仅 2.5(=10)、3.5(=14) 因上表豁免可留；0.5/1.5 须归位。

### 圆角

- 六档：`rounded-xs|sm|md|lg|xl|full`（6/8/10/14/18/999）。
- 禁止 `rounded-[Npx]`；canvas 用 `RADIUS_SCALE_PX`。

## 验证

- `tests/unit/renderer/styles/type_space_token_unify.test.ts` 源码审计 AC-001/002/003/005/006。
- `session_typography.test.tsx` 会话 title label-md < meta body-md。
