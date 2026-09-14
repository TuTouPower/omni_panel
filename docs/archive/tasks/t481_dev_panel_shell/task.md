---
tid: "t481"
slug: "dev_panel_shell"
title: "开发面板骨架 + commit 历史"
status: "done"
branch: "t481_dev_panel_shell"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "35d8c0152c7c1ab6091736dfe675fb6a1519463c"
depends_on: ""
conflicts_with: ""
note: "新增第5个面板 route=dev：窗口/导航/托盘入口 + commit 热力图(React+echarts) + 扫描根配置；来源 project_manager/my_life 迁移"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

### 2026-09-14 文档修订（review 意见落地，未实施）

本轮按已批准审阅意见修订 `spec.md`，未开始实现：

- 删除 Web「只读渲染、不做写操作」与非范围「不接受网络输入」等矛盾：改为 **Web 完整操作**（配置扫描根/cutoff/作者、发起扫描、查进度结果错误），宿主执行，两端新鲜度一致（AC-003/007/010）。
- 补实际 HTTP/bridge/宿主通路要求，不能只有 mock 展示；未接通不得伪 PASS。
- git 数据契约明确为**目标契约**（非引用外部仓）：author(`%an/%ae`) vs committer(`%cn/%ce`)、日期时区归一与标注、worktree/重复根按真实 git dir 去重、全局 git 身份缺失降级策略；新增 AC-011/012。旧 AC-001..010 编号保持不动。
- 补并发扫描/部分失败/资源边界（AC-013）；`git` GUI 定位 spike 保留为 `UNVERIFIED-SPIKE`，并明确 shell 成功不代表 GUI 成功，真实 GUI 验证属 `[deploy]`。
- 来源注记：外部迁移仓内容为历史记录引用，本 task 不访问外部仓、不冒充已核实。

调查路径：读本仓 `docs/tasks/t481_dev_panel_shell/spec.md` 原稿、`src/renderer/hooks/use-route.ts`、`src/renderer/lib/panel-navigation.ts`、`src/renderer/components/ui/PanelTitleBar.tsx`、`src/main/window/window-manager.ts`、`src/main/core/session-history/codex-extractor.ts`（边界对齐参考）。

### 2026-09-15 preflight spike

- `execFile("git", ["--version"])` 在当前宿主环境返回 `git version 2.51.1`；实现采用无 shell 的宿主调用，真实 GUI PATH 保留 `[deploy]` 签收。
- 当前 checkout 基准为 2,045 commits；完整 `git log --date=iso-strict --numstat` 输出 1,164,759 bytes / 19,628 行，耗时 1,311ms。按该实验确定每个扫描根 30s 超时上限，超时逐根报错并继续。

### 2026-09-15 实施完成

- 新增主进程 Git 扫描器与并发管理器：无 shell `execFile`、author-date 本地时区归一、author/committer 分离、全局身份缺失时可见降级、真实 git-common-dir 去重、逐根超时/部分失败/取消和单调 data version。
- 接通 `AppConfiguration.devPanel`、桌面 IPC、LocalAPI/Web bridge、第五个 `dev` route、独立 singleton 窗口、托盘入口和 PanelTitleBar 五面板导航；桌面与 Web 共享同一宿主扫描状态。
- 以 ECharts calendar heatmap 呈现日 commit 数与仓库明细，扫描根/cutoff/当前作者开关在面板内编辑并通过 config-store 持久化；同步 architecture/domain/decision/spec 索引和 dev-panel spec。
- 定向回归：6 个文件 / 116 tests PASS，另有热力图纯函数 1 test PASS；Git 临时仓库覆盖 cutoff、author/committer、身份过滤/降级、重复根、缺失根和并发合并。
- 类型检查、ESLint、Prettier、dependency-cruiser、Electron/Web 生产构建 PASS；构建仅保留仓库既有 CSS 优化器 warning。直接 Knip 仍报告仓库既有 unlisted binaries/unused exports，未命中 t481 新增导出。
- 全量 Vitest 3,704 tests：3,336 PASS、2 skipped、366 failures；失败集中于环境缺失 `better-sqlite3` native binding 及未被本 task 修改的 refresh-service 6 个用例，t481 相关测试均 PASS。该环境证据不冒充业务失败。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1（2026-09-15 13:05 UTC+8）

Round 1 code/test review 零 finding。review scope fingerprint 为 `57d4242ef0b93440`。

无 finding 时写“Round N 零 finding”。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足；桌面托盘真实弹出、GUI PATH 和真实大仓库部署态按 spec 保留人工签收。
- 测试：定向 6 files / 116 tests 与热力图 1 test PASS；全量 3,336 PASS / 2 skipped，366 个环境或既有未改动失败已记录。
- 黑盒：TypeScript、ESLint、Prettier、dependency-cruiser、Electron/Web 构建 PASS；Knip 仅报告既有基线项；完整原生 SQLite 黑盒受 binding 缺失阻塞。
- review：Round 1 code + test PASS，零 finding；详见 [`review_code.md`](review_code.md) / [`review_test.md`](review_test.md)。
- AC 证据：见 `handoff.json`

### 结果摘要

- 开发面板从配置、宿主 Git 扫描、桌面 IPC、LocalAPI/Web bridge 到第五面板 UI 已闭环；扫描结果携带 `scanned_at`/`data_version`，重复请求复用在途扫描。
- 环境遗留仅为 native SQLite/既有 refresh-service 与当前任务无关的全量测试限制；真实桌面托盘/GUI PATH 需部署环境签收。
