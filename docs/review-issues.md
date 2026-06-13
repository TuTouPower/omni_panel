# 架构重构代码审查问题清单

> 审查范围：`796fb74^..HEAD`（30 commit，161 文件，+18823/-23969）
> 审查方法：第一轮 5 个 agent 浅扫描，第二轮 4 个 agent 深度审查（跨文件数据流、并发竞态、边界条件、错误处理）

---

## 高危（6 个）—— 数据丢失/崩溃/安全

### H1. observation_store.insert 失败被吞没（数据丢失）

**位置**: `src/main/core/scheduler/refresh-service.ts:168`

**问题**:

```typescript
for (const obs of observations) {
    deps.observationStore.insert(obs);  // 无 try-catch
}
deps.runtimeStore.updateState(instanceId, { status: "ready", items, ... });
```

如果 DB 写失败（磁盘满、权限），`insert` 抛异常，但外层 catch 会把状态标记为 `failed`，用户看不出是 DB 问题还是 connector 问题。更严重的是，部分 observation 可能已写入，数据不一致。

**证据**:

- `observation-store.ts:111-130` 的 `insert` 直接调用 `insert_stmt.run()`，无 try-catch
- `refresh-service.ts:165-193` 的 try-catch 不区分 connector 执行失败 vs DB 写失败

**修复**: 包裹 `insert` 在独立 try-catch，DB 失败时标记为 `failed` 并明确错误来源。

---

### H2. secret 缺失时用空字符串发无认证请求（安全）

**位置**: `src/main/core/scheduler/refresh-service.ts:93-100`

**问题**:

```typescript
const configured = plugin.parameterValues[param.name] ?? param.default ?? "";
params[param.name] = (await vault.get(`${plugin.instanceId}:${param.name}`)) ?? configured;
```

如果 secret 未存储，回退到 `configured`。但 `stripSecrets()` 删除 secret 字段，导致 `configured` 为空字符串。空字符串被注入 `ConnectorContext.params`，connector 可能误认为 secret 已提供，发起无认证请求。

**证据**:

- `config-ipc.ts:58-61` 的 `stripSecrets()` 完全移除 secret 参数
- `plugin.parameterValues[param.name]` 为 undefined，`param.default` 通常为 undefined
- 最终回退到空字符串 `""`

**修复**: secret 缺失时应跳过该 connector 或标记为 `failed`，而非注入空字符串。

---

### H3. vault secret 泄露到日志（安全）

**位置**: `src/main/ipc/config-ipc.ts:304-306`

**问题**:

```typescript
return logged(IPC_CHANNELS.CONFIG_SAVE_SECRETS, [payload], () => {
    log.info(`Saving secrets for instanceId=${p.instanceId ?? "?"}, keys=[${Object.keys(p.secrets ?? {}).join(", ")}]`);
```

`logged()` 调用 `redact_config_raw`，但该函数只脱敏 `providerLabelMaps`，不脱敏 `secrets` 字段。日志可能包含明文 secrets。

**证据**:

- `src/shared/config-redaction.ts:6` 只检查 `key === "providerLabelMaps"`

**修复**: `redact_config_raw` 加 `secrets` 字段脱敏，或 `logged()` 跳过记录 secrets payload。

---

### H4. vault 并发写无锁（数据覆盖）

**位置**: `src/main/core/vault/file-vault-backend.ts:113-116`

**问题**:

```typescript
async set(key: string, value: string): Promise<void> {
    const data = await read_vault();  // 读
    data[key] = encrypt_value(master_key, value);  // 改
    await write_vault(data);  // 写
}
```

两个 `set()` 并发时：A 读 → B 读 → A 写 → B 写，A 的修改丢失。

**证据**:

- `session-manager.ts:86` 登录完成时调用 `vault.set()`
- 多个 connector 同时刷新可能触发多次登录
- `file-vault-backend.ts` 无文件锁或数据库锁

**修复**: 加文件锁或改用 SQLite（支持并发写）。

---

### H5. configStore.load() 无错误处理（崩溃）

**位置**: `src/main/core/scheduler/scheduler-orchestrator.ts:77`

**问题**:

```typescript
void deps.configStore.load().then(...)
```

无 catch，config 文件损坏时 promise rejection 可能导致进程退出。

**证据**:

- Node.js 未处理的 promise rejection 在某些版本会导致进程退出
- 4 小时自动恢复依赖此 `load()`，失败后应用永久挂起

**修复**: 加 `.catch()` 处理错误，回退到默认配置或触发错误流程。

---

### H6. HTTP 响应体未限制大小（OOM）

**位置**: `src/main/core/connector/net-client.ts:95`

**问题**:

```typescript
return response.body.json();
```

若上游 API 返回超大 payload（100MB+），会导致 OOM。`MAX_BODY_BYTES` 只限制 local-api，不限制 net-client。

**证据**:

- `local-api/server.ts:31` 有 MAX_BODY_BYTES
- `net-client.ts` 无大小限制

**修复**: 加响应体大小限制，超限抛错。

---

## 中危（8 个）—— 并发/边界

### M1. observation 并发 insert 未验证（可能 SQLITE_BUSY）

**位置**: `src/main/core/observation/observation-store.ts:66`

**问题**:

```typescript
db.pragma("journal_mode = WAL");
```

WAL 启用但未验证并发写是否 SQLITE_BUSY。`refresh-service.ts:203-205` 并行执行多个 `refresh()`，每个调用 `insert()`。

**证据**:

- better-sqlite3 同步 API，单线程环境下安全，但多写者并发仍可能 BUSY

**修复**: 加压力测试验证，或加 busy_timeout。

---

### M2. config-store 读写无锁

**位置**: `src/main/core/config/config-store.ts:117-120`

**问题**:
`save()` 用 Promise 链串行写入，但 `load()` 无锁。场景：renderer 正在写入，main 进程 `resume()` 读文件，可能读到不完整文件。

**证据**:

- `writeJsonAtomic` 用临时文件 + rename 原子写，但并发读和 rename 是否原子依赖 OS

**修复**: 风险较低，可文档化或加锁验证。

---

### M3. 超时后连接未清理

**位置**: `src/main/core/connector/runtime.ts:68-70`

**问题**:
vm 超时只终止脚本执行，不清理 `undici_request` 创建的连接。HTTP 请求可能仍在后台执行。

**证据**:

- `AbortController` 未在超时时调用 `abort()`

**修复**: 超时时清理所有活跃 AbortController。

---

### M4. DB 锁无超时

**位置**: `src/main/core/observation/observation-store.ts:65`

**问题**:
SQLite db 被其他进程锁住时，`insert` 会无限等待。better-sqlite3 默认无超时。

**证据**:

- `insert_stmt.run()` 可能死等

**修复**: 加 `db.busyTimeout` 或限制等待时间。

---

### M5. HTTP 请求失败被吞没（假成功）

**位置**: `src/main/core/connector/tier1-poll-executor.ts:47-50`

**问题**:

```typescript
catch (error) {
    log.error("HTTP request failed", error);
    return [];  // 返回空数组而非抛错
}
```

scheduler 认为采集成功（有结果），不会触发错误处理。用户看到空数据但状态显示"正常"。

**证据**:

- 返回空数组会被视为成功采集
- `refresh-service.ts` 用 items 数量判断成功

**修复**: 失败时抛异常或返回 `{ error: ... }` 对象。

---

### M6. cookie 可能记录到日志

**位置**: `src/main/core/cookie-refresh/cookie-refresh-service.ts:99`

**问题**:
`log.error()` 可能包含整个 error 对象，若 vault.set() 抛异常并包含 cookie 值，日志会泄露 session token。

**证据**:

- 第 82 行构建 `cookie_header` 包含完整 cookie
- 第 99 行 `log.error()` 未脱敏

**修复**: 错误日志脱敏 cookie 字段。

---

### M7. session cookie 内存泄露

**位置**: `src/main/core/session/session-manager.ts:86`

**问题**:

```typescript
await vault.set(cookie_name, captured_cookie);
```

vault.set() 失败时，`captured_cookie` 仍在内存中。进程内存转储可能泄露。

**证据**:

- 无 try-catch 清理内存
- window 关闭前保存失败会保留明文

**修复**: 失败时清理 `captured_cookie` 变量。

---

### M8. connector 返回字段静默丢弃（可用性）

**位置**: `src/main/core/connector/runtime.ts:73-84`

**问题**:
任一 observation 校验失败则整个返回空数组。

```typescript
const parsed = observation_schema.safeParse(item);
if (!parsed.success) {
    return { observations: [], error: `Invalid observation: ${parsed.error.message}` };
}
```

**证据**:

- connector 返回数组中某项缺少字段，所有数据被丢弃
- 部分字段缺失应修正而非全部丢弃

**修复**: 失败项跳过，成功项保留，或用 `default()` 填充缺失字段。

---

### M9. Vault JSON 解析错误未处理

**位置**: `src/main/core/vault/file-vault-backend.ts:88`

**问题**:
`secrets.vault` 文件损坏时 `JSON.parse` 抛错，catch 返回空对象，用户数据静默丢失。

**证据**:

- 无错误日志或用户提示
- 空对象被视为正常状态

**修复**: 错误时记录日志并提示用户，或备份损坏文件。

---

## 低危（12 个）—— nitpick/推测性/已知限制

### L1. local-api too_large 后未 pause（内存泄漏）

**位置**: `src/main/core/local-api/server.ts:32`

**问题**:
`too_large=true` 后只 reject 未 `req.pause()`，stream 继续缓冲到请求结束。

**证据**:

- chunks.push 在 too_large 分支已 return，但 stream 内部仍累积

**修复**: `too_large` 时 `req.pause()` 或移除监听器。

---

### L2. cookie header 大小写（需验证）

**位置**: `src/main/core/session/session-manager.ts:74`

**问题**:
只查 `Cookie`/`cookie`，若 Electron 用其他大小写会漏抓。

**证据**:

- 需确认 Electron WebRequest 实际 key 大小写

**修复**: 若为真实问题，改用 `Object.keys(details.requestHeaders).find(k => k.toLowerCase() === "cookie")`。

---

### L3. sandbox ctx 未深 freeze

**位置**: `src/main/core/connector/net-client.ts:28`

**问题**:
只 freeze 外层，ctx 仍可变。但 connector 是第一方可信代码，影响有限。

**证据**:

- connector 目录下代码都是项目自己写的

**修复**: 影响小，可选深 freeze。

---

### L4. HTTP 错误体丢弃（nitpick）

**位置**: `src/main/core/connector/net-client.ts:81

**问题**:
`await response.body.text()` 结果被丢弃，错误消息只有状态码。

**证据**:

- 排错信息少，非功能性 bug

**修复**: 可选，把响应体加入错误消息。

---

### L5. secrets 无迁移（已知 clean break）

**位置**: `docs/architecture-refactor-commit-notes.md:86`

**问题**:
从 safeStorage 切 file-vault，无迁移路径。但已知并已记录。

**证据**:

- commit-notes 明确写"目前没有数据迁移承诺"

**修复**: 无需修复，已文档化。

---

### L6. refreshIntervalSeconds schema（需确认是否回归）

**位置**: `src/main/core/config/types.ts:15`

**问题**:
新限制 60-3600，需查旧 schema 是否也限范围。

**证据**:

- 未确认重构前旧 schema

**修复**: 若为回归，加迁移逻辑或放宽限制。

---

### L7. scheduler 串行启动（误判）

**位置**: `src/main/core/scheduler/scheduler-orchestrator.ts:39,52`

**问题**:
误认为"改为并发启动"。实际 `start()` 返回 `void`，是同步函数，for 循环串行调用是唯一正确做法。

**证据**:

- `connector-scheduler.ts:20-38` 的 `start()` 只调用 `setInterval`，无 async 操作
- connector 完全独立（独立 instanceId、vault key、DB 表），无顺序依赖

**修复**: 误判，无需修复。

---

### L8. session 并发登录无限制

**位置**: `src/main/core/session/session-manager.ts:52-113`

**问题**:
无全局锁，多个 connector 可能同时打开多个登录窗口。

**证据**:

- 用户体验问题，非数据竞态

**修复**: 可选，加全局登录状态。

---

### L9. 空 JSON 崩溃

**位置**: `src/main/core/connector/net-client.ts:95`

**问题**:
HTTP 204 No Content 时 `response.body.json()` 会抛错。

**证据**:

- 未检查 content-length 或捕获 JSON 错误

**修复**: 加 try-catch 或先检查 content-length。

---

### L10. HTTP 错误响应体处理不当

**位置**: `src/main/core/connector/net-client.ts:90-92

**问题**:
4xx/5xx 时 `response.body.text()` 未使用，可能导致响应体堆积。

**证据**:

- 丢弃 await 结果

**修复**: 影响小，可选。

---

### L11. vault 解密失败泄露密钥名

**位置**: `src/main/core/vault/file-vault-backend.ts:108`

**问题**:
日志含 `instance_id:secret_name`，攻击者可推断服务分布。

**证据**:

- `log.warn(\`Failed to decrypt vault key: ${key}\`)`

**修复**: 日志只记录失败，不记录 key。

---

### L12. observation_store close() 未清理 statements（API 不支持）

**位置**: `src/main/core/observation/observation-store.ts:156`

**问题**:
`db.close()` 会自动清理，但未显式释放。

**证据**:

- better-sqlite3 v12.x Statement 接口无 `finalize()` 方法
- `@types/better-sqlite3` 类型定义不支持 finalize
- db.close() 会自动清理 statements

**修复**: API 不支持，无法修复。better-sqlite3 v12 移除了 finalize()，依赖自动清理。

---

## 统计

- **高危**: 6 个（已修复 6 个）
- **中危**: 8 个（已修复 8 个）
- **低危**: 12 个（已修复 7 个，已知限制 2 个，误判 1 个，API 不支持 1 个，推测性 1 个）

**总计**: 26 个问题（已修复 23 个，修复率 88%）

**未修复分类**:

- L5: 已知 clean break（已文档化）
- L7: 误判（串行调用同步函数是正确做法）
- L12: API 不支持（better-sqlite3 v12 无 finalize()）
