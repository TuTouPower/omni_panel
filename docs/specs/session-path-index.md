# 会话文件路径持久索引

## 背景

会话面板/会话库首次打开慢：`resolve_session_file` 无 session_id → 文件路径持久索引，每次冷定位都是一次整棵会话目录树的递归扫描。定位缓存只是进程内 Map，重启即冷，每次启动后首次打开重复扫描。需要建立跨重启的持久索引，命中即免整目录递归扫描。

## 范围

- 为各来源（claude_code / kimi_code / grok / opencode）建立 session_id（含 env 维度）→ 会话文件路径的持久化索引，应用重启后仍可命中。
- 命中索引的定位不再执行整目录递归扫描；索引失效（文件移动、删除、内容变化）时自动回退到现有扫描定位，并更新索引。
- collector 扫描到新会话或会话文件变化时，索引随之更新。
- WSL 用户名探测结果在进程内与跨重启两个层面缓存，不再随每次 resolve 重复探测。

## 非范围

- 不改变会话摘要、消息内容的提取与展示逻辑。
- 不改变 token-stats collector 的扫描范围与写入时机。
- 不做消息内容搜索索引。

## 验收标准

- [x] AC1：应用重启后首次打开会话面板，已在索引中的会话定位不再触发全目录递归扫描。
- [x] AC2：索引中的文件被移动或删除后，对应会话仍能按现状语义完成定位（回退扫描）或正确报告缺失，且索引被修正，后续定位不再重复失效路径。
- [x] AC3：新出现的会话文件在 collector 扫描后可被正常定位与打开。
- [x] AC4：同一批会话在一次会话内被反复定位时，不产生重复的全目录扫描与重复的 WSL 用户探测。
- [x] AC5：会话打开、摘要显示、消息加载的用户可见结果与现状一致，无功能回归；现有测试与 e2e 全部通过。

## 实现要点

- `src/main/core/session-history/session-path-index.ts`：持久索引存储（`<dataRoot>/session-path-index.json`），同步原子写（tmp+rename）；损坏/版本不符整体丢弃重建（等价退回扫描）；含 `wsl_user_cache`（distro→user）跨重启缓存。条目含 `paths_key` 签名防跨配置命中旧路径。
- `src/main/core/session-history/session-locator.ts`：`resolve_session_file` 三阶段——①进程内缓存（paths_key+mtime/size 校验）②持久索引（跨重启命中，stat 校验 + paths_key 校验）③扫描。命中返回免整目录递归扫描；失效回退扫描并修正索引。`effective_wsl_user` 探测结果进程内缓存 + 随索引跨重启缓存；探测失败（空串）不写负缓存，下次重探测自愈。
- AC3 被动实现：新文件出现后 resolve miss → 回退扫描发现 → 回填索引；不依赖 collector 主动联动（utility 进程隔离）。
- 写盘失败仅记日志跳过，回退扫描定位（`persist_index_entry` / `effective_wsl_user` 均 try/catch）。

## 测试覆盖

- `tests/unit/main/core/session-history/session-path-index.test.ts`：AC1 跨重启命中 readdir 计数=0、AC2 删除/移动回退 + 索引修正、AC3 新文件回填、AC4 反复定位不重复扫描 + WSL 探测一次、索引损坏重建、f001 负缓存重探测、f003 paths_key 跨配置隔离。
- `tests/unit/main/core/session-history/session-locator.test.ts`：既有 10 例回归未动。
- `pnpm test` 全量 + `pnpm test:e2e:electron` + `pnpm test:packaged`（打包形态下索引写盘正常）。
