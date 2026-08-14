# Task review t350（reviewer_focus: 通用）

- task：`t350_echarts_palette_cache`
- spec：`docs/tasks/t350_echarts_palette_cache/spec.md`
- diff_anchor：`7147b202e51c69213cf2103660b2316a0c4ce0eb`
- target：`git diff 7147b202e51c69213cf2103660b2316a0c4ce0eb`
- round：1
- reviewed_at：2026-08-13 22:57 UTC+8

## Findings

### t350_gen_f001 - MutationObserver 路径 revision 递增但不清 palette_cache，与 notify 路径不对称

- 严重度：minor
- 锚点：行为缺陷（资源累积）+ 与 in-code 注释意图不一致；AC-002 可观测行为（revision 变化后重建）不受影响
- 位置：`src/renderer/lib/echarts_token_resolver.ts:177-186`（observer 回调），对照 `:206-207`（notify 清缓存）与 `:307-309` 注释
- 问题：`notify_chart_palette_change()` 在 `palette_revision += 1` 后执行 `palette_cache.clear()`，注释写明「revision 变化即清缓存（主题切换重建 palette；避免 key 无限累积）」。但 `ensure_observer()` 里的 MutationObserver 回调同样递增 `palette_revision`（`:181`），却不清理 `palette_cache`。由于缓存 key 含 revision，旧 key 条目（如 `dark:0`）不会再被命中，但会永久滞留模块级 Map 中——每个「未配对 notify 的 attribute 变更」（class/style/data-theme 被外部直接改、或 observer 单独触发）都会残留一个孤立条目。当前应用内主题切换（`theme.ts:8-9`、`usageboard-web.ts:128-129`）与强调色变更（`theme.ts:55-56`）均同步调用 `notify_chart_palette_change()` 已清缓存，故实际累积有限、且无脏读（正确性由 key 含 revision 兜底）；但「避免 key 无限累积」的注释承诺在 observer 路径并不成立，属实现与注释不一致。
- 建议：observer 回调 `palette_revision += 1`（`:181`）旁补 `palette_cache.clear()`，与 notify 路径对称，一次性消除该路径的孤立条目累积。

### t350_gen_f002 - resolve_chart_palette 缓存 key 不含 root，root 仅首次构建生效（latent API 陷阱）

- 严重度：minor
- 锚点：行为缺陷（潜在错误命中，当前无触发方）；spec 上下文区风险节已选 (theme, revision) 为「完整标识」，故不阻断
- 位置：`src/renderer/lib/echarts_token_resolver.ts:312-314`（`palette_cache_key`）、`:321-333`（`resolve_chart_palette`）
- 问题：导出函数 `resolve_chart_palette(theme, root = current_root())` 接受显式 root，但缓存 key 仅 `${theme}:${revision}`，不含 root。同一 (theme, revision) 下若调用方以不同 root 调用，命中将返回先前以另一 root 构建的 palette——root 参数语义被缓存静默忽略。已核对生产调用方（`chart-data.ts`、`TokenStatsView.tsx`、`SessionTable.tsx`）全部省略 root（默认 `document.documentElement`），故当前无实际错误；但导出签名承诺按 root 解析，属 latent 行为陷阱。附带：命中缓存路径不再调用 `ensure_observer()`，若 root 元素被替换（SPA 重新挂载 documentElement 的极端场景），observer 不会重挂到新 root，revision 停止递增，缓存将无限期陈旧——当前无此类调用方，不构成实际 bug。
- 建议：在 `resolve_chart_palette` 或 `palette_cache_key` 补注释声明「root 仅用于首次构建，缓存按 (theme, revision) 去重，调用方须传观察根（documentElement）一致」；或若 root 需参与去重则把 root 纳入 key。

## 结论

- 前轮 finding 复核：Round 1，无前轮
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
  - `ensure_observer()` 在缓存命中路径不再执行，但首次构建（cache 必空）与 `subscribe/get_revision` 均会安装 observer，任一真实流程 observer 均先于命中安装，不构成缺陷。
  - 「token 变更未触发 observer 也未触发 notify 时缓存陈旧」属 spec 上下文区风险节已接受的 (theme, revision) 设计取舍；已扫描确认应用内无运行时 stylesheet 注入（`grep insertRule/CSSStyleSheet/style.textContent` 无命中），主题/强调色变更均经 attribute + notify 双路径，不据此出 finding。
  - AC-001 测试对 `getComputedStyle` 双重 `vi.spyOn`（beforeEach + 测试内）——实测运行通过，vitest 正确嵌套，计数无误。
- 总体判断：AC-001/AC-002 均已实现且测试触达可观察行为（getComputedStyle 计数），无未解决 critical/important，2 条 minor 供处置表登记。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`——重跑 `pnpm vitest run tests/unit/renderer/lib/token-stats/palette.test.ts`，6 例全过；`palette.test.ts:134-157` 断言首次 resolve 后 `getComputedStyle` 计数 >0、后续 `palette_for`/`top_category_color`/`agent_color` 计数为 0。
- AC-002：`re_verified`——同上运行；`palette.test.ts:159-178` 断言 `notify_chart_palette_change()` 后 `palette_for` 重建（`getComputedStyle` 计数 >0），且实现侧 notify 清缓存 + key 含 revision 双机制均可在代码中定位。

coverage = 2 / 2

reviewed_scope: e47807b638421af1

verdict: PASS
