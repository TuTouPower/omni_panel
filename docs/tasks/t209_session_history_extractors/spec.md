# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

需求定稿 `docs/tasks/t211_session_history_window/requirements.md`（决策 1、2、13）。现有四端 token-stats reader 只提取 token 计数与首条用户文本（作标题），消息正文解析后丢弃。会话历史窗口需要正文，数据来源定为按需读原始 transcript 文件，因此需先有四端「消息内容提取器」纯函数层。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 四端（`claude_code` / `opencode` / `kimi_code` / `grok`）消息内容提取器：输入会话定位信息（source、env、session_id 及文件定位所需上下文），输出统一的消息列表。
- 统一消息模型：消息 id、角色（user / assistant）、文本内容、时间戳。
- 每端支持：全量提取 + 按字节 offset（JSONL 端）或等价游标（opencode）的增量提取。
- 内容裁剪规则（决策 2）：仅保留 user 文本与 assistant 文本；tool_use / tool_result / system / thinking 一律剔除。claude_code 只读主 transcript（决策 13），不读 `agent-*.jsonl`。
- 提取器为纯函数 / 无副作用模块，文件只读打开。

### 非范围

- 不做 watcher / 订阅 / IPC / 窗口 UI（t210、t211）。
- 不改造现有 token-stats 采集管线与 SQLite store。
- 不写任何会话源文件（硬约束：全程只读）。
- subagent 消息穿插、tool 摘要（决策 2-B / 13-B，已弃用）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 对 claude_code fixture（含 user 文本、assistant 文本、tool_use、tool_result、system、thinking、subagent 引用行），提取结果只含 user 与 assistant 文本消息，顺序与时间戳正确。
- [ ] 对 opencode fixture（SQLite `part`/`message` 表），提取出 user 与 assistant 文本消息；`part.data` JSON 结构正确解析。
- [ ] 对 kimi_code fixture（`wire.jsonl`），提取出 user 与 assistant 文本消息。
- [ ] 对 grok fixture（`updates.jsonl`），提取出 user 与 assistant 文本消息。
- [ ] 四端增量提取：给定一个全量提取后的游标/offset，对追加内容做增量提取，结果与全量重提取的尾部一致，不重发已提取消息。
- [ ] 边界健壮：空文件、截断的最后一行、非 JSON 行（JSONL 端）不产生异常与脏数据，被跳过。
- [ ] 提取过程对源文件只读（测试断言不以写模式打开；opencode 用 `readonly: true`）。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试（fixture 驱动单测）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 真实用户 transcript 全量回归：文件格式以 fixture 采样为准，线上差异由 t213 手动验收覆盖。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- fixture 来源：四端真实 transcript 的脱敏采样，落 `tests/` 下对应 fixture 目录。
- mock 边界：不 mock 文件系统，用临时目录写 fixture 文件后真实读取。
- 断言目标：消息字段（id/role/text/timestamp）、过滤规则、增量游标语义。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- opencode `part` / `message` 表 `data` JSON 内 user/assistant 文本的确切字段路径：`UNVERIFIED-SPIKE`，执行期用真实 db 采样 dump 确认。
- grok `updates.jsonl` 中用户输入与 assistant 输出的事件类型名与字段：`UNVERIFIED-SPIKE`，执行期采样确认。
- kimi_code `wire.jsonl` 中 assistant 文本的事件形态（usage.record 之外的行型）：`UNVERIFIED-SPIKE`，执行期采样确认。

### 风险与回退

- 风险：四端 transcript 格式版本漂移导致解析漏行。
- 回退：提取器对新行型一律跳过不报错，宁可漏不可错；窗口层空态兜底（t211）。

### 依赖与约束

- 硬约束（需求定稿）：对会话源文件全程只读。
- 复用现有 reader 的文件定位与 env（win / wsl）处理逻辑，不重复造路径解析。

### Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：会话历史消息提取的来源与裁剪规则条目。
