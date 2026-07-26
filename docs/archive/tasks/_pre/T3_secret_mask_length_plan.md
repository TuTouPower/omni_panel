# T3 Plan: 已存密钥明文回填 + 等长掩码

## 复杂度

**L**（改安全边界 + IPC + 多表单）

## 方案

### 1. 新 IPC（推荐按 instance 按需拉取）

```ts
// config:getSecrets
// request: { instanceId: string }
// response: { secrets: Record<string, string> }  // 仅该实例 vault 中存在的 secret 参数
```

- 白名单：仅 `secretParamKeys` 允许的 param 名。
- 主进程：`secretsStore.get` / vault `get(keyFor(instanceId, name))`。
- preload 白名单暴露 `config.getSecrets`。
- **不要**在 `config.get` 里默认塞全量明文（减少常驻暴露）。

可选：`config:getSecret({ instanceId, name })` 单条；批量更省 IPC。

### 2. 表单回填

| 组件                    | 改动                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `SettingsForm`          | mount/展开时 `getSecrets(instanceId)`，secret 字段 `defaultValue`/`value` = 明文；删 `SECRET_PLACEHOLDER` 假长度逻辑 |
| `CpaConnectorSettings`  | 打开时拉 `cpa_mgmt_key` 明文，替换 `***`                                                                             |
| `SettingsView` 内联密钥 | 同上                                                                                                                 |
| `AddAccountDialog`      | 新建无 vault，不变                                                                                                   |

与 T2 `SecretInput`：始终可睁/闭真文；T4 简化为普通 password UX。

### 3. 保存逻辑

- 提交时：value 非空则写入（可与旧值比较，相同则 skip）。
- 删除「占位符不提交」分支，改为「空串 = 不更新 / 或明确清除」——**默认空串不更新 vault**（避免误清空）。

### 4. 文档

实现 commit 内更新 blueprint：secret-vault / domain / ipc / prd / architecture。

### 5. 测试

- unit/integration：mock vault → getSecrets 返回明文
- SettingsForm：has 配置时 input value 为真密钥
- 日志测试：getSecrets 路径不 log 明文

## 文件清单（预计）

- `src/shared/types/ipc.ts` — channel + API 类型
- `src/preload/index.ts`
- `src/main/ipc/config-ipc.ts` — handler
- `src/renderer/hooks/use-config.ts` — 可选 `loadSecrets`
- `SettingsForm.tsx` / `CpaConnectorSettings.tsx` / `SettingsView.tsx`
- `tests/...`
- blueprint 若干 md

## Commit（可拆）

```
feat(secrets): allow settings UI to load vault plaintext for edit
fix(ui): show real secret length under password mask
docs(security): update secret exposure model for settings reveal
```

## 依赖

- T2（SecretInput 眼睛）可并行或先做。
- T4 改为轻量确认项（见更新后 T4）。
