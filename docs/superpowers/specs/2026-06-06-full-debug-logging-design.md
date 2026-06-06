# 全量 Debug 日志设计

## 目标

开发期日志要足够详细，可以直接从日志定位数据链路问题。当前 debug 已开启，但只记录 stdout 字节数、状态变化和部分摘要，缺少插件原始输出、解析后数据、配置、缓存、IPC、renderer 状态和颜色计算细节。

本设计把 debug 日志改成全量原始数据日志，不做脱敏，不做分类开关。

## 范围

记录所有关键数据流：

- app 启动参数、关键路径、运行环境。
- config 读写前后完整对象。
- secrets 读写 key 和 value。
- 插件命令完整 args/env。
- 插件 stdout/stderr 完整内容。
- 插件 parse 后完整 output/items。
- cache 读写完整 snapshot。
- runtime state 更新完整 payload。
- IPC 请求/响应完整 payload。
- renderer 关键状态：config、plugins、grouped usage、颜色方案、颜色计算输入输出。

## 非目标

- 不做日志分类开关。
- 不做脱敏。
- 不引入新日志框架。
- 不做生产级安全日志策略。
- 不改变业务逻辑。

## 架构

沿用现有 `createLogger()` 和文件 transport。

新增一个小型 stringify helper，用于把任意对象写入日志：

- 支持复杂对象。
- 遇到循环引用不抛错。
- 保留字段名和值。
- Error 对象输出 message/stack。

所有新增日志仍走现有 `log.debug(message, meta)`。

## 主要落点

- `src/shared/lib/logger.ts`
    - 强化 meta stringify，避免循环引用导致日志失败。
- `src/main/core/plugin/runner.ts`
    - 记录完整 command、args、env、stdout、stderr、exitCode、duration。
- `src/main/core/scheduler/refresh-service.ts`
    - 记录 config、plugin、merged params、runtime env、parsed output、cache save payload、runtime update payload。
- `src/main/core/config/config-store.ts`
    - 记录 config load 原文、parse 后对象、save 前对象、save 后路径。
- `src/main/core/config/secrets-store.ts`
    - 记录 secret get/set/delete/import/export 的 key/value。
- `src/main/core/cache/cache-store.ts`
    - 记录 cache load/save/delete 的 key 和完整 snapshot。
- `src/main/ipc/*`
    - 记录 IPC 入参、返回值、错误对象。
- `src/renderer/lib/provider-usage.ts`
    - 记录 snapshots 到 provider/account/grouped usage 的转换结果。
- `src/renderer/lib/usage-colors.ts`
    - 记录 `scheme/pct/idx/elapsed/resetAt/periodName/result`。
- `src/renderer/views/PopupView.tsx`
    - 记录加载到的 config、runtime states、grouped usage、当前颜色方案。
- `src/renderer/views/SettingsView.tsx`
    - 记录设置页加载 config、保存 payload、颜色方案切换。

## 数据流

1. app 启动后初始化日志。
2. config/cache/secrets 读写时记录完整数据。
3. scheduler refresh 读取 config，合并 secrets，构造命令。
4. runner 记录完整命令和插件 stdout/stderr。
5. refresh-service 记录 parse 后 output，写 cache，更新 runtime。
6. IPC 记录 main 与 renderer 的请求/响应。
7. renderer 记录 config、状态聚合和颜色计算。
8. 排查用量条颜色时，可以从日志直接看到：
    - config 中 `usageBarColorScheme`。
    - 插件 output 每个 item 的 `resetAt`。
    - 聚合后的每个 period `resetAt`。
    - `usage_window_elapsed()` 的输入输出。
    - `bar_fill_color()` 的输入输出。

## 错误处理

日志失败不能影响业务流程。

- stringify 失败时输出 `[unserializable]`。
- 循环引用输出 `[Circular]`。
- 文件写失败沿用当前 catch 行为，不抛到业务层。

## 测试

- 单元测试 logger：复杂对象可写、循环引用不崩。
- 单元测试 refresh-service：成功刷新时记录 stdout、parsed output、runtime payload。
- 单元测试 usage-colors：颜色计算 debug 输出包含 scheme、pct、elapsed、result。
- 手工/打包验证：
    - `pnpm package` 启动产物。
    - 刷新插件。
    - 打开 `AppData/Roaming/OmniUsage/logs/app-YYYY-MM-DD.log`。
    - 确认能看到 `resetAt`、`usageBarColorScheme`、插件 stdout、颜色计算输入输出。

## 风险

- 日志会变大。
- 日志会包含密钥、API 响应和本地配置。
- 只适合开发期。
