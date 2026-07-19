# Task review T002

- task：`T002_docs_route_sync`
- spec：`spec.md`
- target：本 task 未提交改动（working tree：architecture.md / ipc.md / ui-views.md / window-management.md / tasks_index.md）
- reviewer_focus：文档+代码
- reviewed_at：2026-07-20 03:25 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。

## 交叉验证结论（对照代码真相）

| 文档改动                                     | 代码真相来源                                                                                                        | 一致性 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------ |
| ui-views L7 `route=usage`                    | `App.tsx` default→PopupView；`WINDOW_CONFIGS.usage.route`                                                           | ✅     |
| ui-views L33 `route=setting`                 | `App.tsx` case "setting"；`WINDOW_CONFIGS.setting.route`                                                            | ✅     |
| ui-views L72-82 TokenStatsView               | `TokenStatsView.tsx` 全组件 import + `lib/token-stats/{filter,aggregate,chart-data}.ts` 导出名                      | ✅     |
| window-mgmt 四行表                           | `WINDOW_CONFIGS`（usage 482×480 min472 max780 / setting 820×660 / tray_menu route=tray / agent 900×700 frame:true） | ✅     |
| window-mgmt URL `?ou_theme#route`            | `getRendererUrl` 返回 `` `?ou_theme=${theme}#${route}` ``                                                           | ✅     |
| architecture L103 `usage/setting/tray/agent` | WINDOW_CONFIGS 四 key + App.tsx 四分支                                                                              | ✅     |
| ipc L27 `setting/usage/tray/setting-only`    | preload route switch（case "setting"/"tray"/default usage）                                                         | ✅     |
| ipc L34 `usage/tray no-op`                   | preload default/tray 分支 getSecrets/saveSecrets no-op                                                              | ✅     |

**非 route 语义正确保留（未误改）**：`settings:open` 等通道名、`settings-close-action.ts` 文件名、`mainPanelMode` 值 `popup/floating`、`popup:reportContentHeight` 通道、size-validation "守 popup 尺寸" —— 均非 route 语义，保留正确。

## Findings

### T002_code_f001 — spec.md 自身导致验收 grep 永自匹配

- 严重度：low
- 位置：`docs/tasks/T002_docs_route_sync/spec.md:10-11,28`
- 问题：验收标准 `grep -rn "route=popup\|route=settings" docs/` 无匹配，但 spec.md L10/L11 描述了 "`route=popup`→`route=usage`" 等 before→after，L28 又写了该 grep 命令本身，三者都会被 `grep docs/` 命中。即验收条件天然无法通过。
- 建议：验收 grep 改为排除 task 自身目录（如 `grep -rn ... docs/ --exclude-dir=tasks` 或归档后再验）。文档改动本身已满足语义，不影响本 task 产出质量。

### T002_code_f002 — window-management.md URL 说明提及 `v=<version>` 但代码 URL 构造器不产出该参数

- 严重度：low
- 位置：`docs/specs/window-management.md:14`
- 问题：新 URL 说明写 "tray 菜单额外从 hash 解析 `v=<version>` 上报版本"，但 `window-manager.ts` 的 `getRendererUrl` 只产出 `?ou_theme=${theme}#${route}`，不含 `v=`。该不一致旧版已有，T002 重写此行时沿用 tray 版本注释，未引入新错误但也未消除。
- 建议：超出本 task 范围（tray 版本注入路径独立问题），记录为后续 task 排查 tray `v=<version>` 注入点；本 task 不阻断。

## 结论

通过。5 个文件的 route 同步改动全部与代码真相对齐（WINDOW_CONFIGS / App.tsx / preload route switch / getRendererUrl），TokenStatsView 章节组件清单与数据管线函数名逐一核对无误，window-management 四行表格尺寸/特征与 WINDOW_CONFIGS 完全一致。非 route 语义正确保留未误改。两条 low finding 均为 spec/文档边界问题，不影响 route 同步正确性，不阻断。
