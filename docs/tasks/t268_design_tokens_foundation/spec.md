# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

仓库根 `DESIGN.md` 已定稿为全项目统一设计规范（Google design.md 格式，token + prose）。当前样式现状是三套色板（globals 蓝 / session-shell lime / token-stats 紫）、三套字体栈并存，手写 BEM 类数千行。全面 Tailwind 化的第一步是建立 token 基础设施，让后续每个窗口迁移时「有 token 可取」。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 在唯一全局样式入口建立 token 层：`DESIGN.md` front matter 的颜色（含 `-dark` 成对值）、九级文字、六档圆角、语义间距、阴影、motion、z-index 五层全部落地为 Tailwind v4 `@theme` token；明暗翻转经 `@custom-variant dark` + 语义变量实现，机制上保证组件无需写 `dark:` 变体。
- token 同步方式定案为 `designmd export --format css-tailwind` 脚本导出 + drift check（导出产物与库内文件不一致即测试失败），禁止手工改写导出区。
- 强调色基础设施按 DESIGN.md「Colors」节完整落地：五档预设 accent token、base 色经 `color-mix()` 派生 strong/container/ring、历史 accentColor 值映射规则（预设 hex → accent key；自定义 hex → base 色同规则派生；非法/缺失 → blue）。切换写同一组变量并即时生效；启动时从 config 恢复。
- **临时兼容桥**：把现存三套体系的强调色入口（globals `--blue`、session-shell `--accent-lime` 及其桥接、token-stats `--ts-accent` 等）映射到统一 accent 变量，使未迁移窗口在本 task 后即随全局 accent 联动；桥接代码集中一处、逐条注释归属，删除责任分别归 t272（token-stats 侧）与 t273（session-shell 侧），globals 侧随 t270/t271 迁移自然消除。
- 用量条三方案所需的分类色 token（九色循环 `usage-1`～`usage-9`、风险阶梯明暗成对值）与 agent 识别色 token（四家 + fallback）落地，供 t270/t272/t273 消费。
- 自打包 Inter Variable 与 JetBrains Mono 字体资产接入构建，CJK 走系统回退栈；全局字体栈按 DESIGN.md 统一。

### 非范围

- 不迁移任何具体窗口、面板或业务组件（t270 起）；兼容桥只做变量映射，不改未迁移窗口的组件与结构。
- 不删除任何现存样式体系、组件类或形态（桥接的删除归 t272/t273）。
- 不建 ui 组件库（t269）。
- 不改任何业务逻辑、IPC、配置结构（accent 恢复读取已有 config 字段除外）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 应用启动后全部窗口正常渲染，无明文样式缺失、无首帧白闪或错色。
- [ ] 明暗主题（含跟随系统）切换后，所有窗口的底色、文字、边框同步变化，无窗口例外。
- [ ] 设置中切换五档强调色，所有已开窗口（含未迁移的会话/Agent 窗口，经兼容桥）的强调色即时同步变化，hover/浅底/聚焦环等派生态随动；重启应用后保持所选。
- [ ] 填入自定义 accentColor hex 时按派生规则生效；填入非法值时回落蓝色。[deploy]
- [ ] token 导出脚本与 drift check 落地：手工改动导出区后测试失败。
- [ ] 界面拉丁字符与数字渲染为应用自带 Inter，等宽内容为自带 JetBrains Mono，中文回落系统字体。[deploy]
- [ ] 语义工具类（如 `bg-surface`、`text-on-surface`、`rounded-lg` 卡片档）在任一窗口内可用且明暗自动正确。
- [ ] 视觉回归由人工对照 DESIGN.md 抽查确认，无明显退化。[deploy]

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC 1/2/3/5/7：经黑盒启动、e2e 与单测（断言 DOM 变量值、drift check）验证。
- AC 4/6/8：自定义 accent 的派生观感、字体实际渲染与视觉对照属人工验证，agent 无法自证。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 像素级视觉回归：无基线快照设施，靠人工对照 DESIGN.md。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 主题/accent 机制：单测断言变量翻转、派生公式与 config 恢复/映射逻辑；drift check 作为单测或脚本门禁；黑盒验证窗口启动与切换。
- accent × 主题代表性矩阵（五档 accent × light/dark）经 `getComputedStyle()` 断言解析后的实际颜色值。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- Inter Variable / JetBrains Mono 字体资产在 electron-vite 构建中的接入方式（@fontsource 或手动 woff2 + @font-face）：UNVERIFIED-SPIKE，执行期实验确定。

### 风险与回退

- 风险：token 层与现存手写 CSS 变量同名冲突，或兼容桥映射遗漏，导致未迁移窗口局部样式回归。
- 回退：单 commit 结构，整体 revert 即恢复。

### 依赖与约束

- 依据文件：仓库根 `DESIGN.md`；形态保留原则、accent 派生规则与 Tailwind 四层架构以其「Colors」「Tailwind 架构」「Do's and Don'ts」节为准。
- 兼容桥是过渡产物：t272/t273 完成后桥接必须随对应体系删除，t274 验证无残留。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：token 四层架构条目（含导出同步与 drift check）。
- `docs/blueprint/decisions.md`：DESIGN.md 为设计真相源、Tailwind v4 CSS-first、形态保留原则、双主题变量翻转机制、accent 单变量派生规则。
