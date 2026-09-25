# handoff

- 最后更新：2026-09-25
- branch：`t523_docs_and_handoff_sync`
- head_commit：`3b994034`
- 当前状态：t509 ~ t523 全套系统级加固与架构重构任务链顺利执行完毕，全仓门禁与测试体系全面恢复绿灯。

## 2026-09-25 架构重构与深度加固链完成（t509 ~ t523）

- branch：`t523_docs_and_handoff_sync`（base `t522_test_suite_hardening_and_gates`）
- head_commit：`3b994034`
- 交付内容汇总：
    - **UI 与视图修复（t509, t519）**：修复 Popup Upcoming 展开翻转与测试假绿；`FORM_REGISTRY` 注册表驱动表单系统；下沉 `useNowTick` 消除 30s 整树重绘；`ProviderOverview` 实施 memo 优化。
    - **主进程与安全加固（t510, t511）**：单实例锁竞争立即中止；收敛外链委托默认浏览器打开；Preload 路由矩阵工厂化分权；Popup 配置保存白名单拦截越权字段。
    - **认证与会话保活（t512, t513）**：Grok Bot 浏览器 PKCE 认证链路加固（verifier 仅内存持有、并发互斥去重、Token 轮换持久化）；OpenCode Go / Muse 网页登录会话失效精准抛错并触发后台重登。
    - **运行时与调度安全（t514, t515, t516）**：连接器响应体限制收紧至 10MB 并支持流中断；连接器执行迁移至隔离进程并经 SHA-256 完整性核验；调度器并发控制防泄漏；观测按 instance 查询索引优化。
    - **LocalAPI 与 Web 面板（t517）**：代理 URL 白名单校验与脱敏；JSON 解析防原型链污染；Web 15s 网络超时控制与页面隐藏暂停轮询；`/v1/trend/bulk` 批量趋势端点消除并发 fan-out。
    - **日志与可观测性（t518）**：日志读写与清理失败 5s 节流告警防爆栈；无源导出安全返回空文件；日志生命周期与配额接入动态配置。
    - **架构解耦与规范统一（t520）**：上帝文件解耦（`server.ts` 拆路由、`token-stats-store.ts` 拆 DDL/迁移、`index.ts` 提取 CLI/启动）；彻底移除 `lodash`；所有新建文件遵循 `snake_case`；补充 5 条跨层边界规则并通过 `pnpm arch`。
    - **Schema 契约与测试门禁（t521, t522）**：Zod 作为单一源输出格式化 JSON Schema 并接入 `pnpm schema:check` 门禁；全局测试超时收敛至 15s 并无挂起无死锁；覆盖率基线拉升至 50%；代理/并发/阈值/IPC/表单真实断言强化。
    - **文档与威胁模型固化（t523）**：统一全仓 20 个内置连接器声明；清理 `AGENTS.md` 幽灵目录；补齐 `specs_index.md` 完整索引；`decisions.md` 与架构文档固化 LocalAPI LAN 信任模型（R7）、Vault 文件权限模型（R8）、Cookie 明文存储模型（R10）以及 Grok Bot 指标裁撤 ADR（A87）。
- 验证状态：
    - `pnpm check`（typecheck, lint, format:check, deadcode, arch, schema:check, test）全量通过。
    - 332 个测试套件（4087 个用例）全部秒级通过，零失败，零超时。
- 下一步：
    - 主仓执行任务集成链（`task.py integrate-chain`）。
