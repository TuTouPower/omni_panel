# Task spec

## 背景

T001 修复 preload 层 route 同步后，代码层 route 真相完全统一为 `usage`/`setting`/`tray`/`agent`（`agent` = TokenStatsView）。文档（specs/blueprint）仍写旧值 `popup`/`settings`，且缺 `agent` route / TokenStatsView 描述。

## 范围

- `docs/specs/ui-views.md`：
    - L7 `route=popup` → `route=usage`
    - L33 `route=settings` → `route=setting`
    - 补 `TokenStatsView（route=agent）` 章节
- `docs/specs/window-management.md`：
    - L9 key/route `popup` → `usage`
    - L10 key/route `settings` → `setting`
    - 补 `agent` 行（900×700, frame:true, TokenStatsView 独立窗）
    - L13 URL 顺序 `#<route>?ou_theme` → `?ou_theme=<dark|light>#<route>`（代码 query 在前 hash 在后）
- `docs/blueprint/architecture.md` L103：route 分权值 `popup/settings/tray` → `usage/setting/tray/agent`
- `docs/specs/ipc.md` L27：grok route 表述 `popup` → `usage`（若涉及）

## 非范围

- 不改代码（属 T001）
- 不扫其他 specs 的非 route 落后（另开 task）

## 验收标准

- [ ] `grep -rn "route=popup\|route=settings" docs/` 无匹配
- [ ] `grep -rn "popup/settings/tray" docs/` 无匹配（architecture L103 已改）
- [ ] ui-views.md 含 TokenStatsView 章节
- [ ] window-management.md 含 agent 行
- [ ] `pnpm test` 仍全绿（文档改动不影响代码）

## 依赖与约束

- 依赖 T001 确认 route 真相（usage/setting）已统一
