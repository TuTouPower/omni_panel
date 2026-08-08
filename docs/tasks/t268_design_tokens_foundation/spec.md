# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

仓库根 `DESIGN.md` 已定稿为全项目统一设计规范（Google design.md 格式，token + prose）。当前样式现状是三套色板（globals 蓝 / session-shell lime / token-stats 紫）、三套字体栈并存，手写 BEM 类数千行。全面 Tailwind 化的第一步是建立 token 基础设施，让后续每个窗口迁移时「有 token 可取」。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- `DESIGN.md` 纳入版本库并确立为 token 上游真相源（若创建 commit 已单独入库，本 task 仅引用）。
- 在唯一全局样式入口建立 token 层：`DESIGN.md` front matter 的颜色（含 `-dark` 成对值）、九级文字、六档圆角、语义间距、阴影、z-index 五层全部落地为 Tailwind v4 `@theme` token；明暗翻转经 `@custom-variant dark` + 语义变量实现，机制上保证组件无需写 `dark:` 变体。
- 自打包 Inter Variable 与 JetBrains Mono 字体资产接入构建，CJK 走系统回退栈；全局字体栈按 DESIGN.md 统一。
- 强调色统一为单一变量入口：设置页五档 accent 切换写同一变量并即时生效于全部窗口；启动时从 config 恢复上次所选 accent。
- token 层的同步方式（手工维护或脚本从 DESIGN.md 导出）在 task 内确定并文档化。

### 非范围

- 不迁移任何具体窗口、面板或业务组件（t270 起）。
- 不删除任何现存样式体系、组件类或形态。
- 不建 ui 组件库（t269）。
- 不改任何业务逻辑、IPC、配置结构（accent 恢复读取已有 config 字段除外）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 应用启动后全部窗口正常渲染，无明文样式缺失、无首帧白闪或错色。
- [ ] 明暗主题（含跟随系统）切换后，所有窗口的底色、文字、边框同步变化，无窗口例外。
- [ ] 设置中切换五档强调色，所有已开窗口的强调色即时同步变化；重启应用后保持所选。
- [ ] 界面拉丁字符与数字渲染为应用自带 Inter，等宽内容为自带 JetBrains Mono，中文回落系统字体。[deploy]
- [ ] 语义工具类（如 `bg-surface`、`text-on-surface`、`rounded-lg` 卡片档）在任一窗口内可用且明暗自动正确。
- [ ] 视觉回归由人工对照 DESIGN.md 抽查确认，无明显退化。[deploy]

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC 1/2/3：经黑盒启动与现有 e2e 验证；主题与 accent 的全窗口一致性可断言 DOM 变量值。
- AC 4/6：字体实际渲染与视觉对照属人工验证，agent 无法自证。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 像素级视觉回归：无基线快照设施，靠人工对照 DESIGN.md。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 主题/accent 机制：单测断言变量翻转与 config 恢复逻辑；黑盒验证窗口启动与切换。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- Inter Variable / JetBrains Mono 字体资产在 electron-vite 构建中的接入方式（@fontsource 或手动 woff2 + @font-face）：UNVERIFIED-SPIKE，执行期实验确定。
- `designmd export --format css-tailwind` 产物接入构建的可行性与同步脚本形态：UNVERIFIED-SPIKE，执行期实验确定。

### 风险与回退

- 风险：token 层与现存手写 CSS 变量同名冲突，导致未迁移窗口局部样式回归。
- 回退：单 commit 结构，整体 revert 即恢复。

### 依赖与约束

- 依据文件：仓库根 `DESIGN.md`；形态保留原则与 Tailwind 四层架构以其中「Tailwind 架构」「Do's and Don'ts」节为准。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：token 四层架构条目。
- `docs/blueprint/decisions.md`：DESIGN.md 为设计真相源、Tailwind v4 CSS-first、形态保留原则、双主题变量翻转机制。
