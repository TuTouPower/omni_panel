# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

两个诉求：

1. 开发 CLI 模式期间，跑界面相关 e2e 不希望在开发机上弹窗干扰——需要环境变量门控 headed/headless；
2. CLI 模式本身需要端到端验证——起一个真无头后端 + playwright 驱动 web UI 的「全栈无弹窗」e2e 项目，替代 mock 后端的 web 项目覆盖真实链路，且 WSL 里可跑。

现状：electron 项目永远开真窗口，playwright 无 headed/headless 门控；`_electron.launch` 无 headless 概念，需 app 侧配合（窗口 `show:false`）。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- `E2E_HEADLESS=1` 环境变量门控：app 侧窗口工厂（window-manager / 各 controller / 托盘菜单窗）在该变量下以 `show:false` 创建窗口（窗口存在可测但不弹屏）；playwright chromium 侧同步 headless；不设置该变量时现状完全不变
- 受门控影响的既有 electron spec 逐个 triage：依赖窗口可见性/焦点/真实渲染的 spec 标记为「仅 headed」（headless 下跳过并注明原因），其余在 headless 下必须全绿
- 新增 playwright e2e 项目 `cli`：以 `--cli serve --config <tmp>` 起真实无头实例，playwright chromium 驱动 web UI 走核心链路（面板加载、dashboard 数据、配置读取），全程无任何窗口
- package.json 测试脚本与测试文档同步（`test:e2e:cli` 等）

### 非范围

- 默认极性翻转（不设置变量时必须保持现状弹窗行为；CI 配置不动）
- electron spec 的用例内容重写（只做门控适配与 triage 标记）
- web mock 项目改造（`cli` 项目是新增而非替代）
- packaged 项目门控

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：`E2E_HEADLESS=1` 跑 electron 项目全程无窗口弹出（进程无可见窗口），未被 triage 标记的 spec 全绿
- [ ] AC2：不设 `E2E_HEADLESS` 时 electron/web 项目行为与现状完全一致（回归）
- [ ] AC3：`cli` 项目起真实无头实例跑通核心链路断言，全程零窗口；实例在测后干净退出
- [ ] AC4：[deploy] `cli` 项目与 `E2E_HEADLESS=1` 下的 electron 项目在用户 WSL 环境可运行（agent 无法自证 WSL 实机；Windows 侧全绿为前提）
- [ ] AC5：triage 标记清单明确：每个被标「仅 headed」的 spec 有具体原因（依赖可见性/焦点/拖拽等），headless 跳过时不计入失败

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC1 中「无窗口弹出」：自动断言进程窗口枚举无可见窗口；人眼无干扰属主观感受，以窗口枚举为准
- AC4：WSL 实机标 `[deploy]`
- 其余全部可自动测试

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 被 triage 标记「仅 headed」的 spec 在 headless 下的行为：显式跳过即契约，不为跳过场景补测

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- `cli` 项目后端为真实例（非 mock），fixture 用 synthetic/隔离 user-data-dir；断言目标为核心链路真行为
- 门控本体的验证即 AC1/AC2 两轮 e2e 实跑（headed 一轮回归、headless 一轮全绿）
- triage 以实跑结果为准逐 spec 判定，不预判清单

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- `show:false` 下哪些既有 spec 会失败（可见性/焦点/拖拽依赖面）：`UNVERIFIED-SPIKE`，Step 1 以 `E2E_HEADLESS=1` 全量实跑 electron 项目得出 triage 清单
- playwright `_electron.launch` 传 argv 起 `--cli serve` 并捕获 stdout URL 的可行形态：`UNVERIFIED-SPIKE`，Step 1 实验核实

### 风险与回退

- 风险：`show:false` 门控误伤非 e2e 路径（正常启动窗口不显示）；headless 下 spec 大面积失败导致 triage 范围失控
- 回退：门控严格限定 `E2E=1` 且 `E2E_HEADLESS=1` 同时存在才生效，双条件之外的代码路径零改动，可安全回退；triage 失控时缩小 headless 适用范围并向用户说明

### 依赖与约束

- 依赖 t275（`cli` 项目需要 `--cli serve` 可起）与 t276（控制子命令用于测后清理/实例管理，非硬阻塞）
- 与 t277/t278/t279 无冲突（测试基建 vs 生产端点）
- 不改变 CI 现有行为（CI 不设 `E2E_HEADLESS`）

### Finalization 时更新的 blueprint

- `docs/blueprint/testing.md`：`E2E_HEADLESS` 门控语义与 `cli` 项目分层定位、仅-headed spec 标记约定
- `docs/guides/testing.md`：人读清单同步
