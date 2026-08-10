# Task spec

## 背景

来源：p096（cli 继承全局 webServer 闲置启动）+ p097（代理 env 污染 webServer 探测）。核实（2026-08-10）：

1. `tests/e2e/cli/cli_flow.spec.ts` 所在 cli 项目继承 playwright.config 全局 `webServer`（5174 vite preview mock）；cli 自起 `--cli serve`，不依赖 webServer，vite preview 闲置启动（无害但多余）。playwright 是否支持按 project 关闭 webServer 待 Spike。
2. 本机存在 `http_proxy` / `https_proxy` 时，playwright 对无服务的 `127.0.0.1:5174` 走代理收到 400，误判「已可用」跳过启动，随后直连 5174 → `ERR_CONNECTION_REFUSED`。unset 代理后正常；`NO_PROXY` 无效。

两处均改 playwright webServer 基建，曾互标 conflicts；合并为一次「e2e webServer 隔离」交付。

## 契约区

### 范围

- cli 项目运行时不启动闲置的全局 webServer（vite preview）
- 隔离代理环境变量对 playwright webServer 探测的干扰：跑 web e2e 时（`pnpm test:e2e:web`）在代理变量存在时探测直连本机、正确启动 webServer

### 非范围

- playwright 配置整体重构（仅 webServer 隔离相关改动）
- 不改 web 产品代码、mock fixture、测试用例内容
- 不改 `vite.web.config.ts` 与 `vite preview` 启动参数本身（仅处理探测/进程环境隔离与 project 级是否启动）
- 不处理 electron project 的代理行为（其与代理无涉；若与全局配置改动耦合则保持无回归）

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

- [ ] AC-001：`pnpm test:e2e:cli` 运行时 5174 无 vite preview 进程（或明确无副作用证明；若 playwright 不支持 project 级关闭则文档化现状并给出无副作用证明）
- [ ] AC-002：cli e2e 全量通过，无行为回归
- [ ] AC-003：在设置 `http_proxy` / `https_proxy`（指向任意不可达代理）的环境下运行 `pnpm test:e2e:web`（任取 ≥1 个 web spec），playwright 正常启动 webServer，测试通过，无 `ERR_CONNECTION_REFUSED` / webServer 误判「已可用」
- [ ] AC-004：未设置代理变量时运行同一 web spec，行为与修复前一致（正常启动、通过），无回归
- [ ] AC-005：修复仅作用于测试基建进程（playwright 配置加载/webServer 子进程），不写入或修改任何仓库内的密钥/凭据文件

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：AC-001/002 进程断言 + cli e2e；AC-003/004 带/不带代理跑 web spec；AC-005 diff 审查 + 运行后 `git status`。

## 上下文区

- 来源：p096（t280 review Round 1 f005 minor；cli 继承全局 webServer）+ p097（2026-08-10 主仓复现：代理变量存在时 probe 400 误判 available；unset 后正常；`NO_PROXY` 无效）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- playwright probe 内部网络栈对代理的处理细节：属于第三方行为，黑盒验证覆盖即可（AC-003）

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- cli：全量 cli e2e + 断言 5174 未启 vite preview；若 playwright 版本不支持 project 级关闭 webServer，确认现状无害后按「维持现状 + 说明」满足 AC-001
- web 代理隔离候选（执行期验证选一或组合）：
    1. `playwright.config.ts` 顶层加载时检测并删除 `http_proxy` / `https_proxy` / `all_proxy`（大小写变体）——web e2e 全 mock 无外网依赖，对测试进程安全
    2. 文档补充「代理环境跑 web e2e 前 unset」（若 1 不可行）
- 运行前置：`MOCK_FIXTURE=synthetic`（playwright.config webServer 固定 `--host 127.0.0.1`）

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- playwright 是否支持按 project 禁用全局 webServer：**验证结论**（2026-08-11）——playwright 1.60 无 project 级 webServer 开关（类型仅顶层 TestConfigWebServer）；实测 `--project=cli` 会触发全局 webServer 启动。方案：config 条件化 `E2E_NO_WEBSERVER=1` 时 `webServer: undefined`，`pnpm test:e2e:cli` 脚本注入该 env（验证方式：脚本路径跑 cli 后 5174 无监听 + DEBUG 无启动日志）。
- playwright 探测读取代理的确切通道：**验证结论**（2026-08-11）——设置 `http_proxy`/`https_proxy`（本机 7890）时 `DEBUG=pw:webserver` 探测 5174 返回 400 被误判「已可用」；unset 后正常。修复：config 加载期删除代理 env 大小写变体（http_proxy/https_proxy/HTTP_PROXY/HTTPS_PROXY/ALL_PROXY/all_proxy）（验证方式：带代理跑 web spec 正常启动通过）。

### 风险与回退

- 风险：改 webServer 配置可能影响其他 project；配置层删除代理变量影响同一 playwright 进程内 electron/cli 环境（其测试不依赖外网，风险低）；`ALL_PROXY` 大写变体遗漏则修复不完整
- 回退：改动仅限 playwright 配置 / 文档；回归失败恢复该文件改动即可

### 依赖与约束

- 约束：不改产品与 mock 代码；web e2e 保持 `MOCK_FIXTURE=synthetic` 运行语义

### Finalization 时更新的 blueprint

- `docs/blueprint/testing.md`：如实现 cli 隔离 / 代理环境约束，同步说明
