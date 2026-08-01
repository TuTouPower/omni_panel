# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

t067 已落地 set_renderer_index_path（src/main/ipc/helpers.ts:19-29）+ file:// 精确 pathname 比对（helpers.ts:39-43），接线于 main/index.ts:122-126，测试 tests/unit/ipc/helpers.test.ts:12-39（拒绝同名异路径）。仅剩未初始化时 endsWith fallback（helpers.ts:44-47，注释自称「fallback（未初始化或测试环境）」）。补未初始化路径的严格校验即可闭环。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 移除或收紧 helpers.ts:44-47 未初始化时的 endsWith("index.html") fallback，使未初始化状态下的 file:// sender 校验也走严格路径。

### 非范围

- 不改已落地的 set_renderer_index_path 机制与精确 pathname 比对；不改 main/index.ts 接线。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：未初始化状态下，非预期 file:// sender 不再仅凭 endsWith("index.html") 通过校验。
- [ ] AC2：已初始化状态下的精确 pathname 比对行为不变；既有测试通过。
- [ ] AC3：测试环境因未初始化触发的 fallback 有明确的替代方案（如测试中显式初始化），不因移除 fallback 导致既有测试失败。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 按项目默认。跑 tests/unit/ipc/helpers.test.ts 与相关 IPC 测试。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 哪些既有测试依赖未初始化 fallback：**已核实（2026-08-01 实验）**——移除 fallback 后 6 个 IPC 测试文件失败（event-ipc/connector-ipc-sender/token-stats-ipc/popup-ipc/config-ipc/grok_auth_ipc），valid sender 均为 `file:///index.html` 类未初始化路径。修复：各测试显式 `set_renderer_index_path`（模拟生产接线）+ sender URL 改生产格式（`file:///D:/app/out/renderer/index.html`）；popup-ipc/token-stats-ipc 因 `vi.resetModules()` 清模块缓存，须在 beforeEach 动态 import helpers 后重新初始化。验证方式：移除 fallback 实跑测试核对失败清单。

### 风险与回退

- 风险：移除 fallback 导致依赖未初始化状态的测试失败。
- 回退：revert 实现 commit。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
