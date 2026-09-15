# Task spec

## 背景

`src/main/core/token-stats/collector.ts` 在定义采集源列表 `sources` 时，无条件将静态 WSL 五源（`WSL_SOURCES`）拼装进全局清单（`sources = [...platform_source_defs(collector_host), ..., ...WSL_SOURCES]`）。在 macOS 或纯 Linux 宿主上，WSL 数据源无法访问，在执行 `collect()` 时被推入 `all_sources_status` 并标记为 `status: "unavailable"`，导致 Agent 面板顶部导航栏渲染醒目的红字报错信息。由于 WSL（Windows Subsystem for Linux）是仅存在于 Windows 宿主上的子系统，非 Windows 宿主不应挂载该采集源。

## 契约区

### 范围

- 修改 `src/main/core/token-stats/collector.ts`：
    - 调整 `sources` 初始化与 `set_collector_host(host)` 注入逻辑：将 `...WSL_SOURCES` 改为仅在 `collector_host === "windows"` 时挂载。
- 更新测试 `tests/unit/main/core/token-stats/collector.test.ts`：
    - 增加在 macOS 宿主环境模拟下调用 `collect()` 的测试，断言其产生的 `all_sources_status` 不包含任何 WSL 源，且状态无 `unavailable` 报错。

### 非范围

- 不修改 Windows 宿主下对真实 WSL 路径的探测与采集逻辑。
- 不修改 Linux 宿主下经 `/mnt/c/Users` 采集 Windows agent 的现有逻辑（`WIN_SOURCES_LINUX`）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：当宿主平台为 macOS（`collector_host === "macos"`）时，`collector` 的当前采集源清单中不包含任何 `env === "wsl"` 的数据源。
- [ ] AC-002：在 macOS 宿主下执行 `collect()`，`all_sources_status` 列表中不包含 `wsl` 环境条目，且不产生 `status: "unavailable"` 的 WSL 报错条目。
- [ ] AC-003：当宿主平台为 Windows（`collector_host === "windows"`）时，`collector` 保持正常挂载 `WSL_SOURCES`。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：`p231`（2026-09-15 核实，定位至 `collector.ts` L421 与 L435）

### 有意不测

无

### 测试策略

- 在 `tests/unit/main/core/token-stats/collector.test.ts` 中通过 `set_collector_host("macos")` 模拟 macOS 运行环境，调用 `collect()` 检查返回的 `all_sources_status` 结构。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无

### 风险与回退

- 风险：若改动影响到 Windows 宿主，可能导致 Windows 上的 WSL 用户用量无法被采集。
- 回退：严格通过 `collector_host === "windows"` 守卫 WSL 源的添加，并通过既有 Windows WSL 单元测试套件进行回归。

### 依赖与约束

无

### Finalization 时更新的 blueprint

- 无
