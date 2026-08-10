# Task spec

## 背景

来源：`docs/pending` p094（t275 review Round 2 code 非阻断备注）。核实（2026-08-10）：`src/main/cli/import-config.ts` 存在重复导入回滚边界问题——重复导入同一 plugin/param 且 config save 失败时，回滚可能连旧 vault 值一并删除（概率极低，两态皆半初始化）；另 `docs/guides/cli-mode.md` 未逐包枚举 Electron GUI 依赖（libgtk/libnss3 等）。属 CLI 模式（t275）遗留加固。

## 契约区

### 范围

- `import_config_file` 重复导入回滚边界：回滚只撤销本次导入的变更，不误删本次导入前已存在的 vault 值
- `docs/guides/cli-mode.md` 补 Electron GUI 依赖（apt 包）清单

### 非范围

- CLI 模式其他功能调整（t275/t276 已交付）
- 非重复导入的常规回滚路径（现状正确，仅补防回归测试）

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC-001：重复导入同一 plugin/param 且 config save 失败时，回滚保留旧 vault 值（不误删）
- [ ] AC-002：`docs/guides/cli-mode.md` 含可执行的 apt 依赖安装清单
- [ ] AC-003：全量 `pnpm test` 通过

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC-001：`tests/unit/main/cli/import-config.test.ts` 可测（构造重复导入 + save 失败，断言 vault 保留）；AC2：文档可人工核对；AC3：自动。

## 上下文区

- 来源：p094（t275 review Round 2 code 非阻断备注；2026-08-10 核实仍在：import-config.ts 回滚边界 + cli-mode.md 缺 apt 清单）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 单测：`tests/unit/main/cli/import-config.test.ts` 补重复导入回滚用例（config save 失败注入）
- 文档：apt 清单逐包核对（libgtk-3-0/libnss3 等 Electron 运行时依赖）

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无

### 风险与回退

- 风险：回滚逻辑改动影响既有导入正确性（数据面）
- 回退：改动局限于回滚分支；回归测试守护

### 依赖与约束

- 数据面（vault 值删除边界）：review_level=full
- 密钥规则：导入涉及 vault，沿用既有脱敏与所有权约束

### Finalization 时更新的 blueprint

- 无（CLI 依赖清单属 guide 文档）
