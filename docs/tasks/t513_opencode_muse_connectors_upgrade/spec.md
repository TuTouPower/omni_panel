# Task spec

## 背景

OpenCode Go 与 Muse 两个核心连接器在数据正确性与协议健壮性上存在缺陷：OpenCode Go 静默吞咽认证错误导致自动重登失效、多组织数据遗漏、数值异常归 0、月度重置时间错位且缺少 org 缓存；Muse 存在缺失字段兜底显示健康绿、硬编码 Action/Deployment ID 易脆断、Cookie 拼接未检 CRLF 以及缺少流式解析等问题。

## 契约区

### 范围

- OpenCode Go：401/403 明确抛出错误以激活自动重登机制。
- OpenCode Go：`to_number` 非法时返回 null 并记日志；缺失 limit 返回 null 避免 UI 异常。
- OpenCode Go：校正 monthly 重置时间取值逻辑（优先 meter 的 resetsAt）。
- OpenCode Go：实现组织查询 memo 缓存与并发预取；支持全 org 采集并在 account 模型中按 org_id 区分展示。
- Muse：字段缺失或非法时走 `report_failed` 或标 unknown，杜绝 0 兜底画绿。
- Muse：逐行 JSON 解析失败增加上下文与行数日志；Cookie 拼接前校验 CRLF 换行。
- Muse：移除硬编码 Action/Deployment ID 常量，改为发起请求前动态拉取解析；提取失败时抛出 `MUSE_ACTION_STALE`；实现 RSC 响应流式解析。

### 非范围

- 不改变除 OpenCode Go 与 Muse 以外的其他连接器。
- 不引入外部非标 HTML 解析重量库。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：OpenCode Go 连接器在收到 401/403 响应时抛出会话失效错误，调度器可捕获并进入重登。
- [ ] AC-002：OpenCode Go 遇到非法数值或缺少 limit 时跳过该项指标并输出 warn 日志，UI 不显示假 0% 额度。
- [ ] AC-003：OpenCode Go monthly 指标重置时间正确对应到 resetsAt 字段。
- [ ] AC-004：多组织环境下 OpenCode Go 循环采集全部关联组织，数据中包含组织专属标识，且多次查询命中 org 缓存。
- [ ] AC-005：Muse 响应中缺失用量字段时标记为未知或失败状态，界面不渲染为 0% 正常绿条。
- [ ] AC-006：Muse 通过动态拉取页面提取服务端最新的 Action ID 与 Deployment ID，代码中无死硬编码值，提取失败抛出清晰错误。
- [ ] AC-007：Muse 凭据检测到含有 `\r` 或 `\n` 时拒绝发送网络请求并报错。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试

## 上下文区

- 来源：`docs/reviews/review_20260925_085413/adoption_decision.md`（采纳项 A8, A46-A48, A55-A57, A115, A124, A146, A148）

### 有意不测

- 无

### 测试策略

- 针对 OpenCode Go 编写多 org 采集、memo 命中、401 抛错及非法数据转换的单元与集成测试。
- 针对 Muse 编写动态 ID 提取解析、CRLF 拒绝、流式解析及异常兜底测试。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无

### 风险与回退

- 风险：若 Muse 网页改版导致动态提取规则失效，连接器将报错不可用。
- 回退：提取失败抛出结构化错误，日志记录页面特征；必要时更新提取规则。

### 依赖与约束

- 遵循统一连接器契约规范。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：更新 Muse 动态端点与 OpenCode Go 多组织采集规范
