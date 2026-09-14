# Task review t481（reviewer_focus: 代码）

- task：`t481_dev_panel_shell`
- spec：`docs/tasks/t481_dev_panel_shell/spec.md`
- diff_anchor：`35d8c0152c7c1ab6091736dfe675fb6a1519463c`
- target：`git diff 35d8c0152c7c1ab6091736dfe675fb6a1519463c`
- round：1

## Findings

本轮零 finding。

独立检查了安全、正确性、契约/Breaking、性能/资源、架构/可维护性、健壮性/可观测性、测试/文档七个视角：Git 调用固定为无 shell `execFile`；扫描、取消、重复请求、错误聚合和 data version 状态边界闭合；桌面 IPC 与 LocalAPI/Web bridge 复用同一个宿主 manager；配置 schema、第五 route、窗口 bounds、托盘和五面板导航均有对应接线。扫描器在根级 controller 生命周期内覆盖发现、common-dir 去重和 log 读取，并释放 timer/listener。

## 结论

- `DevPanelScanManager` 对在途请求返回同一 scan id，旧 promise 不会覆盖新请求；`git-scanner.ts:335-398` 对缺失根、单仓失败、超时和取消保留可读错误。
- `currentUserOnly` 按 author 字段过滤；committer 只进入展示摘要；全局 identity 不完整时显式 warning 并降级全部作者。cutoff 不交给 Git committer-date 过滤，而是在 author-date 本地日桶后应用。
- `devPanel` 配置、IPC sender 校验、LocalAPI schema 校验和 Web bridge 均只传配置/状态，不下发凭证或执行任意命令。
- 新增 `CalendarComponent` 后同步更新了既有 lazy-ECharts 测试 mock；面板样式通过项目 token 门禁。
- 当前环境的 SQLite native binding、既有 refresh-service 失败和 Knip 基线报告不属于本 diff 的代码 finding。

## AC 复验方式

|AC|类别|证据|
|---|---|---|
|AC-001|trust_prior|`src/main/index.ts:1069-1075` 使用 singleton window controller；托盘真实弹出/聚焦留部署态签收。|
|AC-002|re_verified|`PanelTitleBar` 的 19 个 renderer tests 断言五个入口与顺序；`WINDOW_CONFIGS.dev`/`PanelName`/route 接线已复核。|
|AC-003|re_verified|Web bridge test 断言 `#dev`、`/v1/devPanel/scan`、status、cancel；`DevPanelView` 提供三项配置和扫描操作。|
|AC-004|re_verified|真实临时 Git 仓库 scanner tests 断言 cutoff、日计数、结果时间/状态与可读错误；renderer 显示 loading/error/freshness。|
|AC-005|re_verified|scanner test 断言 author-date cutoff 与 current-user 过滤/缺失 identity 降级。|
|AC-006|re_verified|`CommitHeatmap` option test 断言 calendar data、visualMap 分档上限和仓库 tooltip 明细。|
|AC-007|re_verified|`DevPanelView` 保存 `{...config, devPanel}`；config schema test 断言显式命名空间保留，窗口 bounds 复用 config-store。|
|AC-008|re_verified|静态 token/style tests、Prettier 和生产构建通过；新 UI 仅使用既有 ui 组件与 CSS token。|
|AC-009|re_verified|scanner 只执行读 Git 子命令；missing-root test 断言跳过并继续有效根，未引入仓库写操作。|
|AC-010|re_verified|LocalAPI test 与 Web bridge test 分别验证同一 manager 的 host delegate 与 HTTP 通路。|
|AC-011|re_verified|scanner 真实 fixture 断言 author/committer 分离、global identity 缺失 warning 和全部作者降级。|
|AC-012|re_verified|scanner test 以 `[root, repo]` 重叠根断言单仓单计；实现按 canonical `git-common-dir` 去重。|
|AC-013|re_verified|manager test 断言并发 start 返回同一 scan id/reused=true；取消和逐根错误路径有实现复核。|

coverage = 12 / 13

reviewed_scope: c600292679f83668

verdict: PASS
