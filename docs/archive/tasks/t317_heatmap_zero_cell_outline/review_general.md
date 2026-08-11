# Task review t317（reviewer_focus: 通用）

- task：`t317_heatmap_zero_cell_outline`
- spec：`docs/tasks/t317_heatmap_zero_cell_outline/spec.md`
- diff_anchor：`9830ab2d6e9087cc2c48a82daa8118cee85b48da`
- target：`git diff 9830ab2d6e9087cc2c48a82daa8118cee85b48da`
- round：1
- reviewed_at：2026-08-12 02:45 UTC+8

## Findings

### t317_gen_f001 - 测试策略第 3 条（web 渲染验证）未自动化

- 严重度：minor
- 锚点：上下文区「测试策略」第 3 条
- 位置：`tests/e2e/fixtures/synthetic.json`（无 token-stats/heatmap 数据）、diff 无 e2e/组件渲染测试
- 问题：spec 测试策略列了「web 渲染验证：构造含 0 值与非零值的 fixture，确认两主题均能看到完整格子轮廓」，本次 diff 仅补 option 单测（`heatmap_option.test.ts:39-54`），未补任何含 0 值 fixture 的渲染级验证；`synthetic.json` 亦无 token-stats 数据。AC-001/002 的运行时可见性已由 CSS token 值独立复验（见结论），故非阻断。
- 建议：后续人工抽查两主题 0 值格轮廓，或补一条含 0 值数据的渲染级断言（如需要，记入 task.md 处置表）。

## 结论

- 前轮 finding 复核：本轮为 Round 1，无前轮。
- 本轮新发现：1 条（minor）。
- 未进表的提示：无。
- 总体判断：实现正确、范围克制、测试触达真实 `buildHeatmapOption` 路径；仅有 1 条 minor，可 PASS。

### AC 复验方式

- AC-001（light 0 值格轮廓可见、不与 surface-card 同色）：`re_verified`。CSS token 实值 light `--color-outline: #e6eaf1`（globals.css:30）≠ `--color-surface-card: #ffffff`（globals.css:23）；`Heatmap.tsx:91` borderColor 用 `pal.heatCellBorder`，`echarts_token_resolver.ts:314` 运行时解析自 `--color-outline`，fallback light `#c9ced6`（:71）≠ surface-card fallback `#ffffff`（:68）。单测两主题断言通过（heatmap_option.test.ts:39-54，实跑 4/4 绿）。
- AC-002（dark 0 值格轮廓可见、不与 surface-card 同色）：`re_verified`。dark `--color-outline` = `var(--color-outline-dark)` → `#2a2f3a`（globals.css:89,220）≠ `--color-surface-card` = `#1f232c`（globals.css:81,213）；fallback dark `#3a4150`（:118）≠ `#1f232c`（:116）。单测同 AC-001 一并覆盖。
- AC-003（0 值不进有值色带、8 档梯度不变）：`re_verified`。diff 未触及 visualMap/pieces 与 `--color-heat-N` 消费逻辑；既有「no piece covers the zero value」与「pieces use the 8 heat colors in order」测试通过（实跑 4/4 绿）。
- AC-004（MetricDonut 不变）：`re_verified`。diff 文件清单不含 `MetricDonut.tsx`；`pal.sliceBorder` 仍解析自 surface-card（echarts_token_resolver.ts:376）且 MetricDonut.tsx:69 消费未变；palette.test.ts 4/4 绿。

coverage = 4 / 4

- 系统性 follow-up：无

reviewed_scope: cbd318a9a35207a1

verdict: PASS

## Round 2 (2026-08-12 02:50 UTC+8)

### 前轮 finding 复核

- t317_gen_f001（minor，测试策略第 3 条 web 渲染验证未自动化）：**已消除（处置合理）**。以 diff 为准，implementer 未改代码/测试（Heatmap.tsx、echarts_token_resolver.ts、heatmap_option.test.ts 相对 Round 1 审查对象零变化），仅改 spec 措辞：`spec.md:82` 测试策略第 3 条现为「AC-001/002 由 heatmap_option 单测两主题 borderColor ≠ sliceBorder 断言 + CSS token 实值复验覆盖；渲染级目视留人工抽查，不强制自动化——synthetic fixture 无 token-stats 数据」。逐项核对属实：
    - 单测存在：`heatmap_option.test.ts:39-54` 两主题循环断言 `borderColor ≠ sliceBorder`，语义直接对应 AC-001/002；
    - CSS token 实值复验（Round 1 已核，本轮代码 diff 未触碰解析路径）：light `--color-outline #e6eaf1` ≠ `--color-surface-card #ffffff`，dark `#2a2f3a` ≠ `#1f232c`，fallback 亦两两可辨；
    - synthetic fixture 属实：检索 `tests/e2e/fixtures/synthetic.json` 无 token-stats/heatmap 数据；
    - task.md 处置表 f001 记「已修」，rationale 与 fix_ref（spec.md:82）与措辞改动一一对应。
      措辞未夸大（渲染级不自动化被诚实披露），符合 minor 的 spec 同步处置路径，无回退需求。

### 本轮新发现

- 0 条。spec 改动仅限测试策略小节措辞，未触碰契约区 AC 本体、非范围与可测试性声明的实质断言；未引入新问题。

### AC 复验方式

- AC-001（light 0 值格轮廓可见、不与 surface-card 同色）：`re_verified`。本轮代码 diff 与 Round 1 一致：`Heatmap.tsx:91` borderColor 用 `pal.heatCellBorder`，`echarts_token_resolver.ts:314` 运行时解析 `--color-outline`（fallback light `#c9ced6` ≠ `#ffffff`）；两主题单测断言在（heatmap_option.test.ts:39-54）。
- AC-002（dark 0 值格轮廓可见、不与 surface-card 同色）：`re_verified`。同 AC-001 一并由单测断言覆盖；fallback dark `#3a4150` ≠ `#1f232c`。
- AC-003（0 值不进有值色带、8 档梯度不变）：`re_verified`。本轮 diff 未触及 visualMap/pieces 与 `--color-heat-N` 消费；「no piece covers the zero value」「pieces use the 8 heat colors」测试未变。
- AC-004（MetricDonut 不变）：`re_verified`。diff 文件清单不含 `MetricDonut.tsx`；`sliceBorder` 解析与消费路径未变。

coverage = 4 / 4

### 未进表的提示

- spec「可测试性声明」写「全部 AC 可自动测试」与测试策略第 3 条「渲染级目视留人工抽查，不强制自动化」并存：两者层次不同（AC 断言层可自动测试 vs web 渲染级验证不强制），不构成矛盾，仅提示，不进 finding。

### 总体判断

- 前轮唯一 minor 已按改 spec 路径合理处置，代码/测试零变更且措辞声明与实现逐项吻合；本轮无新发现，可 PASS。

### 系统性 follow-up

- 无

reviewed_scope: 6e98b0c3eadc7111

verdict: PASS
