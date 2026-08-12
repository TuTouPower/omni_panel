# Task spec

## 背景

会话工作台卡片（SessionPane 头部信息栏）当前为：第一行 = 会话标题（`column.title`），第二行 = `模型 · cwd末段 · N轮 · tokens · 时间`。用户要求重排信息栏信息层级：第一行展示工作目录、最后一条消息时间、session id（且 session id 可点击复制对应 provider 的续接命令）；第二行展示模型、轮次、token、会话名字。左侧 provider icon 保持不变。

## 契约区

### 范围

- 重排 SessionPane 头部信息栏两行内容：
    - 第一行：工作目录（cwd）、最后一条消息时间、session id。
    - 第二行：模型、轮次（N 轮）、token 消耗、会话名字。
- 第一行 session id 支持点击：按会话来源（source）分派生成续接命令并写入剪贴板，复制成功后显示 toast 提示。
- 会话来源 → 续接命令映射：
    - `claude_code` → `claude --resume <session_id>`
    - `kimi_code` → `kimi -r <session_id>`
    - `grok` → `grok --resume <session_id>`
    - `opencode` → `opencode -s <session_id>`
    - 未知来源：不生成命令（点击无效果）。
- 左侧 provider icon（VendorMark）保持不变。

### 非范围

- 不改消息区、大纲抽屉、脚部槽位信息。
- 不改复制命令的实际执行（仅写入剪贴板，不启动终端）。
- 不改 rail 槽位卡片的现有布局。
- 不改「视图」下拉里「显示时间戳」对消息行的控制。

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

- [ ] AC-001：卡片头部信息栏第一行渲染工作目录、最后一条消息时间、session id 三项；第二行渲染模型、轮次、token、会话名字，且各信息项内容与数据源一致。
- [ ] AC-002：左侧 provider icon 仍渲染且不改变（与信息栏重排前同一 vendor 标识）。
- [ ] AC-003：点击第一行 session id，剪贴板写入对应来源的续接命令（`claude --resume <id>` / `kimi -r <id>` / `grok --resume <id>` / `opencode -s <id>`），并显示「已复制」类 toast 提示。
- [ ] AC-004：未知来源会话点击 session id 不写剪贴板、不显示复制成功提示。
- [ ] AC-005：会话标题仍可在头部信息栏可见（第二行会话名字项），且「大纲 / 全选可见 / 清空选择 / 聚焦此面板 / 关闭」五个头部动作按钮行为不变。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：AC-001/002/005 用组件测试断言 DOM 文本与 icon；AC-003/004 用 jsdom mock `navigator.clipboard.writeText` 与 toast 断言，覆盖四来源与未知来源；剪贴板权限为浏览器提供，测试以 mock 方式自证命令字符串。

## 上下文区

- 来源：用户直接需求（2026-08-12）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 剪贴板真实写入的浏览器权限交互：依赖宿主环境，以 mock `navigator.clipboard.writeText` 断言命令字符串为准。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 按项目默认：`tests/unit/renderer/components/workspace/` 下新增/扩展 SessionPane 头部相关测试，mock `navigator.clipboard.writeText` 与 `calls`/`tokens`/`cwd`/`source` 数据，断言两行文本、icon、复制命令、toast 出现。
- 复用 `format_precise_datetime` / `last_message_time` 现有格式化；session 来源分派复用 `vendor_id_for_source` 同源映射思路。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：第一行文本项增多，窄列下可能截断；session id 较长时需 truncate + title 提示全量。
- 回退：改动集中于 SessionPane 头部 JSX 与一个复制分派函数，撤销提交即恢复。

### 依赖与约束

- 与 t323 同改会话面板相邻组件，禁止并行，须串行执行以避免 diff 冲突。

### Finalization 时更新的 blueprint

- `docs/blueprint/DESIGN.md`：如有会话卡片信息栏结构描述，同步更新为两行重排布局。
