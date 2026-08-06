# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：p057。

`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx` 13 个用例渲染后 `getSessions`/`query` mock 的异步 resolve 落在 act 外，vitest 打印 "not wrapped in act(...)" 警告；不导致失败，纯 dev 噪声。2026-08-07 核实：测试文件 349 行，`render()` 后直接同步断言（如 `screen.queryByText`）多处出现，mock resolve 未包 act，警告仍存在。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 消除 `SessionLibrary.test.tsx` 中 "not wrapped in act(...)" 的 vitest 警告（dev 噪声）。
- 保持全部测试断言与结果不变。

### 非范围

- 不改 `SessionLibrary.tsx` 生产代码（若根因在生产异步时序则说明并回退，但本 task 预期纯测试改动）。
- 不删除或弱化任何用例断言。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [x] 运行 `SessionLibrary.test.tsx` 相关测试，无 "not wrapped in act(...)" 警告输出。
- [x] 全部用例通过，断言语义与现状一致。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试：AC1 为测试运行输出（vitest 打印警告即 fail），AC2 为测试结果。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无（本 task 测试对象即测试文件本身）。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 候选修法（p057 登记）：render 后 `await act(async () => {})` 冲刷微任务，或断言统一改用 findBy/waitFor 前先 act。实施期任选其一。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无。

### 风险与回退

- 风险：`await act` 冲刷可能掩盖真实异步断言语义；若误用 waitFor 改变等待窗口，需确认断言仍有效。
- 回退：还原测试改动即可。

### 依赖与约束

- 依赖 p057 登记。
- 约束：不改生产代码；断言语义保持不变。

### Finalization 时更新的 blueprint

- 无
