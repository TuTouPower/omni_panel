# Task spec

## 背景

本机存在 `http_proxy` / `https_proxy`（指向 127.0.0.1:7890）时，playwright webServer 探测对无服务的 `127.0.0.1:5174` 走代理并收到 400 响应，playwright 将 400 判为「已可用」，跳过启动 `vite preview`，随后测试内真实请求直连 5174 被拒 → `ERR_CONNECTION_REFUSED`。2026-08-10 主仓已复现并验证：unset 代理后探测正常返回 ECONNREFUSED 并自动启动 webServer，测试通过；`NO_PROXY` 不生效。

## 契约区

### 范围

- 隔离代理环境变量对 playwright webServer 探测的干扰：跑 web e2e 时（`pnpm test:e2e:web`）在代理变量存在时探测直连本机、正确启动 webServer。

### 非范围

- 不改 web 产品代码、mock fixture、测试用例内容。
- 不改 `vite.web.config.ts` 与 `vite preview` 启动参数本身（仅处理探测/进程环境隔离）。
- 不处理 electron/cli project 的代理行为（其与代理无涉）。

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

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：在设置 `http_proxy` / `https_proxy`（指向任意不可达代理）的环境下运行 `pnpm test:e2e:web`（任取 ≥1 个 web spec），playwright 正常启动 webServer，测试通过，无 `ERR_CONNECTION_REFUSED` / webServer 误判「已可用」。
- [ ] AC-002：未设置代理变量时运行同一 web spec，行为与修复前一致（正常启动、通过），无回归。
- [ ] AC-003：修复仅作用于测试基建进程（playwright 配置加载/webServer 子进程），不写入或修改任何仓库内的密钥/凭据文件。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001/002：可自动测试——以 `env http_proxy=... https_proxy=...` / 不带代理两种方式跑 web spec，断言通过且 webServer 启动日志正常。
- AC-003：可自动测试——修复 diff 审查 + 运行后 `git status` 无新增未预期文件。

## 上下文区

- 来源：t289

- 来源：p097（2026-08-10 主仓复现：代理变量存在时 probe 稳定收到 400 误判 available；unset 后正常；`NO_PROXY` 无效）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- playwright probe 内部网络栈对代理的处理细节：属于第三方行为，黑盒验证覆盖即可（AC-001）。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 修复候选（执行期验证选一或组合）：
    1. `playwright.config.ts` 顶层加载时检测并删除 `http_proxy` / `https_proxy` / `all_proxy`（大小写变体）——web e2e 全 mock 无外网依赖，对测试进程安全；需验证探测恢复直连。
    2. `docs/guides/testing.md` / `docs/blueprint/testing.md` 增加「代理环境跑 web e2e 前 unset」说明（若 1 不可行）。
- 运行前置：`MOCK_FIXTURE=synthetic`（playwright.config webServer 固定 `--host 127.0.0.1`）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- playwright 探测读取代理的确切通道（`http_proxy` 大小写变体、`ALL_PROXY`）：`UNVERIFIED-SPIKE`，执行期以 `DEBUG=pw:webserver` 复验各变体后改为结论。

### 风险与回退

- 风险：配置层删除代理变量影响同一 playwright 进程内 electron/cli project 的运行环境（其测试不依赖外网，风险低）；`ALL_PROXY` 大写变体遗漏则修复不完整。
- 回退：改动仅限 `playwright.config.ts` / 文档；回归失败恢复该文件改动即可。

### 依赖与约束

- 约束：不改产品与 mock 代码；web e2e 保持 `MOCK_FIXTURE=synthetic` 运行语义。

### Finalization 时更新的 blueprint

- `docs/blueprint/testing.md`：web e2e 小节补充代理环境约束（若采纳文档方案）或注明配置层已隔离。
