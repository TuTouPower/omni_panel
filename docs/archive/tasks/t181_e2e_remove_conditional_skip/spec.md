# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

tests/e2e/web/ 5 个 spec 文件共 6 处运行时 test.skip(true, ...)，全部依赖 synthetic/real fixture 差异或 DOM 探测：account_error_badge.spec.ts（L21-23 kimi_card 缺失、L29-34 无 .error-badge）、multi_account.spec.ts（L38-40 无 KIMI connector）、opencode_go_usage.spec.ts（L21-23 无 opencode_go provider）、settings_provider_accounts.spec.ts（L37-39 无 .accent-row）、popup_card_states.spec.ts（L30-32 无 enabled+failed connector）。需 real fixture 或显式判定 skip 策略。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 处理 6 处条件 skip——为可补 fixture 的用例补 synthetic fixture 使其可跑；对确需 real fixture 的用例，把隐式 test.skip 改为显式 skip 声明（如 test.describe.skip 带原因注释）或在文档中明确 skip 策略。

### 非范围

- 不改 fixture 生成机制本身；不强制所有用例跑 real fixture（CI 环境限制）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：6 处条件 skip 逐条有明确处置：补 fixture 可跑，或显式声明 skip 原因。
- [ ] AC2：可补 fixture 的用例在 synthetic 环境下可跑且通过。
- [ ] AC3：确需 real fixture 的用例 skip 行为对 CI 可见（显式声明而非静默跳过）；既有通过用例不受影响。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC1：可自动测试（逐条检查 skip 处置结果）。
- AC2：可自动测试（synthetic 环境跑相关 spec）。
- AC3：需人工核对 skip 声明是否清晰（[deploy] 或说明）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 按项目默认。补 fixture 后跑 tests/e2e/web/ 相关 spec；CI 环境跑 synthetic fixture。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

无（原 SPIKE 项已实验核实，结论如下）：

- 各 skip 用例所需 fixture 内容，经 synthetic fixture 实测逐条核实：
    - KIMI enabled+failed connector 已在 synthetic（gen_synthetic 加 failed-real），但其卡概览默认展开、overview 卡行不渲染 `.error-badge`（该 badge 在 provider tab 的 ProviderAccountRow 层）；`last_error→error` 由 `observation_to_metric_record`（observation-mapping.ts:42）映射，需 fixture items 携带 error 才能显示。实测：注入 error 后 Kimi tab 账号行显示 `.error-badge` 通过。
    - opencode_go connector 原 synthetic 缺失（仅 trend 数据残留），补 synthetic connector（2 workspace × rolling/weekly/monthly）后 tab 渲染、三窗口文案可见，实测通过。
    - accounts 页 `.accent-row` 实为外观页强调色 swatch，accounts 页行结构是 `.acct-list > .acc-card`；选择器修正后实测通过。
    - enabled+failed connector 由 gen_synthetic 保证存在（popup_card_states / plugin_failure_modes 依赖），实测通过。

### 风险与回退

- 风险：补 fixture 后真实环境行为与 synthetic 不一致。
- 回退：revert 实现 commit。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- `docs/blueprint/testing.md`：e2e fixture 策略小节（如涉及）
