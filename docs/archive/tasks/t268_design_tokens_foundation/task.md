---
tid: "t268"
slug: "design_tokens_foundation"
title: "设计 token 基础设施：DESIGN.md 落库 + Tailwind v4 @theme 接入 + 字体自打包 + 强调色统一入口"
status: "done"
branch: "t268_design_tokens_foundation"
worktree: ""
review_level: "single"
diff_anchor: "768765b522734740b27244c40443e687188c5e1d"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 实现：`scripts/designmd.ts`（DESIGN.md front matter 嵌套 YAML 解析 → @theme CSS 导出区，drift check）；globals.css 顶部 @custom-variant dark + 导出区（114 token）+ 语义层（accent 五档/派生、兼容桥 --blue→--accent、@font-face Inter+JetBrains）；theme.ts apply_accent（预设 hex→key、自定义 hex→base、非法/缺失→blue）。
- SPIKE 字体：@fontsource 包内 woff2 拷贝到 assets/fonts + @font-face（避开 pnpm add 触发 better-sqlite3 原生重建）。
- 关键验证：黑盒启动主面板——--color-surface=#e7eaf1（light）、dark 切换=#0c0e13、--accent=#3d7afd、--blue=var(--accent)、fontFamily=Inter Variable；构建产物含 bg-surface 工具类 + --color-surface 明暗覆盖；真实 drift check passed。
- 踩坑：语义层初版 `--color-surface: var(--surface)` 引用未定义 --surface（@theme 导出名是 --color-surface），computed 为空；改 light 用 @theme 默认、dark 覆盖 -dark。@font-face 相对路径从 styles/ 到 assets 需 `../assets/fonts/`（初版 ./assets 404）。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-09 05:00 UTC+8)

| finding_id    | severity  | status | rationale                                                                                               | fix_ref                                  |
| ------------- | --------- | ------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| t268_gen_f001 | important | 已修   | --primary-foreground 改引用 --color-on-primary（原 var(--on-primary) 未定义）                           | globals.css 语义层                       |
| t268_gen_f002 | important | 已修   | designmd.test.ts 加真实 drift 门禁（默认路径 check_drift，手工改动导出区即失败）                        | tests/unit/main/scripts/designmd.test.ts |
| t268_gen_f003 | important | 已修   | dark 语义块补全全部 22 个暗色覆盖（surface-raised/field-bg/menu-bg/on-surface-muted/risk-_/agent-_ 等） | globals.css .dark 块                     |
| t268_gen_f004 | important | 已修   | appearance_section accent onClick 改调 apply_accent（写 --accent + 派生随动，live 生效）                | appearance_section.tsx                   |
| t268_gen_f005 | minor     | 已修   | 实施笔记 token 数 193→114                                                                               | task.md                                  |
| t268_gen_f006 | minor     | 已修   | @custom-variant dark 补后代匹配（.dark \*）                                                             | globals.css                              |
| t268_gen_f007 | minor     | 已修   | 补五档 accent × light/dark 矩阵测试（theme.test.ts）                                                    | theme.test.ts                            |
| t268_gen_f008 | minor     | 已修   | designmd 字阶注释改实际行为（fontWeight/lineHeight 不导出）                                             | scripts/designmd.ts                      |

### Round 2 (2026-08-09 05:20 UTC+8)

| finding_id    | severity | status | rationale                                                                                           | fix_ref              |
| ------------- | -------- | ------ | --------------------------------------------------------------------------------------------------- | -------------------- |
| t268_gen_f009 | minor    | 已修   | dark 块补 --color-primary + 5 个 --color-accent-_ 接线（-dark 值），bg-primary/bg-accent-_ 暗色正确 | globals.css .dark 块 |

### Round 3 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - 启动后窗口正常渲染无样式缺失：黑盒启动主面板，--color-surface/--accent/--blue 正确解析，fontFamily=Inter Variable
    - 明暗切换：data-theme=dark 后 --color-surface=#0c0e13、--accent=#5b8dff（dark 翻转全 29 个 -dark 对接线）
    - accent 五档切换即时生效：apply_accent 预设/自定义/非法映射 + 派生（color-mix strong/container/ring）+ 兼容桥 --blue 随动；重启从 config.accentColor 恢复
    - 自定义 accentColor hex 按派生规则生效，非法回落 blue（AC4 [deploy] 观感人工验证）
    - drift check：designmd.test.ts 真实门禁 + designmd:check passed（手工改导出区即失败）
    - 字体：Inter/JetBrains Mono woff2 + @font-face，CJK 回退系统（AC6 [deploy] 渲染人工）
    - 语义工具类：构建产物含 bg-surface 类 + --color-surface 明暗覆盖（AC7）
    - 视觉回归（AC8 [deploy] 人工对照）
    - 单测 2726 全绿（designmd 6 + accent 10 + 存量）

### Reviewer verdict

`single`：

- Round 1 general：FAIL
- Round 2 general：FAIL
- Round 3 general：PASS

### 结果摘要

- DESIGN.md token 层落地：designmd export/drift 门禁、@theme 全量 token（114）、accent 单变量体系 + 兼容桥、明暗翻转机制、字体资产；后续窗口迁移（t270-273）有 token 可取。
