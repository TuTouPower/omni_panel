# Task spec

## 背景

会话库面板（SessionLibrary）卡片信息布局与会话工作台不一致，用户要求对齐工作台的信息层级与视觉：

- 卡片当前结构为「icon+会话名（标题行） / 摘要行（line-clamp-2） / N轮·tokens·相对时间 / 完整 cwd」，信息层级与工作台不同。
- 用户要求三行重排：第一行 cwd（只显最后一级项目名）+ 消息时间（完整显示）；第二行 轮次 / token / session id（可点击复制 provider 续接命令）；第三行 会话名（即会话标题/摘要文本，单行）。
- 卡片左侧 icon 当前为 `agent_abbrev` 字母缩写（C/K/G/OC），要求换成与工作台一致的 `VendorMark` 真实 provider logo。

## 契约区

### 范围

- 重排 `SessionCard.tsx` 头部信息为三行：
    - 第一行：cwd 末级项目名 + 最后消息时间（完整格式，与工作台 `format_precise_datetime` 一致）。
    - 第二行：N 轮 / token 消耗 / session id。
    - 第三行：会话名（`s.title`，与现有标题行同一文本，单行截断）。
- 移除与第三行重复的摘要行（line-clamp-2）。
- 卡片左侧 icon 由 `agent_abbrev` 改为 `VendorMark`，id 映射沿用 `vendor_id_for_source`。
- session id 支持点击：按 source 分派生成续接命令写入剪贴板，成功显示 toast 提示（与工作台 t324 同规则）。

### 非范围

- 不改 `SessionRow`（列表视图）、`SessionPreview`、`SelectionDock`、`AgentFilterChips`。
- 不改会话库的搜索、筛选、排序、分页逻辑。
- 不改复制命令的实际执行（仅写剪贴板，不启动终端）。
- 不改工作台卡片（属 t324）。

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

- [ ] AC-001：会话库卡片第一行渲染 cwd 末级项目名与完整最后消息时间，cwd 只显示最后一级路径段，时间格式与工作台 `format_precise_datetime` 输出一致（YYYY-MM-DD HH:MM:SS）。
- [ ] AC-002：第二行渲染 N 轮、token 消耗、session id 三项，内容与数据源一致。
- [ ] AC-003：第三行渲染会话名（`s.title`），与标题行语义一致；原 line-clamp-2 摘要行不再渲染。
- [ ] AC-004：卡片左侧 icon 渲染真实 provider logo（与工作台同 `VendorMark`），不再渲染 `agent_abbrev` 字母缩写。
- [ ] AC-005：点击第二行 session id，剪贴板写入对应来源续接命令（`claude --resume` / `kimi -r` / `grok --resume` / `opencode -s` + id），并显示复制成功 toast。
- [ ] AC-006：会话库卡片「单独打开 / 预览 / 选择」交互及既有搜索筛选排序行为不变。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：AC-001/002/003 用组件测试断言 DOM 文本；AC-004 断言 VendorMark 渲染且无 agent_abbrev 字母；AC-005 mock `navigator.clipboard.writeText` 断言命令字符串与 toast；AC-006 复用既有行为测试。

## 上下文区

- 来源：用户直接需求（2026-08-12）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 剪贴板真实写入的浏览器权限交互：依赖宿主环境，以 mock 断言命令字符串为准。
- 三行像素观感：以 DOM 结构 + 文本断言覆盖，不做截图矩阵。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 按项目默认：`tests/unit/renderer/components/session-library/` 下 SessionCard 测试，mock 剪贴板与 toast，断言三行文本、VendorMark 渲染、复制命令、行为回归。
- 复用 `last_dir_segment`（src/renderer/lib/workspace/pane.ts:6）与 `format_precise_datetime`（pane.ts:15）确保与工作台一致；`vendor_id_for_source`（src/renderer/lib/workspace/slots.ts:158）映射 icon。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：卡片高度变化影响会话库网格排布；session id 较长时需 truncate + title 提示全量。
- 回退：改动集中于 SessionCard.tsx 与一个复制分派函数，撤销提交即恢复。

### 依赖与约束

- 与 t324 共用复制分派逻辑，建议串行执行并先于 t324 抽出公共函数（或 t324 完成后 t326 复用其实现）。
- 与 t323 同改会话面板相邻组件，禁止并行，须串行执行。

### Finalization 时更新的 blueprint

- `docs/blueprint/DESIGN.md`：如有会话库卡片结构描述，同步更新为三行重排 + VendorMark icon。
