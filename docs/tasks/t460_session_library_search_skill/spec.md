# Task spec

## 背景

查询已支持独立标题/工作目录过滤（t457），桌面也会写 `cli.json`（t459）。用户的 coding agent 仍没有入口去搜 OmniPanel 会话库。本 task 只交付可拷贝 skill 与使用指南，教 agent 调现有 LocalAPI；不建 MCP。

## 契约区

### 范围

- 仓库内一份可拷贝 skill：发现实例、列/筛会话、正文搜索、按 loc 分页读消息。
- 一份给人看的使用指南：如何把 skill 拷到 Claude Code、Cursor、Grok。
- skill 必须写清：走 `127.0.0.1`、从 dataRoot `cli.json` 取 port、实例未运行时的失败、筛选参数、正文搜索的扫描分页、只读。

### 非范围

- MCP server、自动写入各家 `mcp.json` 或 skill 目录。
- 改 LocalAPI / 查询 / 会话库 UI 行为（t457～t459）。
- 实时订阅、打开工作台窗口、改会话源文件。
- 新接未覆盖源的 transcript。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `.repo_template/docs/usage.md`「命名与格式」。

<!-- /规范 -->

- [ ] AC-001：skill 说明用 dataRoot 下 `cli.json` 的 `port` 访问 `http://127.0.0.1:<port>`；并说明无该文件或连接失败时视为实例未运行，不得编造会话结果。
- [ ] AC-002：skill 给出列会话调用：HTTP GET `/v1/sessions`，参数至少包括 `title`、`directory`、`sources`、`start_at`、`end_at`、`order_by`、`direction`、`limit`、`offset`。
- [ ] AC-003：skill 给出正文搜索调用：HTTP POST `/v1/sessionHistory/searchContent`；写明其 `offset`/`limit` 是候选扫描分页、不是结果条数分页；并写明应先用元信息过滤再搜正文。
- [ ] AC-004：skill 给出读消息调用：HTTP GET `/v1/sessionHistory`，必须带 `id`、`source`、`env`，并可带 `limit` 与 `before_cursor` 分页。
- [ ] AC-005：skill 写明只读：不改会话源文件，不调用订阅或打开窗口类接口。
- [ ] AC-006：使用指南说明如何把该 skill 拷到 Claude Code、Cursor、Grok，且不要求配置 MCP。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：无（产品需求：coding agent 经 LocalAPI 搜会话库）；依赖 t457、t459

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 各家 coding agent 里实际粘贴 skill 后的手工加载：指南已覆盖步骤，不在本仓库启第三方 agent。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 读 skill 与指南正文：断言必要路径、参数名、`127.0.0.1`、`cli.json`、扫描分页说明、只读约束、三家拷贝说明、不出现 MCP 配置要求。
- 不 mock LocalAPI、不在本 task 启 OmniPanel。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：t457/t459 未合入时 skill 描述的 `title`/`directory` 或桌面 `cli.json` 与运行中实例不符。
- 回退：不发布 skill；查询与发现行为由前置 task 各自回退。

### 依赖与约束

- 依赖 t457（筛选参数）与 t459（桌面 `cli.json`）。
- 不新增对外 HTTP 面；skill 只消费现有 LocalAPI。

### Finalization 时更新的 blueprint

- 无
