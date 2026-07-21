# Task spec

## 背景

设置页删除直连账号（GLM、MiniMax 等内置 connector 实例）后，当前运行期间消失；重启应用后账号重新出现。

根因（已确认，纯函数反馈环稳定复现两次）：删除仅 `config.plugins.filter(...)` 移除该实例（`SettingsView.tsx:2180`），未留下任何"已删除"记录。启动时 `auto_seed_connectors`（`src/main/core/config/auto-seed.ts`）把内置 connector 定义与现有 plugins 对比，缺失即视为首次安装，用新 `instanceId/stateId` 重新 seed（`src/main/index.ts:161`）。于是被删实例每次重启复活。

复现命令与输出（Phase 1 反馈环，已运行 ≥2 次）：

```bash
pnpm exec tsx -e 'import { auto_seed_connectors } from "./src/main/core/config/auto-seed.ts";
const definitions = ["glm","minimax"].map((id)=>({directory:`C:/app/connectors/${id}`,executablePath:`C:/app/connectors/${id}`,manifest:{id,provider:id,capabilities:["script"],parameters:[],script:{entry:"connector.ts"}}}));
const r = auto_seed_connectors([], definitions); console.log(r.seeded.length, r.seeded.map(p=>p.name).join(","));'
# 输出：2 GLM,MINIMAX  （空 plugins + 定义存在 → 全部当新连接器复活）
```

## 范围

- 删除路径持久化 tombstone：在 `config.json` 记录被删除 connector 的 manifest `id`（非 instanceId），`auto_seed_connectors` 跳过 tombstone 中的 id，不再复活。
- `AppConfiguration` schema（`src/shared/types/config.ts` + `src/main/core/config/types.ts`）加可选字段（如 `removedConnectorIds: string[]`）。
- `auto_seed_connectors` 入参增加已删除 id 集合，seed 循环跳过命中项；保留 A10 精确匹配语义。
- 删除 IPC/前端：`SettingsView.tsx` 删除确认 `onConfirm` 写入 tombstone（与 filter 同一次 `save_config`）。
- 单测：`tests/unit/main/core/config/auto-seed.test.ts` 加 tombstone 跳过回归；`config-ipc` 加删除写 tombstone 回归。

## 非范围

- 不改 CPA 子账号隐藏（domain 不变量 8：CPA 账号只能隐藏）。
- 不清理已删除实例的 observation 历史 / vault secret（另议；本 task 只阻断复活）。
- 不改 `.bak` 恢复链路（已排除为根因）。

## 验收标准

- [ ] 删除一个内置 connector 后重启，该 connector 不再自动出现（集成/e2e 回归）
- [ ] `auto_seed_connectors` 对 tombstone id 返回 0 seeded（单测）
- [ ] 未删除的内置 connector 仍正常 auto-seed（不误伤，单测）
- [ ] `pnpm test` 全绿；`pnpm typecheck` 过
- [ ] 真实打包启动验证：删除 → 重启 → 确认不复活

## 依赖与约束

- 约束：tombstone 须可被旧版本忽略（新字段可选，schema 向后兼容；旧版读到新字段 safeParse 不会失败）。
- 关联 domain.md 不变量 8（所有权决定可删除性）：直连可删除，须是"真删除"。
