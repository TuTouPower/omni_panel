# Task spec

## 背景

route 机制重构（window-manager `WINDOW_CONFIGS` + renderer `use-route.ts` VALID_ROUTES 已统一用 `usage`/`setting`/`tray`/`agent`），漏改 preload 层。`preload/index.ts` switch case 仍用 `"settings"`（带 s）、fallback `"popup"`；`route_api.ts` 判定仍 `route === "settings"`。

后果：设置窗 URL hash 为 `setting`（window-manager L42），preload `case "settings"` 不匹配 → 走 default 分支 → `saveSecrets` no-op → 设置窗无法保存密钥。grok 分权同理失效（设置窗拿 readonly 而非 settings_api）。

## 范围

- `src/preload/index.ts` L335：`|| "popup"` → `|| "usage"`
- `src/preload/index.ts` L341：`case "settings"` → `case "setting"`
- `src/preload/route_api.ts` L8：`route === "settings"` → `route === "setting"`
- `tests/unit/preload/route_api.test.ts`：同步断言（`"settings"` → `"setting"`；`"popup"` → `"usage"`）

## 非范围

- 不动 `window-manager.ts` / renderer（已是真相源）
- 不改文档（属 T002）

## 验收标准

- [ ] `pnpm test` 全绿（含 `route_api.test.ts` 断言更新后通过）
- [ ] `preload/index.ts` route 相关无 `"popup"` / `"settings"` 残留
- [ ] `route_api.ts` 判定为 `route === "setting"`

## 依赖与约束

- 无
