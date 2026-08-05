# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

p050（t210 审阅发现，t209 域）：grok 提取器增量 id 从 0 重计，与全量 id 冲突。`grok-extractor.ts` 全量 `extract_grok` 的 `line_index` 只对合法 user/assistant 消息 +1（全局累计），增量 `extract_grok_incremental` 的 `line_index` 对增量切片内合法消息从 0 起计。全量已提 N 条（id `grok:0..N-1`）后追加 1 条，增量返回 id `grok:0` 的新消息——历史窗口 `merge_tail` 按 id 去重会把它当重复丢弃，watcher 增量通道失效，新消息只能靠 5s 兜底全量重拉恢复。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- `src/main/core/session-history/grok-extractor.ts`：增量消息 id 改为与全量同名空间不冲突的全局唯一值；增量切片开头做半行容错（cursor.offset 落在行中间时回退到最近行边界重读，避免越过半行导致该记录在增量通道丢失）。
- 相关单测：grok 全量/增量 id 唯一性、半行截断 fixture 增量不丢记录。

### 非范围

- 其余三端（claude_code/opencode/kimi_code）提取器语义（其 id 各自稳定，不受影响）。
- 历史窗口渲染 / merge_tail / 分页逻辑（t211）。
- subscription-service 游标推进（byte_offset 语义不变）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] grok 增量提取返回的消息 id 与全量提取 id 全局不冲突（同名空间唯一）；追加 N 条后增量 id 不与已提取的任何 id 重复。
- [ ] cursor.offset 落在 JSON 行中间（写入半行）时，增量提取能读到该完整行，不丢记录。
- [ ] 历史窗口收到 grok watcher 增量推送后新消息正确追加（不被 id 去重丢弃）——以单测驱动（mock watcher 链路）验证。
- [ ] 既有全量提取 id 格式（`grok:${n}`）不破坏历史窗口渲染 key / 分页依赖。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试：grok 提取器纯函数层 + subscription-service 单测可覆盖。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- fixture：内存构造 `chat_history.jsonl` 文本（合法行 + 半行截断），临时文件写入 `tests/fixtures/` 或 `.scratch/`。
- 断言目标：全量 id 集 vs 追加后增量 id 集无交集；半行场景增量返回消息数与全量一致。
- 回归：subscription-service watcher 链路（若 extractor 接口签名变化）。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无。

### 风险与回退

- 风险：id 语义改动影响历史窗口去重/分页（t211 消费方）。
- 回退：保持 id 前缀格式 `grok:`，仅改序号来源；改动前先跑 t211 会话历史窗口全量测试。

### 依赖与约束

- 依赖 t209（grok 提取器）、t210（subscription-service）、t211（窗口消费）。
- 硬约束：对会话源文件全程只读。

### Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：§会话历史消息提取 grok 条目注明增量 id 全局唯一 + 半行容错。
