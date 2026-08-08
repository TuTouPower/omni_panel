# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

会话历史窗口自带一套独立设计系统（session-shell 暗色默认、lime 强调、暖米底色、Noto Sans SC + Space Grotesk 字体），并向 workspace / session-library / pane 三个子体系扩散，另有桥接变量把新 token 映射回旧名。本 task 将其整体迁移到统一规范并退役该体系，是迁移量最大的窗口。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 会话历史窗口全部视图（会话列表、搜索、摘要、工作台网格、预览、dock、会话面板）样式迁移到 ui 组件库 + 语义 token。
- 现存功能形态全部保留：工作台布局切换、会话卡片信息构成、摘要呈现、消息展示结构、agent 识别色等；lime 强调与暖米底色等体系级色板差异按 DESIGN.md 收敛到统一色板。
- agent 识别色按当前可达数据源消费 t268 token：claude / grok / opencode / kimi 四家 + 未知源 fallback；样式体系中不可达的厂商变量（cursor、aider、codex）随体系删除，不视为用户可见形态。
- 删除 session 相关全部独立样式文件：`session-shell.css`、`pane.css`、`session-library.css` 与 `session-library/` 子文件、`workspace.css` 与 `workspace/` 子文件，及 t268 兼容桥在本侧的桥接条目（桥接变量、`--win-bg`/`--text` 等旧名映射）。
- 删除验证三管齐下：文件不存在、对其的 import 为零、`--accent-lime`/`--bg-canvas`/`--agent-*` 旧变量与 `session-*`/`pane-*`/`ws-*`/`sl-*` 类引用为零；允许保留的基础样式列入白名单。
- 字体栈统一到全局规范。

### 非范围

- 不改会话索引、搜索、摘要生成、消息渲染等业务逻辑。
- 不动其它窗口；不改 web bridge / local-api / web 专属业务逻辑，共享渲染层的变更随动影响 web 属预期，对应 web e2e 必须保持通过。
- agent 识别色 token 的定义归 t268，本 task 只消费。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 会话历史窗口全部现存功能行为不变：列表加载与懒加载、内容搜索、摘要展示、工作台布局切换与拖拽、预览与 dock。
- [ ] 窗口明暗默认方向与全局一致（跟随 config 主题），无独立暗色默认；强调色随全局五档切换即时生效。
- [ ] 四家可达数据源的 agent 识别色与未知源 fallback 在明暗主题下均正确呈现。
- [ ] session 相关独立样式文件及桥接变量已删除，经文件/import/变量与类引用三重 grep 验证无残留。
- [ ] 视觉符合 DESIGN.md，人工抽查确认。[deploy]

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC 5：视觉对照属人工验证；其余经现有会话窗口测试与黑盒验证。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 像素级视觉回归：靠人工对照迁移前后截图。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 行为回归以现有会话窗口测试（含 t265 视觉滚动相关测试）为准；样式断言按新语义类名改写，逻辑断言不动。
- 门禁：`pnpm check`、`pnpm build`、`pnpm test`、对应 web e2e 与 electron e2e。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无

### 风险与回退

- 风险：桥接变量被跨体系引用，删除顺序不当导致中间态样式崩坏；迁移量大，单 commit 内回归点分散。
- 回退：单 commit，revert 即恢复；按子体系分批迁移、逐批黑盒验证后再合入。

### 依赖与约束

- 依赖 t272。

### Finalization 时更新的 blueprint

- 无
