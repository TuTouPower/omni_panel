# Task review t195（reviewer_focus: 测试）

- task：`t195_config_save_cache_debounce`
- spec：`docs/tasks/t195_config_save_cache_debounce/spec.md`
- diff_anchor：`33c3773698023b903bbc3dd809f2eb987fb6b8b7`
- target：`git diff 33c3773698023b903bbc3dd809f2eb987fb6b8b7`（含工作区未跟踪新增文件：`script-cache.ts`、`config-debounce.ts` 及对应测试）
- round：1
- reviewed_at：2026-08-03 22:55 UTC+8

## Findings

### t195_test_f001 - vault 冷镜像测试名与注释声称的场景未真正实现

- 严重度：minor
- 锚点：AC3 覆盖完整性（不阻断；覆盖意图存在但未落实）
- 位置：`tests/integration/vault/file-vault-backend.test.ts`（用例 "a new backend instance starts with a cold mirror that reads disk"）
- 问题：测试名与行内注释声明要「篡改盘上文件新增 entry 后，新实例冷镜像会读到它（与热镜像不同）」，但代码 `const on_disk = JSON.parse(await readFile(vault_path, "utf8"))` 后紧跟 `void on_disk;`，从未把改动写回盘。实际验证的仅是「新实例从盘读到 `set` 写入的 `cold-1`」，与同一 describe 内 "set writes through to disk so a new backend instance can read the value" 用例完全重复。声明的关键场景（热镜像缺盘上新值、冷镜像能读到）没有证据。
- 建议：把新增 entry 真正写入盘上文件（`writeFile(vault_path, ...)`），再断言新实例 `fresh.get("cold-1")` 读到新值、同一热镜像 `vault.get` 读不到；或将用例删除并只在结论注明意图已被写穿用例覆盖。

### t195_test_f002 - AC2「并发读改写」无专门测试，测试策略承诺的该场景只覆盖了并发写

- 严重度：minor
- 锚点：AC2（并发读改写下不出现脏读或丢失）；覆盖不完整但非完全缺测
- 位置：`tests/integration/config/config-store.test.ts`（memory cache describe 块）
- 问题：上下文区测试策略声明「config-store 测试用真实文件 IO 验证缓存命中、save 失效、并发读改写、ENOENT 与损坏处理」。现有并发覆盖仅 t111 遗留的 "serializes concurrent saves so final state is consistent"（并发写-写）；t195 新增用例全是顺序 save/load。「并发读改写」（load 与 save 交错）没有直接测试。丢失侧由并发写用例覆盖，脏读侧由「save 在 doSave 写盘成功后才更新缓存」设计保证但无测试证据。
- 建议：补一个交错用例——多个 `load()` 与 `save()` 并发，断言最终 `load()` 返回最后一次 save 的结果、过程不出现部分写入；severity 维持 minor，属「可加 case」级扩展。

### t195_test_f003 - runtime 预编译测试名声称「skipping transpile」但未直接断言 transpile 被跳过

- 严重度：minor
- 锚点：AC3（不重新 transpile）；覆盖意图存在、断言力度偏弱
- 位置：`tests/integration/connector/runtime.test.ts`（用例 "runs with precompiled code, skipping transpile (t195)"）
- 问题：用例传入 `compile_script(script)` 结果后仅断言 `result.error` 为 null、observations 为空，证明「预编译代码可正常执行」，但未证明 `run_connector` 内部确实跳过 transpile（未 spy `compile_script` 验证其未被调用）。「跳过 transpile」的证据实际来自 `script-cache.test.ts` 的 mtime 命中用例，本用例命名有夸大。
- 建议：`vi.spyOn` 已被导出的 `compile_script`，断言传入 `compiled_code` 时内部不调用它；或改名弱化为「runs with precompiled code」。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 改测方向复核：三处既有测试改动均为 spec 语义变化驱动，覆盖保留，无「迁就实现」的改测：
    - `config-store.test.ts` 日志用例改用新实例模拟冷缓存重读盘（load 命中缓存语义）。
    - `config-store.test.ts` 两个 prune 用例改为「load 保留非法/孤儿插件 + 显式 `prune_unhealthy_plugins()` 清理」，prune 清理与持久化断言均保留，并新增健康时不裁剪用例。
    - `secrets-store.test.ts` 损坏 ciphertext 用例改用新实例冷镜像，验证「解密失败返回 null 不抛错」语义保留。
- 本轮新发现：3 条，全部 minor。
- 未进表的提示：
    - AC4 的「UI 乐观更新」无 renderer 组件测试，仅 `config-debounce.test.ts` 覆盖持久化/防抖侧；PopupView 的乐观更新是 React state 同步更新，项目无 renderer 组件测试基建，接受为范围外观察。
    - `proxy_config_changed` 用 `JSON.stringify` 比较前后 proxy 块，对象键顺序不稳定会误判变化；config 经 zod parse 字段顺序稳定，且单测覆盖了值变化判定，属实现层观察（code reviewer 职责），未进 finding。
    - 各 mock configStore 的测试文件新增 `prune_unhealthy_plugins` 为接口类型补全，非 mock 误用。
- 总体判断：AC1–AC6 均有对应测试且触达生产逻辑（真实文件 IO + 真实时钟/fake timers 边界正确），危险模式扫描无命中，改测均属语义变化驱动；仅 3 条 minor，无未解决 critical / important。
- 系统性 follow-up：无。

verdict: PASS
