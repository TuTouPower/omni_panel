# V2 审阅 #2（spec + plan 修正版）

> 日期：2026-06-13
> 逐项对照上轮审阅的P0/P1/B/G/R 问题

## 结论

**改进显著。上轮 5 个 P0/P1 问题全部修复，4 个 B/G/R 问题全部修复。可从"不能执行"升为"可执行（有 4 处小修）"。** 两文档现在一致，spec → plan 可追溯。

---

## 已修复（共 9 项）

| 上轮编号 | 问题                                                                                              | 状态        |
| -------- | ------------------------------------------------------------------------------------------------- | ----------- |
| P0-1     | SQLite UNIQUE INDEX → 改为非唯一 idx_lookup + append-only                                         | ✅          |
| P0-2     | isolated-vm 无退路 → spec §4.3 双后端 + PoC gate，§13 清单                                        | ✅          |
| P0-3     | better-sqlite3 风险未提 → spec §2.2 标注原生模块风险 + §13 PoC                                    | ✅          |
| P1-1     | Windows 0600 无效 → spec §3.1 加 icacls ACL                                                       | ✅          |
| P1-2     | 模块去向缺失 → spec §9.1 完整映射表（20+ 行）                                                     | ✅          |
| B1       | runtime 返回值拷贝 → Task 4 PoC 加 return-array 用例，Task 6 加 copy-out 逻辑                     | ✅          |
| B2       | `require("crypto")` → `import { randomBytes }`                                                    | ✅          |
| B3       | unused 变量/import → 清理干净                                                                     | ✅          |
| B4       | Task 1 import 路径少一层 → 改为 `../../../src`                                                    | ✅          |
| G1       | 缺失 NetClient → **新增 Task 7**（undici + auth 注入 + endpoint/proxy）                           | ✅ 关键补缺 |
| G2       | 推迟项未标注 → Task 9 标"本期不做探测自适应"，Task 10 标"本期不做网关"                            | ✅          |
| R1       | 清理目标找错文件 → Task 15 正确列出 `runner.ts` + `refresh-service.ts`（7 处 raw 日志）           | ✅          |
| R2       | stub 路径错/会被删 → Task 12 写"复制到 `tests/integration/connector/_helpers/`，不在 P7 删除范围" | ✅          |
| 自审     | 假 snake_case 声明 → 改为"沿用 kebab-case，两套命名并存"                                          | ✅          |

---

## 剩余问题（4 处，均不阻塞执行）

### 1. spec 与 plan 的 Observation 字段命名不一致

- **spec §2.1** 的 `interface Observation` 用 **camelCase**（`sourceInstanceId`, `accountId`, `observedAt` 等）
- **plan** 全部用 **snake_case**（`source_instance_id`, `account_id`, `observed_at`）
- Plan 自审清单最后一条写明 Observation 用 snake_case

这是 spec 没同步到 plan 的决定。**修 spec §2.1 的 interface 为 snake_case** 即可对齐，5 分钟。

### 2. spec §10 差异表 still 只写 `runner.ts:10-12`

§3.3 已补了 `refresh-service.ts:49`，但 §10 "should_log_raw_debug() | 删除"行的影响文件列仍只写 `runner.ts:10-12`。应一致。

### 3. Task 7 NetClient 测试：`server_port` 在模块顶层使用但异步赋值

```ts
// tests/integration/connector/net-client.test.ts（计划第 1639 行附近）
const test_manifest: Manifest = {
    ...
    endpoints: { default: `http://127.0.0.1:${String(server_port)}` },
    // 模块加载时 server_port 为 undefined
};
```

`server_port` 在 `beforeAll` 的 `server.listen` 回调里才赋值，但 `test_manifest` 在模块作用域构造，此时 `server_port` 是 `undefined`。实际运行时 endpoints 会变成 `http://127.0.0.1:undefined`。

**修**：把 `test_manifest` 放进 `beforeAll` 或工厂函数。或者用例里不依赖 manifest 的 endpoints，改测 override 路径。

### 4. Task 7 NetClient 测试：生成密钥对但未使用

```ts
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const cert = ""; // self-signed cert for test
// Use HTTP stub instead for simplicity in CI
```

两变量声明后从未引用。`pnpm lint --max-warnings=0` 会挂（unused）。删掉这 3 行。

---

## 改进评价

- **spec §13 原生模块 PoC** 是两个原生模块的验证清单，isolated-vm 验证异步返回值、宿主函数注入、超时中断（上轮 B1 的根因），better-sqlite3 验证 ABI rebuild + WAL。具体可执行。
- **spec §12 阶段映射表** 把源 v2 的 4 阶段和本 spec 的 7 阶段对应关系说清，不再各说各话。
- **plan Task 7（新增 NetClient）**：auth 注入从 Vault 取 secret 后注入 Authorization 头，endpoint override 优先于 manifest 默认值，proxy 走 `ProxyAgent`。方向对。注意目前 `build_auth_headers` 只处理 `poll` 的 auth（`observe.probe` 也需要 auth 但属于后续迭代范围，可接受）。
- **plan Task 15（清理）**：删 cleanly plugin/cache/sdk + `crypto-backend.ts` + `safe-storage-crypto.ts` + `refresh-service.ts` 的 7 处 raw 调试日志。清理清单完整，不再漏文件。

---

## 行动

修以上 4 项（都是单行级改动，不涉及设计变更）即可开工。P1（Task 1-3）可以不等这些修完先启动——Observation schema/类型与后续代码一致即可。
