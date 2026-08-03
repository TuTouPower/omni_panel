# Task review t192（reviewer_focus: 代码）

- task：`t192_tokenstats_incremental_rollup_version`
- spec：`docs/tasks/t192_tokenstats_incremental_rollup_version/spec.md`
- diff_anchor：`96cbf53211a5c61821dd608364dc7f2528c6211d`
- target：`git diff 96cbf53211a5c61821dd608364dc7f2528c6211d`
- round：1
- reviewed_at：2026-08-03 16:15 UTC+8

## Findings

### t192_code_f001 - 源码内嵌字面 NUL 字节作 session key 分隔符

- 严重度：minor
- 锚点：行为缺陷（潜在）——`upsert_records` 的 `touched` Map 键分隔符为源码内字面 `0x00` 字节；若任何工具链（编辑器编码转换、patch/merge、NUL 剥离处理）改动该行，分隔符将退化为空串，`source+env+session_id` 直接拼接，不同 session 键可能坍缩为同一键，导致被吞并的 session 跳过 rollup 重建，dashboard 聚合永久落后。
- 位置：`src/main/core/token-stats/token-stats-store.ts:837`
- 问题：模板字符串 `` `${r.source}\0${r.env}\0${r.session_id}` `` 中 `\0` 是**字面 NUL 字节**（`od -c` 证实 `\0`），而非 `\u0000` 转义。该文件因此被 `grep`/ripgrep 判定为 binary（本次审查即无法用文本工具检索该文件，需 `-a` 或专用工具）。运行时行为正常（NUL 是合法 JS 字符串字符），但属可移植性/可维护性隐患：源码不应携带裸控制字符，且任何会剥离 NUL 的转换都会静默改变 Map 键语义。
- 建议：改用 `\u0000` 转义序列（或可打印、值域互斥的分隔符如 `\u001f`），保持文件为纯文本。

### t192_code_f002 - query_dashboard 记录路径与聚合路径双轨重复

- 严重度：minor
- 锚点：代码质量（DRY）——四段 dashboard 查询区域（read_rollup、time bucket、session 列表、heatmap）各维护 records 与 rollup 两份实现，语义等价但写法不同（`SUM(calls)` vs `COUNT(*)`、rollup 路径 GROUP BY 含 agent、started_at/ended_at 由子查询提供）。
- 位置：`src/main/core/token-stats/token-stats-store.ts:1151-1406`
- 问题：本轮经 oracle 测试（records fallback vs backfill 后聚合路径，覆盖 agent/platform 过滤、xaxis time/project/session、gran hour/day、三种 metric、分页、别名、不足一小时窗口）逐区域相等，当前未观测到行为分叉。但该双轨是长期修复遗漏源：任一区域的逻辑修正必须同步两份；尤其 read_rollup 聚合路径 GROUP BY 多含 `agent` 列，records 路径不含——若未来 session 跨多 agent（当前 collector 固定 session 单 agent，故不触发），两路径对同一 session 产出不同行数。
- 建议：将窗口读取抽象为单一数据源层（如返回统一形状的中间结果），或至少提取共享的 SQL 片段常量；不强制重构，但需记录该双轨的存在以便同步维护。

## 结论

- 前轮 finding 复核：无（Round 1）。
- 本轮新发现：2 条（均 minor）。
- 未进表的提示：
    - 文件过大：`src/main/core/token-stats/token-stats-store.ts` 1458 行（本 task 净增约 520 行，此前已超 800 important 阈值）；`tests/unit/main/core/token-stats/token-stats-store.test.ts` 1670 行（本 task 净增约 627 行，跨越 1200 important 阈值）。均未见因过大直接导致的可观测缺陷，故不进 finding 表。
    - 圈复杂度：`query_dashboard` 直接分支约 10（rollup_ready ×4 三元 + gran/metric/xaxis/agent/platform 三元），达结论段提示阈值；未发现高复杂度已产出分支漏处理缺陷。
    - 范围外观察：无。
- 总体判断：实现与 spec 契约区逐 AC 对应（AC1 迁移+回填幂等、AC2 会话级重建与 oracle 一致、AC3 版本号事务内每批单调+1 且失败回滚不推进、AC4 渲染器版本比较+request_id 竞态守卫、AC5 聚合读路径、AC6 损坏可重建），未发现 critical / important；仅 2 条 minor。实测 token-stats 相关单测 90 例全绿。verdict 判定为 PASS。
- 系统性 follow-up：无。

verdict: PASS
