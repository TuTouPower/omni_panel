# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

better-sqlite3 查询是同步调用。即使响应已聚合且读取规模受控，统计查询仍在 Electron main 执行；慢磁盘、首次回填、复杂筛选或异常查询可能阻塞窗口、托盘、IPC 和其他生命周期事件。查询隔离可把分析负载与主进程响应性分开。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 将 dashboard 统计读取放入独立执行上下文，主进程只负责请求路由、生命周期、超时和结果转发。
- 独立查询端以只读方式访问 WAL 数据库；collector 写入和原始数据所有权继续留在主进程。
- 支持请求关联、并发上限、超时、过期请求丢弃、优雅关闭和异常后受控恢复。
- 保持 dashboard query 跨进程契约和 renderer 行为不变。
- 打包产物包含查询执行端所需代码与原生依赖，并通过真实 packaged smoke。

### 非范围

- 不移动 collector、配置、vault、连接器或其他主进程服务。
- 不改变统计口径、持久聚合 schema 或缓存策略。
- 不引入网络服务或开放新端口。
- 不允许查询执行端读取 secret、配置明文或用户网络凭据。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：dashboard 查询执行期间，主进程仍能及时处理窗口、托盘和轻量 IPC；注入慢查询不会让这些事件等待查询完成。
- [ ] AC2：正常查询结果、错误结果和 data version 与隔离前一致，renderer 与 preload 契约无需感知查询运行位置。
- [ ] AC3：查询超时、执行端异常退出或返回过期响应时，调用方收到受控错误或最新有效结果，应用主进程不崩溃且不会提交错误选项的数据。
- [ ] AC4：并发查询有明确上限；快速连续切换不会无限排队，最新可见查询具有确定的取消或优先处理语义。
- [ ] AC5：应用退出时查询执行端和 SQLite 连接被关闭；重新启动或执行端受控恢复后可继续查询，无数据库锁残留。
- [ ] AC6：打包应用可启动代理面板、切换常用选项并完成 dashboard 查询，better-sqlite3 ABI 与资源路径正确。
- [ ] AC7：查询执行端只能读取统计数据库和必要的非敏感请求参数，不获得 vault、connector secret 或任意文件访问能力。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 不覆盖操作系统强制终止整个应用进程后的恢复：数据库 WAL 与现有启动恢复负责该场景，本 task 覆盖查询执行端单独异常。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 用可控慢查询/屏障证明主进程轻量 IPC 在查询未完成时仍响应，不以固定极短毫秒阈值制造脆弱测试。
- 集成测试覆盖并发上限、队列淘汰、超时、异常退出、恢复、退出清理和只读数据库行为。
- 契约测试比较隔离前后的 dashboard DTO 与错误映射。
- 运行 `pnpm package` 后真实启动 `artifacts/win-unpacked/OmniPanel.exe`，执行 packaged smoke 覆盖代理面板查询。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 独立执行上下文方案与打包兼容性：UNVERIFIED-SPIKE，执行期比较 Electron utilityProcess 与 worker_threads 对 better-sqlite3 ABI、资源打包、崩溃恢复和权限边界的支持，选取更小且可验证的方案。
- WAL 只读连接在 Windows/macOS/Linux 的一致行为：UNVERIFIED-SPIKE，执行期用临时数据库验证写入并发、关闭和锁释放；平台差异通过 CI 与 packaged smoke 覆盖。

### 风险与回退

- 风险：原生模块 ABI 或打包路径错误；进程间队列泄漏；异常恢复产生重复执行；只读连接与写连接争用 WAL。
- 回退：保留主进程内 dashboard query adapter 作为可切换回退路径；回退实现 commit 不影响数据库 schema 和用户数据。

### 依赖与约束

- 依赖 P3 稳定 dashboard query、聚合读取与 data version 语义。
- 进程生命周期、并发、原生模块与打包行为使用 full review。
- 隔离边界不得扩大 renderer 或查询执行端权限。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：补充统计查询执行端、主进程路由、数据库连接和生命周期边界。
- `docs/blueprint/decisions.md`：记录独立执行上下文选型及回退方案。
- `docs/blueprint/testing.md`：补充查询隔离与 packaged smoke 验证路径。
