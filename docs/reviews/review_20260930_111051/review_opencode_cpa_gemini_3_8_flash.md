# 代码与文档审阅报告

## 1. 本路模型标识

- Agent / 模型：opencode / cpa/gemini-3.8-flash
- 审阅时间：2026-09-30
- 审阅模式：单模块整段全量审阅（不抽样）

______________________________________________________________________

## 2. 审阅范围

- 仓库根目录：`/Users/karson/kar/code/omni_panel`
- 范围区间：`origin/main..HEAD`（16 commits，77 文件，+8129 / -299）
- 涉及提交：
    - `0232e50e` chore(env): upgrade project toolchain to pnpm 11
    - `fd69652a` refactor(session): extract flowercloud DOM snapshot module and harden refresh path
    - \`f62d434c fix(flowercloud): treat a snapshot without capture time as stale
    - `39a5cca8` fix(logger): collect redaction ranges before replacing
    - `e3780bba` fix(muse): report real elapsed time when discovery fails before scanning
    - `20608864` docs: record flowercloud usage contracts, pending items and handoff
    - `c6266639` task(t535,t536,t537): create flowercloud background-first, lifecycle and multi-service tasks
    - `2bcc8f4c` docs(pending): archive p267/p268/p269 into t535/t536/t537
    - `56c01c1b` docs(spike): verify flowercloud challenge shape and capture-window behavior (s040, d063)
    - `6b3ab48e` feat(session): make flowercloud snapshot capture background-only (t535)
    - `11200366` docs(t536): accept instrumentation-first plan for quit-origin localization
    - `289f1a8c` merge(t535): t535_flowercloud_background_first_refresh
    - `3b8ea11b` feat(main): trace quit request sources and harden flowercloud session lifecycle (t536)
    - `091f259d` feat(flowercloud): per-service multi-service metrics collection and display (t537)
    - `7219929f` merge-chain(t537)
    - `9eb54a76` fix(renderer): show reset date/clock on ratio usage rows (flowercloud refresh time)
- 重点文件：`src/main/core/session/flowercloud_dom.ts`、`src/main/core/session/session-manager.ts`、`src/main/core/session/session-types.ts`、`src/main/core/quit_source.ts`、`src/main/core/scheduler/refresh-service.ts`、`src/main/core/logging.ts`、`src/renderer/components/UsageRows.tsx`、`src/renderer/lib/provider-usage.ts`、`src/shared/lib/logger.ts`、`connectors/flowercloud/connector.ts`、`connectors/muse/connector.ts`、`eslint.config.ts`、`mise.toml`、`package.json`、`pnpm-workspace.yaml` 及对应测试与蓝图规格。

______________________________________________________________________

## 3. 8 视角审查分节

### 3.1 安全 (Security)

#### [SEC-001] [Low] `persist_log_line` 同步兜底日志绕过 scrubber 脱敏处理

- **位置**：`src/main/core/quit_source.ts:84-110` L84-L110
- **证据/引用**：
    ```ts
    function persist_log_line(
        module_name: string,
        message: string,
        meta: Record<string, unknown>,
    ): void {
        try {
            const file_path = getCurrentLogFilePath(getDataRoot());
            mkdirSync(dirname(file_path), { recursive: true });
            const trace = typeof meta["trace_id"] === "string" ? meta["trace_id"] : undefined;
            appendFileSync(
                file_path,
                `${JSON.stringify({
                    ts: format_local_iso(),
                    level: "info",
                    module: module_name,
                    message,
                    meta,
                    ...(trace !== undefined ? { trace_id: trace } : {}),
                })}\n`,
            );
        } catch (error) { ... }
    }
    ```
- **现象/影响**：
    `persist_log_line` 作为 `quit_source` 与关停日志在 transport 不可用或日志级别过滤时的同步文件写入兜底，直接对 `message` 和 `meta` 执行 `JSON.stringify` 并写入活动日志，未经过 `scrubber.scrub_text(...)`。
    当前调用方传参为 `QuitRequestRecord`（含 `source`、`action`、`exit_code`、`trace_id`）及关停元数据（`exit_source`、`trace_id`），现阶段不存在敏感信息泄漏；但若后续扩展元数据传入环境参数或请求上下文，可能因缺少脱敏环节导致敏感串直接落盘。
- **修复建议**：在 `JSON.stringify` 序列化后或写入前，调用 `scrubber.scrub_text` 对输出字符串作一次脱敏防护，或对 `meta` 严格限定仅写入白名单字段。
- **置信度**：90
- **Severity**：Low

______________________________________________________________________

### 3.2 正确性 (Correctness)

#### [COR-001] [Medium] `write_flowercloud_html` 内 CAS 基线读取时机滞后，无法防护长达数十秒的轮询期并发修改

- **位置**：`src/main/core/session/flowercloud_dom.ts:262-294` L262-L294
- **证据/引用**：
    ```ts
    export async function write_flowercloud_html(
        vault: VaultBackend,
        instance_id: string,
        html: string,
        cookie_override?: string | null,
        options?: { is_cancelled?: () => boolean },
    ): Promise<boolean> {
        if (options?.is_cancelled?.() === true) return false;
        const key = keyFor(instance_id, SESSION_COOKIE_KEY);
        const raw = await vault.get(key);
        if (!raw) {
            log.warn(`FlowerCloud DOM refresh found no stored session for ${instance_id}`);
            return false;
        }
        ...
        if (options?.is_cancelled?.() === true) return false;
        const current = await vault.get(key);
        if (current !== raw) {
            log.warn(
                `FlowerCloud DOM refresh skipped stale write for ${instance_id}: stored session changed while capturing`,
            );
            return false;
        }
        await vault.set(key, build_flowercloud_secret(cookie, html));
        return true;
    }
    ```
    注释说明：`// 落盘前最后一次校验：读数期间可能被抢占（cancelled），也可能有更新的快照或新登录凭据写进 vault——两种情况都不能用本轮旧数据覆盖。`
    而在 `run_flowercloud_snapshot`（L483-L547）中：
    1. `seed_partition_cookies` 执行；
    2. `poll_flower_usage_html` 轮询耗时可达数秒至 45 秒；
    3. 轮询结束后才调用 `write_flowercloud_html`。
- **现象/影响**：
    基线 `raw` 是在 `write_flowercloud_html` 进入后才读取的，与 `current` 读取相隔仅数微秒。若在 `poll_flower_usage_html` 执行的数十秒内，外部（如 CLI、导入恢复或并发流程）更新了 vault 中的 session 凭据，`write_flowercloud_html` 读到的 `raw` 就已经是被更新后的新值，随后的 `current !== raw` 检查失效（恒相等），导致本轮抓取的旧 HTML 覆盖最新的登录载荷。单测 `refuses to overwrite a session that changed while capturing` 仅 mock 了连续两次 `vault.get` 返回不同值，掩盖了真实的捕获开始至写入的耗时窗口。
- **修复建议**：将捕获开始时（如 `run_flowercloud_snapshot` 起点）读到的初始 vault 载荷 `initial_secret` 作为基准传入 `write_flowercloud_html`（如 `expected_vault_value?: string`），落盘前比对 `current !== expected_vault_value`。
- **置信度**：95
- **Severity**：Medium

______________________________________________________________________

### 3.3 契约·类型 (Contracts & Types)

#### [TYP-001] [Info] `read_page_hint` 与 `read_service_hint` 容错行为一致但存在微小冗余定义

- **位置**：`src/main/core/session/flowercloud_dom.ts:470-496` L470-L496
- **证据/引用**：
    ```ts
    async function read_page_hint(window: SessionWindow): Promise<string> {
        try {
            const hint = await window.read_page_hint?.();
            if (!hint) return "";
            return `${hint.url} ${hint.title}`.trim();
        } catch {
            return "";
        }
    }

    async function read_service_hint(window: SessionWindow): Promise<string | null> {
        try {
            const hint = await window.read_page_hint?.();
            return hint?.url ?? null;
        } catch {
            return null;
        }
    }
    ```
- **现象/影响**：
    两个 helper 函数均对 `window.read_page_hint?.()` 做 optional chaining 和 catch，一个供失败日志格式化（拼接 url + title），一个供服务 id 精确匹配 URL。类型定义完备且对不支持 `read_page_hint` 的 mock/测试窗口安全回退，无功能缺陷。
- **修复建议**：可合并为统一读取 hint 结构体，消费侧按需解构。
- **置信度**：95
- **Severity**：Info

______________________________________________________________________

### 3.4 性能·资源 (Performance & Resources)

#### [PERF-001] [Low] `poll_flower_usage_html` 服务导航后即时 hint 校验在慢速网络下的抖动风险

- **位置**：`src/main/core/session/flowercloud_dom.ts:402-414` L402-L414
- **证据/引用**：
    ```ts
    await window.loadURL(flower_details_url(login_url, target_id));
    ...
    const hint = await read_service_hint(window);
    if (hint !== null && !hint_belongs_to_service(hint, target_id)) {
        failed.set(target_id, "导航未到达该服务的详情页");
        current_id = null;
    }
    ```
- **现象/影响**：
    `loadURL` 在 Electron 中 resolve 时页面可能刚完成框架加载或存在前端 router 重定向。若此时 `window.read_page_hint?.()` 取得的 `location.href` 尚停留在上一页面（例如 `clientarea.php` 列表页），则该服务会直接被判定为 `导航未到达该服务的详情页` 并加入 `failed` 集合，不再给予重试或下一次轮询机会。虽然后续 L427 在用量稳定时有二次校验，但此处的初次立即校验过于敏感，可能造成误判。
- **修复建议**：导航后首次 hint 读取若不匹配，不宜立即判定为服务失败，可仅记录未就绪并在后续 `poll_ms` 循环中继续比对，直至超时或匹配成功。
- **置信度**：85
- **Severity**：Low

______________________________________________________________________

### 3.5 架构·可维护性 (Architecture & Maintainability)

#### [ARC-001] [Info] 单测文件 `tests/unit/session/session-manager.test.ts` 超过 1900 行

- **位置**：`tests/unit/session/session-manager.test.ts:1-1912` L1-L1912
- **证据/引用**：
    文件总行数达到 1912 行，包含了通用 session 登录、kimi_web 特殊处理、mimo 测试以及大量花云快照生命周期测试（新增约 620 行）。
- **现象/影响**：
    测试上下文过长，包含不同职责测试用例（如 t536 退出隔离、flowercloud snapshot 互斥、settle 机制等），维护和定位效率略受影响。
- **修复建议**：建议将 `describe("t536 花云会话异常只影响花云实例...")` 及花云专有生命周期测试剥离为独立的 `tests/unit/session/session_manager_flowercloud.test.ts`。
- **置信度**：90
- **Severity**：Info

______________________________________________________________________

### 3.6 健壮性·可观测性 (Robustness & Observability)

#### [ROB-001] [Low] `has_log_transports()` 判定在非空但未初始化的 transport 下可能漏走同步兜底

- **位置**：`src/shared/lib/logger.ts:180-183` 与 `src/main/core/quit_source.ts:71-74`
- **证据/引用**：
    ```ts
    export function has_log_transports(): boolean {
        return transports.length > 0;
    }
    ```
    在 `quit_source.ts`:
    ```ts
    if (!has_log_transports() || !is_log_level_enabled("info")) {
        persist_log_line("quit-source", message, { ...entry });
    }
    ```
- **现象/影响**：
    如果外部测试或特定 CLI 模式注册了 console transport（`transports.length > 0`），但实际文件 transport 并未挂载（例如 CLI 控制子命令），`has_log_transports()` 会返回 `true`，此时不会触发 `persist_log_line`。如果该 console transport 的 stdout 被丢弃或非持久化，可能导致日志文件内缺失退出来源记录。
- **修复建议**：评估是否需要专门提供 `has_file_transport()` 判定，或保持 `persist_log_line` 无论 transport 存在与否，均对关键的退出入口保障落盘。
- **置信度**：80
- **Severity**：Low

______________________________________________________________________

### 3.7 测试·规格 (Testing & Specs)

#### [TST-001] [Info] `tests/unit/renderer/components/usage_rows.test.tsx` 缺少多服务超长用量数值对 `resetAt` 的截断/溢出布局断言

- **位置**：`tests/unit/renderer/components/usage_rows.test.tsx:144-187` L144-L187
- **证据/引用**：
    测试覆盖了 `shows reset date/clock for ratio periods (花云类 ratio 展示套餐刷新时间)` 与 `keeps reset columns empty for ratio periods without resetAt`，但测试用例给定的数值为 `34.56/150`。
- **现象/影响**：
    commit `9eb54a76` 移除了 ratio 行对 `reset_time` 的隐藏逻辑，提交说明明确提到 `value 文本右对齐、超宽向左溢出，不侵入 date 列`。目前单测仅断言了 DOM 节点的文本存在性，缺少对极大数值（如 `1228.80GB / 2048.00GB`）在有限宽度容器下的 CSS class 或 DOM 溢出样式回归断言。
- **修复建议**：补增一组长文本数值用例，验证包含较长 ratio 字符串时 date / clock 容器的类名和属性未受损。
- **置信度**：85
- **Severity**：Info

______________________________________________________________________

### 3.8 文档规范 (Documentation & Conventions)

#### [DOC-001] [Medium] `docs/handoff.md` 处于过时状态，未同步 t535/t536/t537 完成与合入信息

- **位置**：`docs/handoff.md:1-12` L1-L12
- **证据/引用**：
    ```markdown
    # handoff

    - 最后更新：2026-09-29
    - branch：`main`
    - head_commit：`8b15016d`（工作区另有未提交改动，见下）
    - 当前状态：花云 DOM 快照链路的审查修复已落在工作区，未提交、未走 task 流程。

    ## 2026-09-29 花云 DOM 快照链路审查修复（工作区未提交）
    ```
- **现象/影响**：
    分支 `main` 上已经完成了 `t535`、`t536`、`t537` 三个 task 的全流程开发与 merge-chain 合入（当前 HEAD 为 `9eb54a76`），但交接文档 `docs/handoff.md` 的头部与正文仍然停留在 2026-09-29 的「未提交、未走 task 流程」描述，存在明显的文档事实滞后（doc drift）。违反了《AGENTS.md》中关于 `docs/handoff.md` 需记录当前最新状态的约束。
- **修复建议**：更新 `docs/handoff.md`，将旧的未提交段落归档或更新为 2026-09-30 最新交接记录（记录合入的 16 个 commit、HEAD commit `9eb54a76`、三个 task 的落地闭环状态）。
- **置信度**：100
- **Severity**：Medium

______________________________________________________________________

## 4. Spec 合规 (Spec Compliance)

1. **t535 (`flowercloud_background_first_refresh`)**：

    - AC-001 / AC-002：快照窗口移除了 `present_for_capture` 与 `reveal`，抓取始终在 `hidden: true` 的窗口中运行，不抢焦点；已通过 `tests/unit/session/flowercloud_dom.test.ts` 中 `never surfaces the capture window` 断言 `shown === 0, shown_inactive === 0, opacity_calls === 0`。
    - AC-003 / AC-004：抓取超时与质询失败均返回有界分类原因（人机验证/登录失效/拦截/网络等），上次成功观测转为 `stale: true` 并附加 `last_error`，连接器不重放旧 HTML；已在 `refresh-service.test.ts` 验证。
    - AC-005 / AC-006：`session-manager.ts` 的 `finally` 块强制执行 `if (!window.isDestroyed()) window.close()`，并从 `in_progress` 与 `flower_snapshots` 中释放登记，彻底消除了失管窗口与重复采集问题。
    - AC-007：作为 `[deploy]` 项正确保留为人工与真实环境验证项。

2. **t536 (`flowercloud_login_exit_lifecycle`)**：

    - AC-001：全部 12 处退出点统一走 `quit_source`，日志输出 `source`、`action`、`exit_code`、`trace_id`；`tests/unit/main/quit_source.test.ts` 内置源码扫描门禁 + eslint `no-restricted-properties` 双重约束。
    - AC-002 / AC-003：阻塞页耗尽、关窗取消、登录超时均只影响单实例，未调用退出 API，其他实例刷新正常；`session-manager.test.ts` 均有显式单测保障。
    - AC-004：提取 `handle_browser_window_focus`，在 `main_panel_controller.test.ts` 针对 popup/floating/pinToTop/destroyed 等全部焦点组合进行了系统测试。

3. **t537 (`flowercloud_multi_service_metrics`)**：

    - AC-001：多服务输出独立 observation，`account_id` 格式为 `flowercloud_service_<id>`，单服务回退为 `flowercloud_default`；
    - AC-002 / AC-003：分段 composite 格式 (`<!--omni-flower id=...-->`) 在连接器和宿主间一致；卡窗切片在任一窗口不完整时整体回退至逐服务 HTTP 补数，失败项通过 `report_failed_account` 登记，不阻塞其余服务；
    - AC-004：前端 `provider-usage.ts` 与 `flowercloud_multi_service_card.test.tsx` 保证了多账号实例下回退采集层服务名展示，不被实例备注覆盖。

______________________________________________________________________

## 5. 项目亮点 (Strengths)

1. **退出来源追溯漏斗设计严密（`src/main/core/quit_source.ts`）**：
    退出机制从分散的 `app.quit()` / `app.exit()` 调用收敛到统一漏斗，共享进程级 `trace_id`，关停日志自动关联触发源，配合 eslint AST 门禁与单测调用点全量扫描，形成了非常可靠的架构防线。
2. **凭据脱敏算法健壮性重构（`src/shared/lib/logger.ts`）**：
    通过分批正则、长度降序、在原始文本上收集匹配区间并进行区间合并替换，彻底杜绝了因短凭据先替换而造成长凭据留下可见片段（`prefix***suffix`）的泄漏缺陷；并设立 8192 字符上限规避整页快照导致的正则灾难性回溯。
3. **基于实测证据驱动的架构决策（s040 / s041 / d063）**：
    在真实 Electron 44 环境下验证了 `show:false` 窗口内 `document.hidden === false`，并实测证实 `show()` 反而会将托管挑战升级为交互质询，以此推翻原有的前台化假设，实现了彻底的后台静默刷新，架构取舍具备扎实的实证基础。
4. **防御性极强的三级多服务解析降级（`connectors/flowercloud/connector.ts`）**：
    解析路径支持 分段 Composite -> 卡窗切片 -> 逐服务 HTTP 详情页补数。针对 DOM 结构漂移，确立了「任一窗口不完整即丢弃切片结果、全量退化为安全 HTTP 详情页抓取并隔离失败」的准则，杜绝了错配风险。

______________________________________________________________________

## 6. Appendix 溯源

- `COR-001`: `src/main/core/session/flowercloud_dom.ts:262-294`, `tests/unit/session/flowercloud_dom.test.ts:167-184`
- `DOC-001`: `docs/handoff.md:1-12`, commit `9eb54a76`, commit `20608864`
- `SEC-001`: `src/main/core/quit_source.ts:84-110`
- `PERF-001`: `src/main/core/session/flowercloud_dom.ts:402-414`
- `ROB-001`: `src/shared/lib/logger.ts:180-183`, `src/main/core/quit_source.ts:71-74`
- `ARC-001`: `tests/unit/session/session-manager.test.ts:1-1912`
- `TYP-001`: `src/main/core/session/flowercloud_dom.ts:470-496`
- `TST-001`: `tests/unit/renderer/components/usage_rows.test.tsx:144-187`
