# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：p071（用户提出）。2026-08-07 核实：四面板左上角碎片化——用量为 app logo + `OmniPanel`（无面板名）、设置仅文字「设置」（无 logo 无品牌）、代理为圆点 + 「代理面板」、会话为 logo + `OmniPanel`（无面板名）；统一格式不存在。p071 的另一半「会话面板改用厂商 logo 替代首字母徽标」已由 t246（已 done 合入 main）闭环，不在本 task 范围。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 用量、代理、会话、设置四个面板左上角统一显示：软件 icon、`Omni Panel` 品牌名、当前面板名称。
- 标题格式统一为 `Omni Panel - Usage` / `Omni Panel - Agent` / `Omni Panel - Session` / `Omni Panel - Settings`（面板名用英文，按此四种）。
- 同步窗口标题（系统任务栏/切换器显示的 title）与面板内标题栏文字一致。

### 非范围

- 会话面板徽标（SessionPane/SessionRail 首字母改厂商 logo）：已由 t246 闭环，不动。
- 不改右上角控制区（属「四面板统一自绘控制区」task）。
- 不改各面板内容区。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：四个面板左上角均显示软件 icon + `Omni Panel - <面板名>`，面板名分别为 Usage / Agent / Session / Settings。
- [ ] AC2：各窗口的系统标题（任务栏/Alt-Tab 显示）与对应面板标题一致。
- [ ] AC3：现有测试与 e2e 全部通过，无回归。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试（组件测试断言标题栏文案；electron e2e 断言 `document.title` / 窗口 title）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 组件级：四面板标题栏渲染断言（icon 存在 + 文案精确匹配）。
- electron e2e：各窗口 title 断言。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

无

### 风险与回退

- 风险：会话/代理为原生边框窗口时标题栏文字与系统标题重复显示的观感问题（若「统一自绘控制区」task 先完成则无此问题）。
- 回退：单 commit revert。

### 依赖与约束

- 与 backlog task「四面板统一自绘控制区并移除会话代理原生菜单栏」同改四面板 header，属 conflicts 关系，不得同批实施；建议在其之后实施（无边框后标题栏品牌是自绘标题栏的一部分）。
- 与 t249、t250、t251 无文件重叠。

### Finalization 时更新的 blueprint

- 无
