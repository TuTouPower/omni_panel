# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

全量 electron e2e 中 11 个账号/表单用例在 t193 HEAD（bb31938d）已失败，stash t194 改动后逐组复跑确认一致，非 t194 引入（p038）。涉及：`auto_seed`（existing config not overwritten）、`plugin_config`×3、`secrets_persistence`×3、`settings_view`×2、`popup_window_constraints`（collapsing all cards 底部留白）、`tray_menu_actions`（quit 菜单标签）。共性是 settings 账号/表单渲染与 connector 加载路径，疑为 t189-t193 范围内回归或本机环境（connector 发现 / auto-seed）差异。需复现定位根因并修复。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 复现 11 个失败用例，定位根因（代码回归或环境/fixture 差异）。
- 修复根因使相关用例恢复通过；若为本机环境问题，提供修复或可复现的环境配置改动，并让用例在 CI/标准环境下通过。
- 保持其它 e2e 用例无回归。

### 非范围

- 不改动 connector 数据语义、账号数据结构或密钥规则。
- 不因个别用例阻塞而删除或禁用用例（除非用户明确确认并登记理由）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：复现 11 个失败用例并记录实际错误（截图/日志/断言输出），区分代码回归与环境差异。
- [ ] AC2：代码回归类根因已修复，对应用例在 `{test_cmd}` e2e 下通过。
- [ ] AC3：环境类根因已定位并消除（配置/fixture/启动条件），相关用例恢复通过。
- [ ] AC4：全量 electron e2e 无新增失败（其余用例保持绿）。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC1：可自动复现（运行 e2e 收集失败输出）。
- AC2-AC4：全部可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 不测真实系统托盘菜单的视觉布局：`tray_menu_actions` 断言菜单项文本存在性，沿用现有断言方式。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 以 `{test_cmd}` e2e 全量运行复现；逐组隔离失败用例定位共性。
- 对回归类根因补对应单测/集成覆盖；对环境类根因记录验证方式。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 11 个用例的失败根因（代码回归 vs 环境差异）：已核实——全部为测试选择器/fixture 与渲染层漂移，非 t189-t193 回归、非本机环境差异（详见 task.md 实施笔记，e2e 复现 + DOM dump 实证）。
- 本机 connector 发现 / auto-seed 行为是否与测试期望一致：已核实——auto-seed 正常，`auto_seed`「existing config」失败源于 fixture executablePath 指向已删除路径 + 缺 instanceId/displayName，插件被健康检查 prune。

### 风险与回退

- 风险：根因为本机环境（如缺失 connector、路径差异）而 CI 本应通过，修复时误改生产代码掩盖环境问题。
- 回退：不触碰 connector/账号数据语义，仅修复确定回归或调整环境配置；回退实现 commit 即恢复。

### 依赖与约束

- 依赖 p038 登记。
- 依赖 e2e 运行环境（打包产物 / playwright）。
- 约束：修复不降低既有测试断言强度。

### Finalization 时更新的 blueprint

- `docs/blueprint/testing.md`：如根因为环境配置，补充 e2e 环境要求说明。
