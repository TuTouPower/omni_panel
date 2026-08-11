# Task spec

## 背景

`VendorMark` 的亮暗双图 wrapper 使用 `[&_img]:block`，其编译选择器特异性高于图片自身的 `hidden` / `dark:hidden` / `dark:block`，导致 exa、grok、opencode_go 在 light 与 dark 两主题下均同时显示两张 logo。p135 已用真实产物 CSS + Chromium 最小复验确认，非 Tailwind dark variant 或 web 构建差异。

## 契约区

### 范围

- 消除 `VendorMark` wrapper 对图片主题显隐状态类的层叠覆盖，使 theme_logo 两张图片按当前主题互斥显示。
- 覆盖 exa、grok、opencode_go 三组 theme_logo，并保持 web 与 Electron renderer 行为一致。
- 增加真实浏览器/产物 CSS 回归测试，验证 light 与 dark 两主题的 computed display。

### 非范围

- 不调整 provider logo 资源、尺寸、比例或品牌映射。
- 不修改全局 Tailwind dark variant 配置。
- 不改仅有单张 logo 的 provider 渲染路径。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：light 主题下，exa、grok、opencode_go 的 vendor mark 仅显示 light 图片，dark 图片 computed display 为 `none`。
- [ ] AC-002：dark 主题下，exa、grok、opencode_go 的 vendor mark 仅显示 dark 图片，light 图片 computed display 为 `none`。
- [ ] AC-003：web 与 Electron renderer 使用同一主题显隐结果，不出现同一 vendor mark 两张图片同时可见。
- [ ] AC-004：仅单图 provider 的 vendor mark 仍显示原 logo，尺寸与容器行为不变。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：用真实浏览器加载构建产物 CSS，断言三组双图在两主题下 computed display 互斥；组件测试覆盖单图分支。

## 上下文区

- 来源：p135（2026-08-11 核实：`[&_img]:block img` 特异性 `(0,1,1)` 覆盖图片状态类 `(0,1,0)`；已扫无其他同因位点）
- 已确认修复面：`src/renderer/components/Icon.tsx` 的 theme_logo wrapper 与两张图片显隐类；三组 provider 共用一个机制。
- 补测方向：真实 CSS 层叠必须进入断言，jsdom 不作为主题显隐主证据。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 不逐像素比较 logo 图像内容：本 task 只修显隐互斥，资源正确性由既有品牌映射负责。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- web/e2e：使用真实构建 CSS，分别设置 light/dark，逐一断言 exa/grok/opencode_go 两张 img 的 computed display 为 block/none 或 none/block。
- renderer 组件回归：确认 theme_logo 与单图分支 DOM 结构和尺寸属性保持正常。
- 可复用 `.scratch/p135/verify.mjs` 的 A/B/C/D 场景作为执行期定位证据，不将 `.scratch` 文件入库。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：移除或调整 wrapper 图片 display 规则后，单图分支或图片基础布局退化为 inline。
- 回退：保留低特异性的图片基础 display 规则，若回归则恢复 wrapper 样式并改用显式主题条件渲染。

### 依赖与约束

- 无。

### Finalization 时更新的 blueprint

- 无。
