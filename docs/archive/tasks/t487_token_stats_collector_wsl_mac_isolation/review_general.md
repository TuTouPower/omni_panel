# General Review 报告

## Round 1 (2026-09-15 15:11 UTC+8)

reviewed_scope: a465afcdd711f8ec

### 审查范围与基线

- 审查基线：`ad6c4177f48fc7d1f1f98ee18ecf052bdc10d216`
- 交付范围：
    - `src/main/core/token-stats/collector.ts`
    - `tests/unit/main/core/token-stats/collector.test.ts`

### 检查要点核对

1. **规格合规**：
    - AC-001：在 macOS 宿主下，`collector` 的当前采集源清单中不包含任何 `env === "wsl"` 数据源。
    - AC-002：在 macOS 宿主下执行 `collect()`，`all_sources_status` 不包含 `wsl` 条目，且无 `unavailable` 报错条目。
    - AC-003：在 Windows 宿主下，`collector` 保持正常挂载 `WSL_SOURCES`。
2. **实现正确性**：
    - `src/main/core/token-stats/collector.ts` 将 `sources` 初始数组和 `set_collector_host(host)` 内部重构逻辑调整为 `...(collector_host === "windows" ? WSL_SOURCES : [])` 与 `...(host === "windows" ? WSL_SOURCES : [])`。
    - 保证只有当实际运行宿主或模拟宿主为 Windows 时才挂载 WSL 源，彻底消除了非 Windows 宿主上因无法访问 WSL 路径而产出 `unavailable` 状态并污染前台展示的问题。
3. **测试可信度与规范**：
    - 彻底删除旧测试中已废弃的在非 Windows 宿主产生 `unavailable` 预期的旧断言，并按照规范写明废弃原因与语义变更说明。
    - 新增 AC-001、AC-002、AC-003 独立自动化测试，断言精准覆盖源数量、状态与日志。
    - 单元测试 55 项全数通过。
4. **代码质量与门禁**：
    - TypeScript 类型检查完全通过（0 错误）。
    - ESLint 检查完全通过（0 警告，0 错误）。

### Finding 清单

|finding_id|severity|title|file:line|description|recommendation|
|---|---|---|---|---|---|

（Round 1 零 finding）

### 结论

verdict: PASS

#### AC 复验方式

- `AC-001`：`re_verified`，`tests/unit/main/core/token-stats/collector.test.ts` 验证 `host=macos` 时 sources_status 中 wsl 长度为 0。
- `AC-002`：`re_verified`，`tests/unit/main/core/token-stats/collector.test.ts` 验证 `host=macos` 时无 unavailable 报错且无 wsl 日志。
- `AC-003`：`re_verified`，`tests/unit/main/core/token-stats/collector.test.ts` 验证 `host=windows` 时保持挂载 5 个 WSL 源。

coverage = 3 / 3
