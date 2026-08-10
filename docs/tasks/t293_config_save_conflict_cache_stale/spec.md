# Task spec

## 背景

来源：Grok 全仓评审（2026-08-11）Issue 2。`src/main/ipc/config-ipc.ts` 并发 save 冲突检测调用 `configStore.load()` 与合并前快照比 JSON；`createConfigStore` 在 `save()` 完成前从内存缓存服务 load（`config-store.ts` ~201-205/390-394）。两个重叠的 `CONFIG_SAVE` / web `POST /v1/config` 都读到同一缓存、都过 CONFLICT 检查、都调 save——后写静默覆盖先写（plugins/settings lost update）。内存缓存使冲突检测观察不到进行中的对端写入。

## 契约区

### 范围

- 并发 config save 冲突检测改为可观测进行中写入：单调 generation/内容 hash（仅成功 save 后更新），在 save 互斥下做冲突检查；或 merge+validate 放入获取锁后的单临界区（重读而非读 stale 缓存）
- 补并发冲突回归测试（重叠 save，断言后写不静默覆盖先写，冲突被拒绝/合并语义正确）

### 非范围

- config-store 缓存机制整体重构（仅冲突检测语义修复）
- 非并发路径的 save 行为调整

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：两个重叠 CONFIG_SAVE（第二个在第一个 save 完成前发起、基于同一旧快照）不再双双通过冲突检查——后写要么被冲突拒绝、要么合并后语义正确，先写变更不静默丢失
- [ ] AC-002：重叠 save 场景下最终落盘 config 与「按序执行」结果一致（单测断言，非 flaky）
- [ ] AC-003：单线程正常 save 路径行为不变（既有测试全绿）

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：单测用受控 Promise 控制 save 完成时机，构造重叠写断言冲突检测。

## 上下文区

- 来源：Grok 全仓评审 Issue 2（config-ipc.ts:193 / config-store.ts 缓存）

### 测试策略

- 单测：config-ipc 并发 save 用例（重叠 save + 延迟完成）+ config-store 冲突检测单测
- mock 边界：不 mock 冲突检测核心；仅 mock save 存储层完成时机
